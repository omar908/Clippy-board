import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, relative, isAbsolute, basename } from "node:path";
import { checkVersions, createReleasePlan } from "./release-plan.mjs";

const base = { event: "push", ref: "refs/heads/main", version: "0.2.0", previousVersion: "0.1.0", commit: "merged-sha" };

test("version bump on main publishes a tag targeting the checked-out merged commit", () => {
  assert.deepEqual(createReleasePlan(base), { tag: "v0.2.0", commit: "merged-sha", build: true, publish: true });
});
test("pull requests, feature pushes and unchanged main versions never publish", () => {
  for (const change of [{ event: "pull_request" }, { ref: "refs/heads/feature" }, { previousVersion: "0.2.0" }]) {
    assert.equal(createReleasePlan({ ...base, ...change }).build, false);
    assert.equal(createReleasePlan({ ...base, ...change }).publish, false);
  }
});
test("reruns can finish the same release but cannot move a tag", () => {
  assert.equal(createReleasePlan({ ...base, tagCommit: "merged-sha" }).publish, true);
  assert.throws(() => createReleasePlan({ ...base, tagCommit: "other-sha" }), /immutable/);
});
test("version tags must match the checked-out version", () => {
  assert.equal(createReleasePlan({ ...base, ref: "refs/tags/v0.2.0" }).publish, true);
  assert.throws(() => createReleasePlan({ ...base, ref: "refs/tags/v0.3.0" }), /does not match/);
});
test("manual runs build artifacts without publishing", () => {
  assert.deepEqual(createReleasePlan({ ...base, event: "workflow_dispatch" }), { tag: "v0.2.0", commit: "merged-sha", build: true, publish: false });
});
test("main version decreases and malformed stable versions are rejected", () => {
  assert.throws(() => createReleasePlan({ ...base, previousVersion: "0.3.0" }), /must increase/);
  assert.throws(() => createReleasePlan({ ...base, version: "0.2.0-beta" }), /Invalid release/);
  assert.equal(createReleasePlan({ ...base, version: "0.10.0", previousVersion: "0.9.0" }).publish, true);
});
test("version validation covers app metadata, both lockfiles and the About label", () => {
  const root = mkdtempSync(join(tmpdir(), "clippy-version-"));
  try {
    mkdirSync(join(root, "src-tauri"));
    const json = (file, value) => writeFileSync(join(root, file), JSON.stringify(value));
    json("package.json", { version: "0.2.0" });
    json("package-lock.json", { version: "0.2.0", packages: { "": { version: "0.2.0" } } });
    json("src-tauri/tauri.conf.json", { version: "0.2.0" });
    writeFileSync(join(root, "src-tauri/Cargo.toml"), '[package]\nname = "clippy-app"\nversion = "0.2.0"\n');
    writeFileSync(join(root, "src-tauri/Cargo.lock"), '[[package]]\nname = "clippy-app"\nversion = "0.2.0"\n');
    writeFileSync(join(root, "index.html"), "<div>Clippy-board v0.2.0</div>");
    assert.equal(checkVersions(root), "0.2.0");
    json("src-tauri/tauri.conf.json", { version: "0.1.0" });
    assert.throws(() => checkVersions(root), /disagree/);
    json("src-tauri/tauri.conf.json", { version: "0.2.0" });
    writeFileSync(join(root, "index.html"), "Clippy-board v0.1.0");
    assert.throws(() => checkVersions(root), /About version/);
  } finally {
    const child = relative(resolve(tmpdir()), resolve(root));
    if (!child || child.startsWith("..") || isAbsolute(child) || !basename(root).startsWith("clippy-version-")) {
      throw new Error("Refusing cleanup outside this test's temporary directory");
    }
    rmSync(root, { recursive: true });
  }
});
