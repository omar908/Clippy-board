mod clipboard;

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use clipboard::{ClipboardItem, ClipboardState};

static IS_PINNED: AtomicBool = AtomicBool::new(false);
/// Timestamp (millis since epoch) when Clippy window was last shown.
/// Used to prevent the Focused(false) handler from immediately re-hiding the window.
static WINDOW_SHOWN_AT: AtomicU64 = AtomicU64::new(0);

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
        clipboard::write_clipboard(&payload)?;
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.hide();
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
    Ok(())
}

#[tauri::command]
fn clear_history(state: State<ClipboardState>) -> Result<(), String> {
    let mut history = state.history.lock().unwrap();
    history.clear();
    Ok(())
}

#[tauri::command]
fn hide_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
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

fn now_ms() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn toggle_window(app: &AppHandle) {
    app_log("toggle_window called");
    if let Some(window) = app.get_webview_window("main") {
        let is_vis = window.is_visible().unwrap_or(false);
        app_log(&format!("toggle_window: is_visible = {}", is_vis));
        if is_vis {
            let _ = window.hide();
            app_log("toggle_window: window hidden");
        } else {
            // Record when we showed so the Focused(false) handler doesn't immediately hide
            WINDOW_SHOWN_AT.store(now_ms(), Ordering::SeqCst);
            let _ = window.center();
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
                .resizable(false)
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

            // Start clipboard monitor
            let app_handle = app.handle().clone();
            clipboard::start_clipboard_monitor(app_handle, history_arc);
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
                    let _ = window.hide();
                    api.prevent_close();
                }
                tauri::WindowEvent::Focused(false) => {
                    // Hide when focus is lost, but only after a grace period from last show
                    // to avoid immediately hiding when first summoned.
                    if !IS_PINNED.load(Ordering::SeqCst) {
                        let shown_at = WINDOW_SHOWN_AT.load(Ordering::SeqCst);
                        let elapsed = now_ms().saturating_sub(shown_at);
                        if elapsed > 300 {
                            let _ = window.hide();
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
            get_pinned
        ]);

    app_log("Entering event loop...");
    let res = builder.run(tauri::generate_context!());
    match res {
        Ok(_) => app_log("Application exited normally"),
        Err(e) => app_log(&format!("Application exited with error: {}", e)),
    }
}
