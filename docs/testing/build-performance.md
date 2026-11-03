# Build and CI timing review

## Current assessment

A roughly five-minute successful Windows CI run (the latest duration reported by
the maintainer) is a reasonable baseline for this workflow. It installs tooling,
restores caches, runs frontend/browser/native tests, builds an embedded Tauri app,
and runs a native WebView2 smoke test. The earlier 13-minute estimate was corrected
to five minutes; no hosted per-step timing breakdown was available for this review.

A four-minute **release** build is plausible with the current profile and installer
generation. It is not an established target for every build. Cold dependencies,
hardware, available memory, toolchain updates, linking and installer generation
all affect elapsed time. A repeat debug build and a packaged release are different
measurements.

## Local measurements

Measured on the existing Windows development checkout after the warning cleanup,
with dependencies already compiled. These are not clean builds or hosted-runner
benchmarks. Incremental compilation was disabled and Cargo used one job to avoid
the memory-pressure failures previously observed on this machine.

| Command | Wall time | Result |
|---|---:|---|
| `cargo test --locked --all-targets -j 1 --timings` (in `src-tauri`) | 45.03 s | 34 tests passed; no Rust warnings |
| `npm run build:debug` | 34.25 s | Frontend built once; debug executable with embedded assets; no installers or Rust warnings |

Cargo reported 44.33 s for test compilation and 28.57 s for the debug build's Rust
phase. The tests themselves finished in a fraction of a second: compilation and
linking dominated this native test run.

The release profile remains `opt-level = 3`, `lto = true`, `codegen-units = 1`,
`panic = "abort"`, and stripped symbols. Higher optimization and full LTO trade
build time for optimized output. Do not weaken release settings just to improve
debug/PR timings without comparing runtime behavior and binary size first.
See the [Cargo profile reference](https://doc.rust-lang.org/cargo/reference/profiles.html).

## Changes made

- Removed an unused storage error binding and an unused `Arc` clone. The legacy
  storage-query fallback and deleted-history setup keep their existing behavior.
- Added `npm run build:debug`. Its flags live inside the script, ensuring
  `--debug --no-bundle` reaches Tauri. A harmless argument-capture probe on this
  Windows/npm 10.9.2 setup showed that the previous forwarded-flag invocation
  delivered only `build`. That demonstrates a local risk, not proof that previous
  hosted CI runs built the wrong profile. The new script was executed successfully
  and confirmed Cargo's `dev` profile and `target/debug/clippy.exe` output.
- Removed CI's standalone frontend build: Tauri's existing `beforeBuildCommand`
  already runs `npm run build`, which includes TypeScript checking. The actual
  embedded build still uses the Tauri CLI. Native tests use the development URL
  context and do not require `dist` beforehand.
- Enabled Cargo HTML timings for native tests and the embedded debug build. CI
  uploads `cargo-build-timings` for seven days, including on failure when reports
  exist. Tests, smoke coverage and release gating remain in place.

The debug command uses Cargo's lockfile and never generates installers. Normal
`npm run tauri build` still produces the optimized release and installers.
Tauri documents its frontend build hook, debug flag, no-bundle flag and forwarded
Cargo arguments in the [CLI reference](https://v2.tauri.app/reference/cli/).

## Reading the next CI run

Compare GitHub's step durations for cache restore/save, dependency installation,
Rust tests, embedded debug build, browser tests and native smoke. Download the
`cargo-build-timings` artifact to inspect compile-unit durations and concurrency.
Local reports live in `src-tauri/target/cargo-timings/`; they are not committed.

The existing [Rust cache action](https://github.com/Swatinem/rust-cache) primarily
caches dependencies and disables incremental compilation by default. The app
crate may still compile on each run. Rust/toolchain or dependency changes can
invalidate cached artifacts. A fast warm run and a slower cold run are expected
to differ; inspect cache logs before changing cache policy.

Keep the current release profile and cache policy until measurements identify a
specific bottleneck. No broad dependency, linker, test-scope or toolchain changes
were needed for this cleanup.
