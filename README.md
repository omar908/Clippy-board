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
| **Copy an item** | Press `Enter`, or click an item |
| **Close** | Press `Escape`, or click outside the window |
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
│  • In-memory history (Vec)           │
│  • System tray icon                  │
└──────────────────────────────────────┘
                   │
             Windows APIs
```

### Key Files

| File | Purpose |
|---|---|
| `src-tauri/src/lib.rs` | App entry point, Tauri setup, commands, global shortcut, tray, window events |
| `src-tauri/src/clipboard.rs` | Clipboard monitoring, reading, writing (text/image/file) |
| `src/main.ts` | Frontend logic: history rendering, search, keyboard nav, IPC |
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

- **No persistence** — clipboard history is in-memory only; cleared on restart
- **No dev-mode shortcut detection** — `Ctrl+Shift+Space` may conflict with some IDEs during `npm run tauri dev`; press `Ctrl+Shift+\`` as fallback or build release
- **Window visibility probe** — Tauri's `window.hwnd()` / `window.is_visible()` return errors when called from background threads (the getter dispatches to the main event loop; the receiver times out). This is not a functional issue — the window shows/hides correctly; it's a diagnostic limitation
- **Image history display** — large images are stored as full-resolution base64 PNGs; no thumbnail/resize in the spike
- **No duplicate detection across session boundaries** — in-memory only
- **File clipboard write** — tested on Windows only (CF_HDROP is Windows-specific)

---

## Technical Assessment

See [Technical Assessment](./ASSESSMENT.md) for the full feasibility evaluation.
