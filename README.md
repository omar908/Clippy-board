# Clippy — Tauri Technical Spike

A proof-of-concept clipboard manager for Windows built with **Tauri 2**, **Rust**, and **TypeScript**.

This is a technical feasibility spike — not the finished product. The goal is to determine whether Tauri can support the fast, minimal, polished Windows clipboard experience required by Clippy.

---

## Prerequisites

| Dependency | Version | Notes |
|---|---|---|
| Rust | 1.70+ | Install via [rustup.rs](https://rustup.rs) |
| Node.js | 18+ | For the Vite/TypeScript frontend |
| npm | 9+ | Bundled with Node.js |
| WebView2 | Latest | Pre-installed on Windows 10/11 |
| Windows SDK | 10.0+ | For `windows-sys` bindings |

Verify your installation:
```powershell
rustc --version
cargo --version
node --version
npm --version
```

---

## Development Setup

```powershell
# Clone or open the workspace
cd D:\Documents\Coding\Rust\clippy

# Install frontend dependencies
npm install
```

---

## Running in Development Mode

```powershell
npm run tauri dev
```

This starts the Vite dev server and the Tauri app with hot-reload for the frontend. The window opens automatically in dev mode.

---

## Building a Release Binary

```powershell
cd src-tauri
cargo build --release
```

The output binary is at:
```
src-tauri\target\release\clippy.exe
```

---

## Running the Prototype

After building:

```powershell
.\src-tauri\target\release\clippy.exe
```

Clippy starts **in the system tray** (no window visible on launch).

### Controls

| Action | How |
|---|---|
| **Open Clippy** | Press `Ctrl + Shift + Space` from anywhere, or click the tray icon |
| **Search** | Type immediately — search input has focus on open |
| **Navigate** | `↑` / `↓` arrow keys, or hover an item — both move the **same highlight** (hovering selects). The first arrow press takes over from the mouse: the cursor hides until the pointer moves |
| **Preview full content** | Hover an item, or move the highlight with `↑` / `↓` — a separate always-on-top window opens beside the main window, flipping to the left near a screen edge. When there is no room (maximized, or wider than the work area allows) the panel docks inside the main window instead. It closes shortly after the cursor leaves, or on copy/close |
| **Zoom image preview** | Click the previewed image — toggles fit ↔ 100%, anchored on the point you clicked; drag (or middle-drag) to pan |
| **Copy an item** | Press `Enter` — always copies the highlighted item, however it got highlighted — or click an item (click copies it directly); the copied entry jumps to the top of the list and the highlight follows it there |
| **Close** | Press `Escape`, or click outside the window |
| **Move window** | Drag anywhere in the header |
| **Resize window** | Drag the bottom-right grip, or any window edge |
| **Maximize** | Double-click the header |
| **Pin window open** | Click the 📌 button (prevents auto-hide — on blur and after copying) |
| **Clear history** | Click 🗑️ |
| **Quit** | Right-click the tray icon → Quit Clippy |

---

## Testing

Manual regression checklist: **[docs/testing/manual-smoke-test.md](docs/testing/manual-smoke-test.md)**.

`npm test` runs the Vitest suite for the pure preview-placement rules (`src/placement.test.ts`).

`cargo test --manifest-path src-tauri/Cargo.toml` runs the storage unit tests
(dedup/newest-wins, trimming, ordering, corrupt-row handling).

Automated UI smoke test (WebView2 CDP). Build a debug binary with embedded
assets, then run it through the helper:

```powershell
npm run tauri build -- --debug --no-bundle
powershell -ExecutionPolicy Bypass -File scripts\run-smoke.ps1 -Exe src-tauri\target\debug\clippy.exe
```

The helper starts a fresh instance with remote debugging enabled, shows the
window, runs `scripts/smoke.mjs` (title/header/width token, history render,
hover -> preview), and stops the app. Add `-Seed` only on a disposable
machine: it replaces the history with four synthetic samples, and the smoke
then hovers the known `smoke-text-long` card.

CI (`.github/workflows/ci.yml`) runs all of the above on Windows for pushes to
`main` and pull requests targeting `main`. A version bump merged into `main`
automatically builds installers and publishes a GitHub Release with a matching
`vX.Y.Z` tag pointing to the tested merge/squash commit, after all CI checks pass.
Unchanged versions and PR runs do not publish releases. Matching version-tag
pushes can also publish; manual `workflow_dispatch` runs only produce artifacts.

Keep `package.json`, both npm root versions in `package-lock.json`,
`src-tauri/tauri.conf.json`, the app package in `Cargo.toml`/`Cargo.lock`, and the
About label in `index.html` synchronized. Run `node scripts/release-plan.mjs --check`
and `npm run test:release` to validate release metadata and policy. Existing tags
are never moved to another commit. If a release job fails, rerun the original
workflow; a tag already targeting that same commit is safe to reuse.

To fill the clipboard with a varied sample set (text of every length, images from
1×1 to a 3 MB PNG, file drops):

```powershell
powershell -STA -ExecutionPolicy Bypass -File scripts\seed-clipboard.ps1
```

The app must be running so the samples are captured; the script takes ~30 s,
overwrites the clipboard, and leaves `seeding complete` on top. History is capped
at 100 items, so seeding can push out older entries.

---

## Architecture Overview

```
┌──────────────────────────────────────┐
│          Clippy UI (Frontend)        │
│     TypeScript / HTML / CSS          │
│  • Search filtering (in-memory)      │
│  • Clipboard history rendering       │
│  • Keyboard navigation               │
└──────────────────┬───────────────────┘
                   │ Tauri IPC (invoke / listen)
                   ▼
┌──────────────────────────────────────┐
│            Rust Core (src-tauri)     │
│  • Clipboard monitoring thread       │
│  • Win32 CF_HDROP (file detection)   │
│  • arboard (text + image clipboard)  │
│  • Global shortcut (tauri-plugin)    │
│  • Window lifecycle management       │
│  • SQLite history (rusqlite)         │
│  • System tray icon                  │
└──────────────────────────────────────┘
                   │
             Windows APIs
```

### Key Files

| File | Purpose |
|---|---|
| `src-tauri/src/lib.rs` | App entry point, Tauri setup, commands, global shortcut, tray, window events |
| `src-tauri/src/clipboard.rs` | Clipboard monitoring, reading, writing (text/image/file), thumbnails |
| `src-tauri/src/storage.rs` | SQLite history persistence (insert/load/delete/clear/trim) |
| `src/main.ts` | Frontend logic: history rendering, search, keyboard nav, IPC |
| `src/types.ts` | Shared payload types (frontend mirror of the Rust `ClipboardPayload`) |
| `src/preview.ts` | Preview presentation: renderer, hover/keyboard triggers, focus, window vs docked mode |
| `src/placement.ts` | Pure preview-placement rules (right → left → docked) |
| `src/styles.css` | Popup UI styling and semantic theme tokens |
| `index.html` | Window layout |
| `src-tauri/tauri.conf.json` | Window config (borderless, always-on-top, skip-taskbar) |
| `src-tauri/Cargo.toml` | Rust dependencies |

---

## Clipboard Format Support

| Type | Capture | Restore |
|---|---|---|
| Text (plain, Unicode, multiline) | ✅ via `arboard` | ✅ |
| Images | ✅ via `arboard` (stored as PNG/base64) | ✅ |
| Files (CF_HDROP) | ✅ via raw Win32 | ✅ via raw Win32 |

---

## Known Limitations (Spike Scope)

- **History cap** — 100 items max (in-memory cap mirrored in SQLite); configurable retention is MVP Phase 2
- **No dev-mode shortcut detection** — `Ctrl+Shift+Space` may conflict with some IDEs during `npm run tauri dev`; press `Ctrl+Shift+\`` as fallback or build release
- **Window visibility probe** — Tauri's `window.hwnd()` / `window.is_visible()` return errors when called from background threads (the getter dispatches to the main event loop; the receiver times out). This is not a functional issue — the window shows/hides correctly; it's a diagnostic limitation. See [ADR-0003](./docs/adr/0003-main-thread-only-window-property-getters.md)
- **File clipboard write** — tested on Windows only (CF_HDROP is Windows-specific)

## Persistence (MVP Phase 1)

History persists in SQLite at `{app_data_dir}/history.db` (typically `C:\Users\<you>\AppData\Roaming\com.clippy.app\history.db`). Images store full-resolution (exact restore) plus a 480px thumbnail for fast list rendering — see [ADR-0004](./docs/adr/0004-persistent-history-sqlite.md). Duplicates are handled across the whole history: re-copying an existing item — or restoring it from Clippy's list — moves it to the top instead of creating a second entry. If the DB can't be opened, the app logs the error and runs in-memory-only.

## Full-Content Preview

Because the list line shows only a snippet, Clippy-board opens a **separate always-on-top preview window** for the selected item — hovering a card and the arrow keys move the **same highlight** (one flow, two inputs), so the window always shows exactly what `Enter` will copy. It sits to the right of the main window, flips to the left near a screen edge, and **docks as a panel inside the main window** when neither side has room (maximized, or a window too wide for the work area). Hovering window chrome like the header doesn't open it; the first arrow press hands control to the keyboard (the cursor hides and the mouse is ignored until the pointer moves again, so a parked cursor can't trap keyboard navigation). Text renders complete and selectable (first 100k chars if longer), images fit the preview with click-to-zoom anchored on the click point (drag or middle-drag to pan at 100%), and file entries list every path in full. The preview closes ~0.35 s after the cursor leaves it, or when the main window hides (copy, `Esc`, blur) — geometry is restored while the window is invisible, so position/size retention is unaffected. See [ADR-0007](./docs/adr/0007-preview-separate-window-with-dock-fallback.md).

---

## Technical Assessment

See [Technical Assessment](./ASSESSMENT.md) for the full feasibility evaluation.

**Result: GO WITH CAVEATS** (October 2026) — Tauri is suitable for Clippy. All 12 spike success criteria met. Measured: 447 ms cold start to tray, 26.5 MB idle memory, 0% idle CPU. Two Yellow findings (focus-vs-drag guard, background-thread window getters) are documented and resolved. Tauri is the assumed technology for the MVP.

## Architecture Decision Records

Significant technical decisions are recorded in [`docs/adr/`](./docs/adr/README.md) — what was decided, why, and what constraints it places on future work. Consult these before making changes that touch window focus/hiding, threading, or core platform choices:

| ADR | Decision |
|---|---|
| [0001](./docs/adr/0001-use-tauri-for-clippy.md) | Use Tauri (2) + Rust for Clippy |
| [0002](./docs/adr/0002-popup-hide-on-blur-with-interaction-guard.md) | Popup hides on blur, with a native drag/resize interaction guard |
| [0003](./docs/adr/0003-main-thread-only-window-property-getters.md) | Window property getters are main-thread-only |
| [0004](./docs/adr/0004-persistent-history-sqlite.md) | Persistent history via SQLite, full image + display thumbnail |
| [0005](./docs/adr/0005-full-content-preview-via-window-widening.md) | Full-content preview via main-window widening (aside panel) — superseded by 0007 |
| [0006](./docs/adr/0006-suppress-layout-induced-hover-during-resize.md) | Suppress layout-induced hover while and after a native resize |
| [0007](./docs/adr/0007-preview-separate-window-with-dock-fallback.md) | Full-content preview in a separate always-on-top window, docking when there is no room |
| [0008](./docs/adr/0008-shared-commands-and-shortcut-router.md) | Shared commands and a single shortcut router — accepted |
| [0009](./docs/adr/0009-adaptive-preview-widths.md) | Adaptive preview widths with compact fallback — accepted |

Implementation designs and extension recipes live in
[`docs/tdd/`](./docs/tdd/README.md). Start with
[TDD-0001: Shared commands and shortcut routing](./docs/tdd/0001-commands-and-shortcuts.md)
when adding actions, shortcuts, or overrides.
