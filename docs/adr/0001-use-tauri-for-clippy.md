# ADR-0001. Use Tauri (2) + Rust for Clippy

**Status:** Accepted
**Date:** 2026-10-18
**Deciders:** Omar Estrada
**Supersedes:** nothing (initial decision)
**Related:** [ASSESSMENT.md](../../ASSESSMENT.md) — the full evaluation this ADR is based on

## Context

Clippy is a Windows clipboard manager that must feel fast and minimal: summoned by a global shortcut, resident in the system tray, near-zero idle resource usage, and able to read/write every clipboard format Windows offers (text, images, file lists via `CF_HDROP`). The platform choice was evaluated by a technical spike (plan: `Clippy — Tauri Technical Spike & Feasibility Test.md`; results: `ASSESSMENT.md`), which tested clipboard monitoring, popup window behavior, global shortcuts, background execution, packaging, and the Rust↔TypeScript boundary.

Alternatives that could have been considered: Electron, pure Win32/WinUI, .NET/WebView2 hybrid, Qt.

## Decision

**Build Clippy on Tauri 2 with a Rust backend and a plain TypeScript/Vite frontend.** The spike verdict was GO WITH CAVEATS: all 12 success criteria met, with two Yellow findings (both resolved — see [ADR-0002](0002-popup-hide-on-blur-with-interaction-guard.md) and [ADR-0003](0003-main-thread-only-window-property-getters.md)) and no Reds.

Measured evidence (release build, spike hardware):

- Cold start → tray-ready: **447 ms**
- Idle memory: **26.5 MB** working set
- Idle CPU: **0%** of one core
- Clipboard formats: text, image, file all round-trip reliably
- Packaging: MSI + NSIS via `tauri build`

## Alternatives considered

- **Electron** — rejected: idle memory typically 80–150+ MB, which violates the lightweight requirement; Node's clipboard story on Windows requires native modules anyway.
- **Pure Win32 / WinUI 3** — rejected: fastest and lightest, but UI iteration cost (borderless popup, list rendering, search-as-you-type) is far higher; no web frontend means slower iteration on polish.
- **.NET + WebView2** — rejected: runtime dependency (~100 MB+ .NET runtime), heavier process footprint, less control over idle behavior.
- **Qt** — rejected: licensing complexity (commercial), large binary/runtime, unnecessary for a small utility UI.

## Consequences

**Positive**
- Small binaries (≈4.7 MB exe), tiny idle footprint, fast cold start — all re-measurable in CI or by hand.
- Direct `windows-sys` access from Rust covers anything Win32-specific (`CF_HDROP`, foreground-window handling) without fighting the framework.
- Plain TS frontend: no framework lock-in; bundle is currently ~22 kB.
- Single language pair (Rust + TS) with a clear IPC seam: `invoke` commands and `listen` events.

**Negative / costs**
- Two-language codebase — contributors need both Rust and TS comfort.
- Release builds take ~1.5 min (LTO + codegen-units=1); acceptable but noticeable in iteration.
- Tauri's window APIs have threading and focus subtleties that impose standing rules — captured in ADR-0002 and ADR-0003. Any future platform work must check those first.

**Rules for future work**
- New dependencies go through `src-tauri/Cargo.toml`; prefer Rust-side solutions (e.g. `rusqlite` for persistence) over spawning sidecar processes.
- Resource budgets from the spike (≤100 MB idle, ~0% idle CPU, <1 s cold start) are the standing performance bar — re-measure after significant changes rather than assuming.
- If a feature seems to fight the platform, re-read the Yellow findings in `ASSESSMENT.md` §5 before considering a platform change.
