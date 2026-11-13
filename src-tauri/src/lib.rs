pub mod clipboard;
pub mod settings;
pub mod storage;
mod window_menu;
mod item_selection;
mod current_clipboard;
mod startup;
mod updates;

#[tauri::command]
fn get_current_clipboard_item_id(state: State<ClipboardState>) -> Option<String> {
    current_clipboard::item_id(&state, now_ms())
}

#[tauri::command]
fn show_window_menu(window: tauri::WebviewWindow) -> Result<(), String> {
    window_menu::show(&window)
}

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use clipboard::{ClipboardItem, ClipboardState, DeletedItem};

/// User-facing product name. Window titles, the tray menu/tooltip, and logs all
/// derive from this so a rename never leaves one surface behind.
const APP_NAME: &str = "Clippy-board";

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
/// Whether the preview window is currently open.
static PREVIEW_OPEN: AtomicBool = AtomicBool::new(false);

#[tauri::command]
fn get_history(state: State<ClipboardState>) -> Vec<ClipboardItem> {
    state.history.lock().unwrap().clone()
}

#[tauri::command]
fn select_item(app: AppHandle, state: State<ClipboardState>, id: String) -> Result<(), String> {
    let result = item_selection::copy(&state, &id, now_ms(), |payload| {
        clipboard::write_clipboard(payload)?;
        *state.current_payload.lock().unwrap() = Some(payload.clone());
        Ok(())
    });
    current_clipboard::publish(&app);
    let item = result?;
    let _ = app.emit("clipboard-updated", &item);
    // Like every other hide path, copy-dismiss checks IS_PINNED
    // (ADR-0002): a pinned window stays open after copying so you can
    // keep working through the list.
    if !IS_PINNED.load(Ordering::SeqCst) {
        hide_main_window(&app);
    }
    Ok(())
}

#[tauri::command]
fn delete_item(state: State<ClipboardState>, id: String, ttl_seconds: Option<u64>) -> Result<(), String> {
    let ttl = ttl_seconds.unwrap_or(60);
    if ttl == 0 {
        // Delete immediately
        let mut history = state.history.lock().unwrap();
        history.retain(|i| i.id != id);
        drop(history);
        let db = state.db.lock().unwrap();
        if let Some(conn) = db.as_ref() {
            storage::delete(conn, &id).ok();
        }
        return Ok(());
    }
    let ttl = ttl.clamp(1, 86400);
    let ttl_ms = ttl * 1000;
    let now = now_ms();
    let mut history = state.history.lock().unwrap();
    // Don't delete pinned items
    let item_to_delete = history.iter().find(|i| i.id == id).cloned();
    if let Some(ref item) = item_to_delete {
        if item.pinned {
            return Err("Cannot delete pinned item".to_string());
        }
    }
    if let Some(item) = item_to_delete {
        history.retain(|i| i.id != id);
        drop(history);
        // Move to deleted store
        let mut deleted = state.deleted.lock().unwrap();
        let d = DeletedItem {
            id: item.id.clone(),
            original_timestamp: item.timestamp,
            deleted_at: now + ttl_ms,
            payload: item.payload.clone(),
        };
        deleted.insert(0, d.clone());
        let db = state.db.lock().unwrap();
        if let Some(conn) = db.as_ref() {
            storage::insert_deleted(conn, &d).ok();
            storage::delete(conn, &id).ok();
        }
        Ok(())
    } else {
        drop(history);
        Err("Item not found".to_string())
    }
}

#[tauri::command]
fn toggle_pin(state: State<ClipboardState>, id: String, pinned: bool) -> Result<(), String> {
    let mut history = state.history.lock().unwrap();
    if let Some(item) = history.iter_mut().find(|i| i.id == id) {
        item.pinned = pinned;
    }
    let item = history.iter().find(|i| i.id == id).cloned();
    drop(history);
    if let Some(item) = item {
        let db = state.db.lock().unwrap();
        if let Some(conn) = db.as_ref() {
            storage::insert(conn, &item)?;
        }
    }
    Ok(())
}

#[tauri::command]
fn clear_history(
    state: State<ClipboardState>,
    ids: Option<Vec<String>>,
    ttl_seconds: Option<u64>,
) -> Result<Vec<String>, String> {
    let ttl = ttl_seconds.unwrap_or(60);
    if ttl == 0 {
        let mut history = state.history.lock().unwrap();
        let to_soft_delete: Vec<ClipboardItem> = history
            .iter()
            .filter(|item| !item.pinned)
            .filter(|item| match &ids {
                Some(ids) => ids.contains(&item.id),
                None => true,
            })
            .cloned()
            .collect();
        let removed_ids: Vec<String> = to_soft_delete.iter().map(|i| i.id.clone()).collect();
        history.retain(|item| !removed_ids.contains(&item.id));
        drop(history);
        let db = state.db.lock().unwrap();
        if let Some(conn) = db.as_ref() {
            for id in &removed_ids {
                storage::delete(conn, id).ok();
            }
        }
        return Ok(removed_ids);
    }
    let ttl = ttl.clamp(1, 86400);
    let ttl_ms = ttl * 1000;
    let now = now_ms();
    let mut history = state.history.lock().unwrap();
    // Pinned entries are never cleared. When `ids` is given, only those items
    // are considered (the frontend passes whatever is in the current view);
    // None falls back to "all unpinned items".
    let to_soft_delete: Vec<ClipboardItem> = history
        .iter()
        .filter(|item| !item.pinned)
        .filter(|item| match &ids {
            Some(ids) => ids.contains(&item.id),
            None => true,
        })
        .cloned()
        .collect();

    let removed_ids: Vec<String> = to_soft_delete.iter().map(|i| i.id.clone()).collect();
    history.retain(|item| !removed_ids.contains(&item.id));
    drop(history);

    // Move to deleted store
    let mut deleted = state.deleted.lock().unwrap();
    for item in &to_soft_delete {
        let d = DeletedItem {
            id: item.id.clone(),
            original_timestamp: item.timestamp,
            deleted_at: now + ttl_ms,
            payload: item.payload.clone(),
        };
        deleted.insert(0, d.clone());
        let db = state.db.lock().unwrap();
        if let Some(conn) = db.as_ref() {
            storage::insert_deleted(conn, &d).ok();
        }
    }
    drop(deleted);

    let db = state.db.lock().unwrap();
    if let Some(conn) = db.as_ref() {
        for id in &removed_ids {
            storage::delete(conn, id).ok();
        }
    }
    Ok(removed_ids)
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
    // The preview window must never outlive the main window: hide it directly
    // (authoritative) rather than relying on the frontend round-trip.
    if let Some(preview) = app.get_webview_window("preview") {
        let _ = preview.hide();
    }
    PREVIEW_OPEN.store(false, Ordering::SeqCst);
}

#[tauri::command]
fn hide_window(app: AppHandle) -> Result<(), String> {
    hide_main_window(&app);
    Ok(())
}

#[tauri::command]
fn show_window(app: AppHandle) -> Result<(), String> {
    // Idempotent: unlike the tray/hotkey toggle, callers (automation) can ask
    // for a visible window without accidentally hiding an already-visible one.
    show_main_window(&app);
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
fn set_listening_paused(paused: bool) -> bool {
    clipboard::IS_LISTENING_PAUSED.store(paused, Ordering::SeqCst);
    paused
}

#[tauri::command]
fn get_listening_paused() -> bool {
    clipboard::IS_LISTENING_PAUSED.load(Ordering::SeqCst)
}

#[tauri::command]
fn get_settings(app: AppHandle) -> Result<settings::AppSettings, String> {
    let mut settings = settings::load_settings(&app);
    settings.start_on_login = startup::enabled(&app)?;
    Ok(settings)
}

#[tauri::command]
fn save_settings_cmd(
    app: AppHandle,
    mut settings: settings::AppSettings,
    update_startup: Option<bool>,
) -> Result<settings::AppSettings, String> {
    let before = startup::enabled(&app)?;
    if !update_startup.unwrap_or(false) {
        settings.start_on_login = before;
    }
    startup::save(
        before,
        settings.start_on_login,
        |value| startup::set_enabled(&app, value),
        || settings::save_settings(&app, &settings),
    )?;
    storage::set_max_history(settings.max_history);
    let _ = app.emit_to(
        "preview",
        "appearance-changed",
        serde_json::json!({ "theme": settings.theme, "font": settings.font }),
    );
    Ok(settings)
}

#[tauri::command]
fn set_interacting(interacting: bool) -> bool {
    USER_INTERACTING.store(interacting, Ordering::SeqCst);
    interacting
}

/// Show the preview window at the given position and size, and deliver the
/// item to render. The item is emitted from Rust (the canonical Emitter path)
/// rather than from window-to-window JS, which proved unreliable.
#[tauri::command]
fn preview_show(
    app: AppHandle,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
    item: serde_json::Value,
) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("preview") {
        // Flag must be set BEFORE show(): showing can synchronously deliver a
        // focus loss to the main window, whose handler would otherwise hide it.
        PREVIEW_OPEN.store(true, Ordering::SeqCst);
        // Re-assert the non-activating style (defensive — show() is a no-op for
        // a window that already has it).
        make_non_activating(&win);
        let _ = win.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }));
        let _ = win.set_size(tauri::Size::Physical(tauri::PhysicalSize { width: width as u32, height: height as u32 }));
        let _ = win.show();
        // Keep keyboard focus on the main window so arrow-key traversal works.
        if let Some(main_win) = app.get_webview_window("main") {
            let _ = main_win.set_focus();
        }
        // Deliver the content from Rust — reliable regardless of the JS
        // listener attach timing.
        let _ = app.emit_to("preview", "preview-content", item);
        Ok(())
    } else {
        Err("Preview window not found".into())
    }
}

/// Deliver updated content to the (already visible) preview window.
#[tauri::command]
fn preview_update(app: AppHandle, item: serde_json::Value) -> Result<(), String> {
    let _ = app.emit_to("preview", "preview-content", item);
    Ok(())
}

/// Hide the preview window.
#[tauri::command]
fn preview_hide(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("preview") {
        let _ = win.hide();
        PREVIEW_OPEN.store(false, Ordering::SeqCst);
        Ok(())
    } else {
        Err("Preview window not found".into())
    }
}

/// Reposition the preview window.
#[tauri::command]
fn preview_position(app: AppHandle, x: i32, y: i32) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("preview") {
        let _ = win.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }));
        Ok(())
    } else {
        Err("Preview window not found".into())
    }
}

/// Resize the preview window.
#[tauri::command]
fn preview_set_size(app: AppHandle, width: i32, height: i32) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("preview") {
        let _ = win.set_size(tauri::Size::Physical(tauri::PhysicalSize { width: width as u32, height: height as u32 }));
        Ok(())
    } else {
        Err("Preview window not found".into())
    }
}

/// Authoritative mouse-button state for the frontend. Native modal drag/resize
/// loops (window-edge resize has no JS hook) freeze the webview's hover and
/// swallow events, so the preview can't tell "drag still in progress" from
/// "pointer left the window"; Rust reads GetAsyncKeyState directly (same source
/// as defer_hide_until_mouse_up) so the preview never grace-closes mid-drag.
#[tauri::command]
fn get_deleted(state: State<ClipboardState>) -> Vec<DeletedItem> {
    let now = now_ms();
    let mut deleted = state.deleted.lock().unwrap();
    // Filter out expired
    deleted.retain(|i| i.deleted_at > now);
    deleted.clone()
}

#[tauri::command]
fn restore_from_deleted(state: State<ClipboardState>, id: String) -> Result<ClipboardItem, String> {
    let mut deleted = state.deleted.lock().unwrap();
    if let Some(pos) = deleted.iter().position(|i| i.id == id) {
        let item = deleted.remove(pos);
        drop(deleted);
        // Create history item
        let history_item = ClipboardItem {
            id: item.id.clone(),
            timestamp: item.original_timestamp,
            pinned: false,
            payload: item.payload,
        };
        // Insert back into history at original position (sorted by timestamp)
        let mut history = state.history.lock().unwrap();
        let mut inserted = false;
        for (idx, existing) in history.iter().enumerate() {
            if existing.timestamp < history_item.timestamp {
                history.insert(idx, history_item.clone());
                inserted = true;
                break;
            }
        }
        if !inserted {
            history.push(history_item.clone());
        }
        drop(history);
        // Update DB
        let db = state.db.lock().unwrap();
        if let Some(conn) = db.as_ref() {
            storage::insert(conn, &history_item).ok();
            storage::delete_deleted(conn, &id).ok();
        }
        Ok(history_item)
    } else {
        drop(deleted);
        Err("Item not found in deleted".to_string())
    }
}

#[tauri::command]
fn delete_permanently_from_deleted(state: State<ClipboardState>, id: String) -> Result<(), String> {
    let mut deleted = state.deleted.lock().unwrap();
    deleted.retain(|i| i.id != id);
    drop(deleted);
    let db = state.db.lock().unwrap();
    if let Some(conn) = db.as_ref() {
        storage::delete_deleted(conn, &id)?;
    }
    Ok(())
}

#[tauri::command]
fn purge_expired_deleted(state: State<ClipboardState>) -> Result<(), String> {
    let now = now_ms();
    let mut deleted = state.deleted.lock().unwrap();
    deleted.retain(|i| i.deleted_at > now);
    drop(deleted);
    let db = state.db.lock().unwrap();
    if let Some(conn) = db.as_ref() {
        storage::purge_deleted_before(conn, now)?;
    }
    Ok(())
}

#[tauri::command]
fn is_pointer_held() -> bool {
    mouse_left_button_down()
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

/// Make a window non-activating: it can be shown on top without ever taking
/// focus from the window that currently has it. This is what lets the preview
/// window appear beside the main window while arrow-key traversal keeps working
/// (the main window never sees a focus loss).
#[cfg(windows)]
fn make_non_activating(win: &tauri::WebviewWindow) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetWindowLongPtrW, GWL_EXSTYLE, WS_EX_NOACTIVATE,
    };
    if let Ok(hwnd) = win.hwnd() {
        unsafe {
            let h = hwnd.0 as _;
            let ex = GetWindowLongPtrW(h, GWL_EXSTYLE);
            SetWindowLongPtrW(h, GWL_EXSTYLE, ex | WS_EX_NOACTIVATE as isize);
        }
    }
}

#[cfg(not(windows))]
fn make_non_activating(_win: &tauri::WebviewWindow) {}

/// Toggle whether the preview window may take focus. Off (the default while the
/// user is traversing the main list) it is non-activating, so showing it never
/// steals focus from `main` and arrow keys keep working. On — while the pointer
/// is inside the preview — it becomes a normal window so the user can select
/// and copy text with the mouse.
#[cfg(windows)]
fn set_preview_activatable(win: &tauri::WebviewWindow, activatable: bool) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetWindowLongPtrW, GWL_EXSTYLE, WS_EX_NOACTIVATE,
    };
    if let Ok(hwnd) = win.hwnd() {
        unsafe {
            let h = hwnd.0 as _;
            let ex = GetWindowLongPtrW(h, GWL_EXSTYLE);
            let new = if activatable {
                ex & !(WS_EX_NOACTIVATE as isize)
            } else {
                ex | (WS_EX_NOACTIVATE as isize)
            };
            SetWindowLongPtrW(h, GWL_EXSTYLE, new);
        }
    }
}

#[cfg(not(windows))]
fn set_preview_activatable(_win: &tauri::WebviewWindow, _activatable: bool) {}

/// Called when the pointer enters/leaves the preview window. Entering makes the
/// preview activatable and gives it focus (so text can be selected); leaving
/// makes it non-activating again and returns focus to the main window so
/// keyboard traversal resumes.
#[tauri::command]
fn preview_set_interactive(app: AppHandle, interactive: bool) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("preview") {
        set_preview_activatable(&win, interactive);
        if interactive {
            let _ = win.set_focus();
        } else if let Some(main_win) = app.get_webview_window("main") {
            let _ = main_win.set_focus();
        }
    }
    Ok(())
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

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        // Record when we showed so the Focused(false) handler doesn't immediately hide
        WINDOW_SHOWN_AT.store(now_ms(), Ordering::SeqCst);
        // Center only the first time; afterwards keep the user's position/size
        if !WINDOW_POSITIONED.swap(true, Ordering::SeqCst) {
            let _ = window.center();
        }
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        app_log("main window shown");

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
    } else {
        app_log("show_main_window: window 'main' not found!");
    }
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
            show_main_window(app);
        }
    } else {
        app_log("toggle_window: window 'main' not found!");
    }
}

pub(crate) fn app_log(_msg: &str) {
    // CI captures debug diagnostics from stderr.
    #[cfg(debug_assertions)]
    eprintln!("[clippy] {}", _msg);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    app_log(&format!("{APP_NAME} starting up..."));
    let state = ClipboardState::new();
    let history_arc = Arc::clone(&state.history);
    let db_arc = Arc::clone(&state.db);

    let shortcut: Shortcut = "Ctrl+Shift+Space".parse().expect("failed to parse shortcut");
    let shortcut_clone = shortcut.clone();

    let builder = tauri::Builder::default()
        // Register first so a second launch exits before starting monitors or storage.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }))
        .plugin(tauri_plugin_autostart::Builder::new().app_name(APP_NAME).build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
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
        .manage(state.clone())
        .setup(move |app| {
            app_log("Setup hook entered");

            // Load settings
            let app_settings = settings::load_settings(app.handle());
            storage::set_max_history(app_settings.max_history);
            
            // Load history BEFORE creating the webviews. Building a window can
            // pump messages, letting the page invoke `get_history` while setup
            // is still running; opening storage afterwards made startup racy
            // (the page could render an empty list until the next clipboard
            // event). With the state populated first, the first fetch is correct.
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
                            // Also load deleted items
                            let deleted_items = storage::load_deleted(&conn);
                            let state_app = app.state::<ClipboardState>();
                            let deleted_arc = Arc::clone(&state_app.deleted);
                            *deleted_arc.lock().unwrap() = deleted_items;
                            // Purge expired deleted items on startup
                            let now = now_ms();
                            storage::purge_deleted_before(&conn, now).ok();
                            // Also clean in-memory after purge
                            {
                                let mut deleted_lock = state_app.deleted.lock().unwrap();
                                deleted_lock.retain(|i| i.deleted_at > now);
                            }
                            *db_arc.lock().unwrap() = Some(conn);
                        }
                        Err(e) => {
                            app_log(&format!("Storage open FAILED, running in-memory only: {}", e));
                        }
                    }
                }
                Err(e) => app_log(&format!("No app data dir, running in-memory only: {}", e)),
            }

            // Test/automation hook: wry always supplies its own default
            // AdditionalBrowserArguments, so relying on the WebView2 runtime
            // env var alone is not portable. When a CDP port is requested,
            // pass the args explicitly (keeping wry's defaults).
            let cdp_browser_args = std::env::var("CLIPPY_CDP_PORT").ok().map(|port| {
                format!(
                    "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection \
                     --remote-debugging-port={port} --disable-gpu --no-sandbox"
                )
            });

            // Create main window — start hidden (popup model: shown via shortcut/tray)
            let mut main_builder =
                tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::default())
                    .title(APP_NAME)
                    .inner_size(460.0, 580.0)
                    .min_inner_size(360.0, 420.0)
                    .resizable(true)
                    .decorations(false)
                    .shadow(true)
                    .always_on_top(true)
                    .skip_taskbar(true)
                    .visible(false)   // Start hidden — summoned via Ctrl+Shift+Space or tray
                    .center();
            if let Some(args) = &cdp_browser_args {
                main_builder = main_builder.additional_browser_args(args);
            }
            let main_win = match main_builder.build() {
                Ok(win) => {
                    app_log(&format!("WebviewWindow built: label={}", win.label()));
                    win
                }
                Err(e) => {
                    app_log(&format!("WebviewWindow build FAILED: {}", e));
                    return Err(e.into());
                }
            };
            window_menu::install(&main_win)?;

            // Create preview window — separate always-on-top window. It is made
            // non-activating (WS_EX_NOACTIVATE) so showing it never steals focus
            // from the main window; arrow-key traversal keeps working.
            let mut preview_builder =
                tauri::WebviewWindowBuilder::new(app, "preview", tauri::WebviewUrl::default())
                    .title(format!("{APP_NAME} Preview"))
                    .inner_size(480.0, 580.0)
                    .resizable(false)
                    .decorations(false)
                    .shadow(true)
                    .always_on_top(true)
                    .skip_taskbar(true)
                    .focused(false)
                    .visible(false);   // Shown only while a selection preview is active
            if let Some(args) = &cdp_browser_args {
                preview_builder = preview_builder.additional_browser_args(args);
            }
            let preview_win = match preview_builder.build() {
                Ok(win) => {
                    make_non_activating(&win);
                    app_log(&format!("Preview window built: label={}", win.label()));
                    win
                }
                Err(e) => {
                    app_log(&format!("Preview window build FAILED: {}", e));
                    return Err(e.into());
                }
            };
            window_menu::install(&preview_win)?;

            // Start clipboard monitor
            let app_handle = app.handle().clone();
            clipboard::start_clipboard_monitor(app_handle, app.state::<ClipboardState>().inner().clone());
            app_log("Clipboard monitor started");

            // Register global shortcut
            match app.global_shortcut().register(shortcut) {
                Ok(_) => app_log("Global shortcut Ctrl+Shift+Space registered"),
                Err(e) => app_log(&format!("Global shortcut register failed: {}", e)),
            }

            // Setup system tray
            use tauri::menu::{Menu, MenuItem};
            use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

            let show_label = format!("Show / Hide {APP_NAME}");
            let quit_label = format!("Quit {APP_NAME}");
            match (
                MenuItem::with_id(app, "show", show_label, true, None::<&str>),
                MenuItem::with_id(app, "quit", quit_label, true, None::<&str>),
            ) {
                (Ok(show_i), Ok(quit_i)) => {
                    if let Ok(menu) = Menu::with_items(app, &[&show_i, &quit_i]) {
                        if let Some(icon) = app.default_window_icon() {
                            match TrayIconBuilder::new()
                                .icon(icon.clone())
                                .tooltip(format!("{APP_NAME} — Clipboard Manager"))
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

            app_log(&format!("Setup complete — {APP_NAME} running in tray. Press Ctrl+Shift+Space to open."));

            // Automation hook: on headless/CI sessions WebView2 may defer
            // starting its browser process (and the CDP endpoint) until the
            // window is visible. Never set in normal user runs.
            if std::env::var_os("CLIPPY_SHOW_ON_START").is_some() {
                app_log("CLIPPY_SHOW_ON_START set: showing main window");
                IS_PINNED.store(true, Ordering::SeqCst);
                show_main_window(app.handle());
            }

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
                    // Only the main window owns the auto-hide behaviour; the
                    // preview window losing focus is normal and irrelevant.
                    if window.label() != "main" {
                        return;
                    }
                    // Hide when focus is lost, but only after a grace period from last show
                    // to avoid immediately hiding when first summoned. Never hide while a
                    // native drag/resize is in progress (that reports a focus loss too).
                    // Don't hide if preview window is open
                    if !IS_PINNED.load(Ordering::SeqCst)
                        && !USER_INTERACTING.load(Ordering::SeqCst)
                        && !PREVIEW_OPEN.load(Ordering::SeqCst)
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
            get_current_clipboard_item_id,
            select_item,
            delete_item,
            toggle_pin,
            clear_history,
            get_deleted,
            restore_from_deleted,
            delete_permanently_from_deleted,
            purge_expired_deleted,
            hide_window,
            show_window_menu,
            show_window,
            set_pinned,
            get_pinned,
            set_listening_paused,
            get_listening_paused,
            get_settings,
            save_settings_cmd,
            updates::signed_update_available,
            updates::install_signed_update,
            set_interacting,
            is_pointer_held,
            preview_show,
            preview_update,
            preview_hide,
            preview_position,
            preview_set_size,
            preview_set_interactive
        ]);

    app_log("Entering event loop...");
    let res = builder.run(tauri::generate_context!());
    match res {
        Ok(_) => app_log("Application exited normally"),
        Err(e) => app_log(&format!("Application exited with error: {}", e)),
    }
}
