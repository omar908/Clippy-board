mod clipboard;
mod storage;

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use clipboard::{ClipboardItem, ClipboardState};

static IS_PINNED: AtomicBool = AtomicBool::new(false);
/// Timestamp (millis since epoch) when Clippy window was last shown.
/// Used to prevent the Focused(false) handler from immediately re-hiding the window.
static WINDOW_SHOWN_AT: AtomicU64 = AtomicU64::new(0);
/// Whether the window has been positioned at least once (center on first summon only).
static WINDOW_POSITIONED: AtomicBool = AtomicBool::new(false);
/// Whether a native drag/resize operation is currently in progress.
/// Native move/resize enters a modal loop that reports a focus loss to
/// WebView2 — without this flag the auto-hide would fire mid-drag.
static USER_INTERACTING: AtomicBool = AtomicBool::new(false);

#[tauri::command]
fn get_history(state: State<ClipboardState>) -> Vec<ClipboardItem> {
    state.history.lock().unwrap().clone()
}

#[tauri::command]
fn select_item(app: AppHandle, state: State<ClipboardState>, id: String) -> Result<(), String> {
    let payload = {
        let history = state.history.lock().unwrap();
        history.iter().find(|i| i.id == id).map(|i| i.payload.clone())
    };

    if let Some(payload) = payload {
        // Only reorder on a successful write — a failed restore must not
        // bump the item (IS_SELF_COPY keeps the monitor from double-handling
        // this write, so the reorder is done directly here).
        clipboard::write_clipboard(&payload)?;
        if let Some(item) = clipboard::bump_on_select(&state, &id) {
            let _ = app.emit("clipboard-updated", &item);
        }
        // Like every other hide path, copy-dismiss checks IS_PINNED
        // (ADR-0002): a pinned window stays open after copying so you can
        // keep working through the list.
        if !IS_PINNED.load(Ordering::SeqCst) {
            hide_main_window(&app);
        }
        Ok(())
    } else {
        Err("Item not found".to_string())
    }
}

#[tauri::command]
fn delete_item(state: State<ClipboardState>, id: String) -> Result<(), String> {
    let mut history = state.history.lock().unwrap();
    history.retain(|i| i.id != id);
    drop(history);
    let db = state.db.lock().unwrap();
    if let Some(conn) = db.as_ref() {
        storage::delete(conn, &id)?;
    }
    Ok(())
}

#[tauri::command]
fn clear_history(state: State<ClipboardState>) -> Result<(), String> {
    let mut history = state.history.lock().unwrap();
    history.clear();
    drop(history);
    let db = state.db.lock().unwrap();
    if let Some(conn) = db.as_ref() {
        storage::clear(conn)?;
    }
    Ok(())
}

/// Hide the main window and notify the frontend.
///
/// The webview cannot observe a native hide on its own (WebView2 keeps
/// `document.visibilityState` "visible" for a hidden parent window), so
/// every hide path emits `window-hidden` — the preview panel uses it to
/// restore the pre-preview geometry while the window is invisible.
fn hide_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
        let _ = app.emit("window-hidden", ());
    }
}

#[tauri::command]
fn hide_window(app: AppHandle) -> Result<(), String> {
    hide_main_window(&app);
    Ok(())
}

#[tauri::command]
fn show_window(app: AppHandle) -> Result<(), String> {
    toggle_window(&app);
    Ok(())
}

#[tauri::command]
fn set_pinned(pinned: bool) -> bool {
    IS_PINNED.store(pinned, Ordering::SeqCst);
    pinned
}

#[tauri::command]
fn get_pinned() -> bool {
    IS_PINNED.load(Ordering::SeqCst)
}

#[tauri::command]
fn set_interacting(interacting: bool) -> bool {
    USER_INTERACTING.store(interacting, Ordering::SeqCst);
    interacting
}

fn now_ms() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

/// Whether the left mouse button is currently held down.
#[cfg(windows)]
fn mouse_left_button_down() -> bool {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON};
    unsafe { GetAsyncKeyState(VK_LBUTTON as i32) as u16 & 0x8000 != 0 }
}

#[cfg(not(windows))]
fn mouse_left_button_down() -> bool {
    false
}

/// Hide the window once the left mouse button is released.
/// Used when focus was lost mid native drag/resize — the window must not
/// disappear while the user is still holding the button.
fn defer_hide_until_mouse_up(app: AppHandle) {
    std::thread::spawn(move || {
        // Wait for button release (with a safety timeout of ~5s)
        let mut waited = 0u32;
        while mouse_left_button_down() && waited < 5000 {
            std::thread::sleep(std::time::Duration::from_millis(30));
            waited += 30;
        }
        // Small settle delay so the modal loop fully unwinds
        std::thread::sleep(std::time::Duration::from_millis(80));
        // Re-check: only hide if still unpinned and still unfocused
        if !IS_PINNED.load(Ordering::SeqCst) && !USER_INTERACTING.load(Ordering::SeqCst) {
            let focused = app
                .get_webview_window("main")
                .and_then(|w| w.is_focused().ok())
                .unwrap_or(false);
            if !focused {
                hide_main_window(&app);
            }
        }
    });
}

fn toggle_window(app: &AppHandle) {
    app_log("toggle_window called");
    if let Some(window) = app.get_webview_window("main") {
        let is_vis = window.is_visible().unwrap_or(false);
        app_log(&format!("toggle_window: is_visible = {}", is_vis));
        if is_vis {
            hide_main_window(app);
            app_log("toggle_window: window hidden");
        } else {
            // Record when we showed so the Focused(false) handler doesn't immediately hide
            WINDOW_SHOWN_AT.store(now_ms(), Ordering::SeqCst);
            // Center only the first time; afterwards keep the user's position/size
            if !WINDOW_POSITIONED.swap(true, Ordering::SeqCst) {
                let _ = window.center();
            }
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
            app_log("toggle_window: window shown");

            #[cfg(target_os = "windows")]
            {
                use windows_sys::Win32::UI::WindowsAndMessaging::{
                    BringWindowToTop, SetForegroundWindow, ShowWindow, SW_RESTORE, SW_SHOW,
                };
                if let Ok(hwnd) = window.hwnd() {
                    unsafe {
                        ShowWindow(hwnd.0 as _, SW_RESTORE);
                        ShowWindow(hwnd.0 as _, SW_SHOW);
                        BringWindowToTop(hwnd.0 as _);
                        SetForegroundWindow(hwnd.0 as _);
                    }
                }
            }
        }
    } else {
        app_log("toggle_window: window 'main' not found!");
    }
}

pub(crate) fn app_log(msg: &str) {
    use std::io::Write;
    let path = "D:\\Documents\\Coding\\Rust\\clippy\\clippy.log";
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(f, "[LOG] {}", msg);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    app_log("Clippy starting up...");
    let state = ClipboardState::new();
    let history_arc = Arc::clone(&state.history);
    let db_arc = Arc::clone(&state.db);

    let shortcut: Shortcut = "Ctrl+Shift+Space".parse().expect("failed to parse shortcut");
    let shortcut_clone = shortcut.clone();

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, s, event| {
                    if s == &shortcut_clone && event.state() == ShortcutState::Pressed {
                        app_log("Global shortcut pressed!");
                        toggle_window(app);
                    }
                })
                .build(),
        )
        .manage(state)
        .setup(move |app| {
            app_log("Setup hook entered");

            // Create main window — start hidden (popup model: shown via shortcut/tray)
            match tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::default())
                .title("Clippy")
                .inner_size(460.0, 580.0)
                .min_inner_size(360.0, 420.0)
                .resizable(true)
                .decorations(false)
                .shadow(true)
                .always_on_top(true)
                .skip_taskbar(true)
                .visible(false)   // Start hidden – summoned via Ctrl+Shift+Space or tray
                .center()
                .build()
            {
                Ok(win) => app_log(&format!("WebviewWindow built: label={}", win.label())),
                Err(e) => app_log(&format!("WebviewWindow build FAILED: {}", e)),
            }

            // Open persistent history storage (falls back to in-memory-only on failure)
            match app.path().app_data_dir() {
                Ok(dir) => {
                    let db_path = dir.join("history.db");
                    match storage::open(&db_path) {
                        Ok(conn) => {
                            let items = storage::load(&conn);
                            app_log(&format!(
                                "Storage opened: {} ({} items loaded)",
                                db_path.display(),
                                items.len()
                            ));
                            *history_arc.lock().unwrap() = items;
                            *db_arc.lock().unwrap() = Some(conn);
                        }
                        Err(e) => {
                            app_log(&format!("Storage open FAILED, running in-memory only: {}", e));
                        }
                    }
                }
                Err(e) => app_log(&format!("No app data dir, running in-memory only: {}", e)),
            }

            // Start clipboard monitor
            let app_handle = app.handle().clone();
            clipboard::start_clipboard_monitor(app_handle, history_arc, db_arc);
            app_log("Clipboard monitor started");

            // Register global shortcut
            match app.global_shortcut().register(shortcut) {
                Ok(_) => app_log("Global shortcut Ctrl+Shift+Space registered"),
                Err(e) => app_log(&format!("Global shortcut register failed: {}", e)),
            }

            // Setup system tray
            use tauri::menu::{Menu, MenuItem};
            use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

            match (
                MenuItem::with_id(app, "show", "Show / Hide Clippy", true, None::<&str>),
                MenuItem::with_id(app, "quit", "Quit Clippy", true, None::<&str>),
            ) {
                (Ok(show_i), Ok(quit_i)) => {
                    if let Ok(menu) = Menu::with_items(app, &[&show_i, &quit_i]) {
                        if let Some(icon) = app.default_window_icon() {
                            match TrayIconBuilder::new()
                                .icon(icon.clone())
                                .tooltip("Clippy — Clipboard Manager")
                                .menu(&menu)
                                .show_menu_on_left_click(false)
                                .on_menu_event(|app, event| match event.id().as_ref() {
                                    "show" => toggle_window(app),
                                    "quit" => app.exit(0),
                                    _ => {}
                                })
                                .on_tray_icon_event(|tray, event| {
                                    if let TrayIconEvent::Click {
                                        button: MouseButton::Left,
                                        button_state: MouseButtonState::Up,
                                        ..
                                    } = event
                                    {
                                        toggle_window(tray.app_handle());
                                    }
                                })
                                .build(app)
                            {
                                Ok(_) => app_log("Tray icon created"),
                                Err(e) => app_log(&format!("Tray icon error: {}", e)),
                            }
                        } else {
                            app_log("No default window icon for tray");
                        }
                    }
                }
                _ => app_log("Failed to create tray menu items"),
            }

            app_log("Setup complete — Clippy running in tray. Press Ctrl+Shift+Space to open.");
            Ok(())
        })
        .on_window_event(|window, event| {
            match event {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    // Don't close — just hide. Clippy lives in the tray.
                    hide_main_window(window.app_handle());
                    api.prevent_close();
                }
                tauri::WindowEvent::Focused(false) => {
                    // Hide when focus is lost, but only after a grace period from last show
                    // to avoid immediately hiding when first summoned. Never hide while a
                    // native drag/resize is in progress (that reports a focus loss too).
                    if !IS_PINNED.load(Ordering::SeqCst)
                        && !USER_INTERACTING.load(Ordering::SeqCst)
                    {
                        let shown_at = WINDOW_SHOWN_AT.load(Ordering::SeqCst);
                        let elapsed = now_ms().saturating_sub(shown_at);
                        if elapsed > 300 {
                            // Native move/resize loops (window edge borders, titlebar
                            // drag) don't go through our JS flag — detect a held left
                            // mouse button and defer the hide until it's released.
                            if mouse_left_button_down() {
                                defer_hide_until_mouse_up(window.app_handle().clone());
                            } else {
                                hide_main_window(window.app_handle());
                            }
                        }
                    }
                }
                tauri::WindowEvent::Focused(true) => {
                    // Window received focus — emit event to frontend to focus search
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_history,
            select_item,
            delete_item,
            clear_history,
            hide_window,
            show_window,
            set_pinned,
            get_pinned,
            set_interacting
        ]);

    app_log("Entering event loop...");
    let res = builder.run(tauri::generate_context!());
    match res {
        Ok(_) => app_log("Application exited normally"),
        Err(e) => app_log(&format!("Application exited with error: {}", e)),
    }
}
