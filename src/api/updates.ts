import { version as installedVersion } from "../../package.json";

const repository = "omar908/Clippy-board";
const endpoint = `https://api.github.com/repos/${repository}/releases/latest`;
const stableTag = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export async function checkLatestRelease() {
  const response = await fetch(endpoint, {
    credentials: "omit",
    headers: { Accept: "application/vnd.github+json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}`);

  const release = await response.json() as { tag_name?: unknown } | null;
  const tag = release?.tag_name;
  const latest = typeof tag === "string" ? stableTag.exec(tag) : null;
  const installed = stableTag.exec(`v${installedVersion}`);
  if (!latest || !installed) throw new Error("Invalid release version");

  for (let i = 1; i <= 3; i++) {
    const next = BigInt(latest[i]);
    const current = BigInt(installed[i]);
    if (next < current) return null;
    if (next > current) {
      return { version: latest[0].slice(1), url: `https://github.com/${repository}/releases/tag/${latest[0]}` };
    }
  }
  return null;
}
