# Clippy — Technical Assessment

**Project:** Clippy technical spike — can Tauri support a fast, minimal, polished Windows clipboard experience?
**Date:** October 18, 2026
**Stack:** Tauri 2.11, Rust 1.70+ (tauri, arboard, windows-sys), TypeScript, Vite
**Verdict:** **GO WITH CAVEATS**

---

## 1. Tauri

### Overall viability

Tauri is suitable for building Clippy. Every capability the product needs was demonstrated in the spike: clipboard monitoring across formats, a borderless summon-on-hotkey popup, tray-resident background operation, global shortcuts, and MSI/NSIS packaging — all from one small codebase. The prototype in this repo is intended as the foundation of the real MVP, not a throwaway.

### Windows integration

Raw Win32 access from Rust works well. `CF_HDROP` file clipboard payloads were read and written with `windows-sys` alongside `arboard` for text/images, with no conflicts. The friction was entirely around **window focus semantics**, not clipboard APIs (see Section 3).

### Frontend experience

Comfortable. The frontend is plain TypeScript + Vite with the standard `@tauri-apps/api` IPC layer — hot reload in dev, small production bundle (≈22 kB JS), no framework lock-in. `startDragging` / `startResizeDragging` and window state APIs made native-feeling window behaviors a few lines of code.

### Rust experience

Good. The borrow checker earns its keep in the clipboard monitor thread and state management. All discovered issues were diagnosable via logs; nothing required stepping outside safe Rust except deliberate `windows-sys` calls. Build times (~1.5 min release) are acceptable.

---

## 2. Performance

Measured on the author's machine, release build, production (non-dev) mode:

| Metric | Result | Assessment |
|---|---|---|
| Cold start → tray-ready | **447 ms** | Excellent for a summon-style app |
| Idle memory (working set) | **26.5 MB** | Well under the ~100 MB comfort target |
| Idle private memory | **5.3 MB** | Excellent |
| Idle CPU (steady state) | **0% of one core** | Clipboard monitor uses no measurable CPU when idle |
| Search responsiveness | Instant | In-memory linear filter over ≤100 items |
| Frontend bundle | 22.4 kB JS + 7.2 kB CSS | Negligible |

The clipboard monitor polls with a lightweight sequence-number check (no busy-wait), which is why idle CPU is effectively zero.

---

## 3. Clipboard

| Type | Capture | Restore | Notes |
|---|---|---|---|
| Text (Unicode, multiline) | ✅ | ✅ | Via `arboard`; round-trips reliably |
| Images | ✅ | ✅ | Stored as full PNG in memory; works, see limitations |
| Files (CF_HDROP) | ✅ | ✅ | Raw Win32; Windows-only by nature |

**Reliability:** During all spike testing (including repeated capture/paste cycles and app restarts), no clipboard read/write failures were observed. Selecting a history item writes it back to the Windows clipboard and a normal `Ctrl+V` paste works afterward — the core success criterion.

**Windows compatibility:** Tested on Windows 10/11 x64 only. `CF_HDROP` is Windows-specific; if macOS support ever matters, that path needs a platform abstraction (arboard handles the rest).

---

## 4. Windowing

**Popup behavior:** Borderless, always-on-top, skip-taskbar window summoned via `Ctrl+Shift+Space` or tray click works reliably, including drag-to-move, resize grip + native edge resize, double-click maximize, and position/size memory across hide/show within a session.

**Focus behavior:** This was the **only meaningful friction** in the spike (Yellow, below). Windows native drag/resize runs a modal loop that reports a focus loss to the webview; combined with the popup's auto-hide-on-blur model, this caused the window to vanish mid-drag. Resolved with a two-part guard: a JS interaction flag around drag/resize operations, and Rust-side held-mouse-button detection (`GetAsyncKeyState`) that defers auto-hide until button release for any native loop we don't initiate.

**Global shortcut:** `Ctrl+Shift+Space` registers and fires reliably via `tauri-plugin-global-shortcut`. Known dev-mode conflicts with IDEs are a dev-only annoyance; the release build is clean.

**Close behavior:** Close is intercepted and converted to hide (app lives in the tray); quit is available via tray menu. Works as designed.

---

## 5. Architecture Evaluation (per plan §17)

| Area | Rating | Notes |
|---|---|---|
| Windows clipboard APIs | 🟢 Green | `arboard` + `windows-sys` coexist cleanly |
| Clipboard monitoring | 🟢 Green | Zero idle CPU, no missed captures observed |
| Clipboard formats | 🟢 Green | Text, image, file all round-trip |
| Global shortcuts | 🟢 Green | Plugin works out of the box |
| Popup windows | 🟢 Green | Borderless + always-on-top + summon behaves |
| Window focus | 🟡 Yellow | Auto-hide vs. native drag/resize modal loops — solved, but required custom logic (this is the "can't fight the platform" tax, and it's paid) |
| Window positioning | 🟢 Green | Center-once + position memory via standard APIs |
| Background execution | 🟢 Green | Tray-resident, zero CPU at idle |
| System tray | 🟢 Green | Icon, tooltip, menu, left-click toggle all work |
| Application startup | 🟢 Green | 447 ms cold to tray |
| Packaging | 🟢 Green | MSI + NSIS produced by `tauri build`; minor WiX/NSIS download step on first build |
| Resource usage | 🟢 Green | 26.5 MB / 0% idle CPU |
| Rust ↔ TypeScript IPC | 🟢 Green | Commands + events felt natural; no perf pain at this scale |
| Window property getters from background threads | 🟡 Yellow | `window.hwnd()` / `is_visible()` / `is_focused()` time out when called off the main thread — call them on the main thread or from window events (documented workaround, no functional impact) |

**No Reds.**

---

## 6. Success Criteria (per plan §20)

| # | Criterion | Status |
|---|---|---|
| 1 | Tauri can reliably monitor the Windows clipboard | ✅ |
| 2 | Text, images, and files can be detected | ✅ |
| 3 | Clipboard history can be displayed | ✅ |
| 4 | Search feels instantaneous | ✅ |
| 5 | A historical item can be placed back onto the clipboard | ✅ |
| 6 | Normal Windows paste works afterward | ✅ |
| 7 | The application can operate in the background | ✅ |
| 8 | A global shortcut can summon the UI | ✅ |
| 9 | The popup can receive focus reliably | ✅ (after focus-guard fix) |
| 10 | The application feels lightweight and responsive | ✅ (26.5 MB, 0% CPU, instant UI) |
| 11 | No major Tauri/Windows integration issue is discovered | ✅ (two Yellows, both resolved) |
| 12 | The Rust ↔ frontend boundary feels manageable | ✅ |

**12 / 12 met.**

---

## 7. Recommendation

```text
GO WITH CAVEATS
```

**Tauri is suitable for Clippy.** The central spike question — *can Tauri support a fast, minimal, polished Windows clipboard experience without fighting the platform?* — answers **yes**. Startup, memory, CPU, and UI responsiveness all land comfortably inside the product's comfort targets, and every clipboard format the MVP needs round-trips reliably.

The caveats are small, understood, and already paid:

1. **Focus-vs-drag/resize guard is custom code.** It works and is documented, but it's platform subtlety that must be maintained. Any new auto-hide triggers must respect the interaction flag and mouse-button deferral.
2. **Window property getters must not be called from background threads.** Main-thread-only rule for `hwnd()` / `is_focused()` / `is_visible()`.
3. **Spike-scoped gaps are product work, not platform problems:** no persistence, no duplicate detection, no image thumbnails. These are MVP Phase 1 items and were intentionally out of spike scope (plan §18).

Tauri becomes the assumed technology for the Clippy MVP. No alternative stack needs evaluation.

---

## 8. Next Steps → MVP Phase 1

Recommended order, based on spike findings:

1. **Persistent history** — the largest spike gap. Replace the in-memory `Vec` with SQLite (`rusqlite`) or a JSON store; define the schema for text/image/file entries. Mind image size (spike stores full PNGs; add thumbnails/downsampling at capture time).
2. **Duplicate detection** — collapse consecutive identical copies; cheap once persistence exists.
3. **Retention limits** — configurable max items/age to bound storage.
4. **Keep the focus guard** — carry the `USER_INTERACTING` + mouse-button deferral logic forward as-is; add tests around it early.
5. **Settings** — only what Phase 1 requires (retention, shortcut is Phase 2).
6. **Packaging polish** — proper app icon (done), WiX branding, install/uninstall pass.

Deferred to Phase 2 per plan: pinning items, configurable shortcut, richer settings UI.
