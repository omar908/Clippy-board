import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { checkVersions } from "./release-plan.mjs";

const version = checkVersions();
const repository = process.env.GITHUB_REPOSITORY ?? "omar908/Clippy-board";
const publicKey = process.env.TAURI_UPDATE_PUBLIC_KEY?.trim();
if (!publicKey || !process.env.TAURI_SIGNING_PRIVATE_KEY?.trim()) {
  throw new Error("Set TAURI_UPDATE_PUBLIC_KEY and TAURI_SIGNING_PRIVATE_KEY before building a signed release.");
}
if (process.env.CLIPPY_RELEASE_TAG && process.env.CLIPPY_RELEASE_TAG !== `v${version}`) {
  throw new Error("Release tag does not match the application version.");
}

const releaseUrl = `https://github.com/${repository}/releases`;
const config = {
  bundle: { createUpdaterArtifacts: true },
  plugins: {
    updater: {
      pubkey: publicKey,
      endpoints: [`${releaseUrl}/latest/download/latest.json`],
      windows: { installMode: "passive" },
    },
  },
};
const configDir = mkdtempSync(join(tmpdir(), "clippy-updater-"));
const configPath = join(configDir, "updater.json");
try {
  writeFileSync(configPath, JSON.stringify(config));
  const build = spawnSync(process.execPath, [
    resolve("node_modules/@tauri-apps/cli/tauri.js"),
    "build", "--config", configPath, "--", "--locked",
  ], { stdio: "inherit" });
  if (build.error) throw build.error;
  if (build.status !== 0) throw new Error(`Tauri build failed with exit code ${build.status}`);
} finally {
  unlinkSync(configPath);
  rmdirSync(configDir);
}

const bundle = resolve("src-tauri/target/release/bundle");
const platforms = {};
for (const [format, suffix] of [["nsis", "_x64-setup.exe"], ["msi", "_x64_en-US.msi"]]) {
  const dir = join(bundle, format);
  const installers = readdirSync(dir).filter(name => name.endsWith(`_${version}${suffix}`));
  if (installers.length !== 1) throw new Error(`Expected one x64 ${format} installer for ${version}`);
  const [installer] = installers;
  const signature = readFileSync(join(dir, `${installer}.sig`), "utf8").trim();
  if (!signature) throw new Error(`Empty signature for ${installer}`);
  platforms[`windows-x86_64-${format}`] = {
    url: `${releaseUrl}/download/v${version}/${encodeURIComponent(installer)}`,
    signature,
  };
}
writeFileSync(join(bundle, "latest.json"), JSON.stringify({ version, platforms }, null, 2) + "\n");
console.log(`Created signed update manifest for v${version} (Windows x64 MSI and NSIS).`);
