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
| **Navigate** | `↑` / `↓` arrow keys |
| **Preview full content** | Hover an item, or move the highlight with `↑` / `↓` — the window widens with the panel; it closes shortly after the cursor leaves the window (or on copy/close) |
| **Zoom image preview** | Click the previewed image — toggles fit ↔ 100% (scroll to pan) |
| **Copy an item** | Press `Enter`, or click an item |
| **Close** | Press `Escape`, or click outside the window |
| **Move window** | Drag anywhere in the header |
| **Resize window** | Drag the bottom-right grip, or any window edge |
| **Maximize** | Double-click the header |
| **Pin window open** | Click the 📌 button (prevents auto-hide on blur) |
| **Clear history** | Click 🗑️ |
| **Quit** | Right-click the tray icon → Quit Clippy |

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
| `src/preview.ts` | Full-content preview: renderer, hover/keyboard triggers, window geometry |
| `src/styles.css` | Dark popup UI styling |
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

Because the list line shows only a snippet, Clippy opens a **preview panel** for the item under the cursor or keyboard highlight — the window widens by 480 px while it's open. Hovering never changes what `Enter` copies; the keyboard highlight stays authoritative for that. Text renders complete and selectable (first 100k chars if longer), images fit the panel with click-to-zoom to 100%, and file entries list every path in full. The panel closes ~0.35 s after the cursor leaves the window, or when the window hides (copy, `Esc`, blur) — geometry is restored while the window is invisible, so position/size retention is unaffected. See [ADR-0005](./docs/adr/0005-full-content-preview-via-window-widening.md).

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
| [0005](./docs/adr/0005-full-content-preview-via-window-widening.md) | Full-content preview via main-window widening (aside panel) |
