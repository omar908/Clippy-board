import { readFileSync, appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const read = (root, file) => readFileSync(resolve(root, file), "utf8");

export function checkVersions(root = process.cwd()) {
  const pkg = JSON.parse(read(root, "package.json"));
  const lock = JSON.parse(read(root, "package-lock.json"));
  const tauri = JSON.parse(read(root, "src-tauri/tauri.conf.json"));
  const cargo = read(root, "src-tauri/Cargo.toml").match(/^version\s*=\s*"([^"]+)"/m)?.[1];
  const cargoLock = read(root, "src-tauri/Cargo.lock")
    .match(/\[\[package\]\]\r?\nname = "clippy-app"\r?\nversion = "([^"]+)"/)?.[1];
  const versions = { npm: pkg.version, npmLock: lock.version, npmRoot: lock.packages?.[""]?.version, tauri: tauri.version, cargo, cargoLock };
  if (!stableVersion.test(pkg.version)) throw new Error("App version must be a stable x.y.z version");
  if (Object.values(versions).some(version => version !== pkg.version)) {
    throw new Error(`App versions disagree: ${JSON.stringify(versions)}`);
  }
  if (!read(root, "index.html").includes(`Clippy-board v${pkg.version}`)) throw new Error("About version disagrees with package.json");
  return pkg.version;
}

function increased(version, previous) {
  if (!stableVersion.test(previous)) throw new Error(`Invalid previous app version: ${previous}`);
  const next = version.split(".").map(BigInt), old = previous.split(".").map(BigInt);
  for (let index = 0; index < 3; index++) {
    if (next[index] !== old[index]) return next[index] > old[index];
  }
  return false;
}

/** Pure policy: never tag a PR, move an existing tag, or release an unchanged
 * main version. A rerun may finish a release whose tag already targets this SHA.
 */
export function createReleasePlan({ event, ref, version, previousVersion, commit, tagCommit = null }) {
  if (!stableVersion.test(version)) throw new Error("Invalid release version");
  const plan = { tag: `v${version}`, commit, build: false, publish: false };
  if (event === "workflow_dispatch") return { ...plan, build: true };
  if (event !== "push") return plan;
  if (ref.startsWith("refs/tags/")) {
    if (ref !== `refs/tags/${plan.tag}`) throw new Error("Version tag does not match the application version");
  } else if (ref === "refs/heads/main") {
    if (previousVersion === version) return plan;
    if (previousVersion && !increased(version, previousVersion)) throw new Error("Main version must increase before publishing");
  } else return plan;
  if (tagCommit && tagCommit !== commit) throw new Error(`${plan.tag} already targets a different commit; tags are immutable`);
  return { ...plan, build: true, publish: true };
}

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();

function main() {
  const version = checkVersions();
  if (process.argv.includes("--check")) { console.log(`Version files agree: ${version}`); return; }
  const event = process.env.GITHUB_EVENT_NAME;
  const ref = process.env.GITHUB_REF ?? "";
  const commit = git("rev-parse", "HEAD");
  const tag = `v${version}`;
  const tagCommit = git("tag", "--list", tag) ? git("rev-parse", `${tag}^{commit}`) : null;
  let previousVersion;
  if (event === "push" && ref === "refs/heads/main") {
    const payload = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
    const before = payload.before;
    if (!/^[a-f\d]{40}$/i.test(before ?? "")) throw new Error("Missing or invalid previous main SHA");
    if (!/^0+$/.test(before)) previousVersion = JSON.parse(git("show", `${before}:package.json`)).version;
  }
  const plan = createReleasePlan({ event, ref, version, previousVersion, commit, tagCommit });
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(plan).map(([key, value]) => `${key}=${value}\n`).join(""));
  }
  console.log(JSON.stringify(plan));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
