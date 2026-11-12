# Clippy-board

Clippy-board is a keyboard-friendly clipboard manager for Windows. It keeps a local history of text, images, and copied files so you can find and reuse them from the system tray.

## Install

Download the Windows installer from [GitHub Releases](https://github.com/omar908/Clippy-board/releases/latest). Choose either the EXE installer or the MSI package. After installation, launch Clippy-board and press **Ctrl+Shift+Space** to open your clipboard history.

## Use Clippy-board

- Type to search, use the arrow keys to select an item, and press Enter to copy it. You can also click an item.
- Preview text, images, and file paths. The preview opens beside the main window when there is room and docks inside it when space is limited.
- Pin items you want to keep and use the Deleted tab to restore recently deleted items.
- Look for the **On clipboard** badge to see which history entry matches the current clipboard.
- Open Settings with **Ctrl+,** to change shortcuts, enable Start with Windows, adjust history retention, or turn on Compact mode. Changes save as you edit.
- In **Settings → About**, use **Check for updates** to look for a newer release and open its GitHub page to download the installer. Automatic checks are on by default and can be turned off in the same section.

Clipboard history is stored locally in SQLite under the app's Windows data directory, typically `%APPDATA%\com.clippy.app\history.db`. File entries retain file paths. Use **Ctrl+P** to pause or resume clipboard capture.

## Build from source

On Windows, install stable Rust with the MSVC toolchain, Node.js 22.12 or later, Microsoft C++ Build Tools with the Windows SDK, and WebView2. See the [Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/#windows) for setup instructions.

```powershell
git clone https://github.com/omar908/Clippy-board.git
cd Clippy-board
npm ci
npm run tauri dev
```

Run `npm run build:debug` for a standalone debug executable at `src-tauri/target/debug/clippy.exe`. Run `npm run tauri build` for release installers under `src-tauri/target/release/bundle/`.

## Test and contribute

```powershell
npm test
cargo test --manifest-path src-tauri/Cargo.toml --locked --all-targets
npx playwright install chromium
npm run typecheck:layout
npm run test:layout
```

Use [GitHub Issues](https://github.com/omar908/Clippy-board/issues) to report a bug or suggest a feature. For bugs, include your Clippy-board version, Windows version, and steps to reproduce. Use sample clipboard contents when sharing screenshots or logs.

- [Manual smoke tests](docs/testing/manual-smoke-test.md) and [browser layout tests](docs/testing/browser-layout-tests.md)
- [Build and CI timings](docs/testing/build-performance.md)
- [Architecture decisions](docs/adr/README.md) and [technical designs](docs/tdd/README.md)
- [Original Tauri feasibility assessment](ASSESSMENT.md)

The Windows CI workflow runs the frontend, browser, Rust, and native WebView2 smoke tests. A version bump merged into `main` publishes installers and a matching tag after the checks pass. Use `node scripts/release-plan.mjs --check` and `npm run test:release` to validate a version bump.

## License

Clippy-board is available under the [MIT License](LICENSE).
