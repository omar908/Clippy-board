use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

pub static IS_SELF_COPY: AtomicBool = AtomicBool::new(false);
static SELF_COPY_SEQUENCE: AtomicU32 = AtomicU32::new(0);
pub static IS_LISTENING_PAUSED: AtomicBool = AtomicBool::new(false);

pub(crate) fn sequence_number() -> u32 {
    win32::get_sequence_number()
}

fn is_self_copy(sequence: u32) -> bool {
    IS_SELF_COPY.load(Ordering::SeqCst)
        || (sequence != 0 && sequence == SELF_COPY_SEQUENCE.load(Ordering::SeqCst))
}

#[cfg(test)]
mod self_copy_tests {
    use super::*;

    #[test]
    fn late_monitor_poll_skips_own_write_and_failed_copy_does_not_leave_monitor_paused() {
        SELF_COPY_SEQUENCE.store(123, Ordering::SeqCst);
        IS_SELF_COPY.store(false, Ordering::SeqCst);
        // Simulate a poll after the write has returned, then an external copy.
        assert!(is_self_copy(123));
        assert!(!is_self_copy(124));
        assert!(!is_self_copy(0));
        let invalid_image = ClipboardPayload::Image {
            data_url: "data:image/png;base64,!!".into(), thumbnail: None,
            width: 1, height: 1, byte_size: 1,
        };
        assert!(write_clipboard(&invalid_image).is_err());
        assert!(!IS_SELF_COPY.load(Ordering::SeqCst));
        assert!(is_self_copy(123));
        assert!(!is_self_copy(124));
        SELF_COPY_SEQUENCE.store(0, Ordering::SeqCst);
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", content = "payload")]
pub enum ClipboardPayload {
    #[serde(rename = "text")]
    Text {
        text: String,
        preview: String,
        char_count: usize,
        line_count: usize,
    },
    #[serde(rename = "image")]
    Image {
        data_url: String,
        /// Small PNG data URL (fit within 480px) used for list rendering.
        /// The full-resolution `data_url` stays authoritative for restore.
        #[serde(default)]
        thumbnail: Option<String>,
        width: usize,
        height: usize,
        byte_size: usize,
    },
    #[serde(rename = "file")]
    File {
        paths: Vec<String>,
        count: usize,
        preview: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipboardItem {
    pub id: String,
    pub timestamp: u64,
    #[serde(default)]
    pub pinned: bool,
    #[serde(flatten)]
    pub payload: ClipboardPayload,
}

/// A soft-deleted clipboard entry. `original_timestamp` keeps the item's
/// place in history so an Undo can put it back exactly where it was;
/// `deleted_at` drives the TTL after which the entry is permanently purged.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeletedItem {
    pub id: String,
    pub original_timestamp: u64,
    pub deleted_at: u64,
    #[serde(flatten)]
    pub payload: ClipboardPayload,
}

#[derive(Clone)]
pub struct ClipboardState {
    pub current_payload: Arc<Mutex<Option<ClipboardPayload>>>,
    pub history: Arc<Mutex<Vec<ClipboardItem>>>,
    /// SQLite connection for persistent history (None = storage unavailable,
    /// the app degrades to in-memory-only behavior).
    pub db: Arc<Mutex<Option<rusqlite::Connection>>>,
    /// Soft-deleted entries waiting out their TTL (temp delete / trash).
    pub deleted: Arc<Mutex<Vec<DeletedItem>>>,
}

impl ClipboardState {
    pub fn new() -> Self {
        Self {
            current_payload: Arc::new(Mutex::new(None)),
            history: Arc::new(Mutex::new(Vec::new())),
            db: Arc::new(Mutex::new(None)),
            deleted: Arc::new(Mutex::new(Vec::new())),
        }
    }
}

/// Helper to get current timestamp in milliseconds
fn current_time_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

// Windows native clipboard functions for CF_HDROP and formats
#[cfg(target_os = "windows")]
mod win32 {
    use std::ptr::null_mut;
    use windows_sys::Win32::Foundation::{HANDLE, POINT};
    use windows_sys::Win32::System::DataExchange::{
        CloseClipboard, EmptyClipboard, GetClipboardData, GetClipboardSequenceNumber,
        IsClipboardFormatAvailable, OpenClipboard, SetClipboardData,
    };
    use windows_sys::Win32::System::Memory::{
        GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE,
    };
    use windows_sys::Win32::UI::Shell::{DragQueryFileW, DROPFILES};

    pub const CF_HDROP: u32 = 15;

    pub fn get_sequence_number() -> u32 {
        unsafe { GetClipboardSequenceNumber() }
    }

    /// Try to open clipboard with retries in case another process is writing to it
    pub fn open_clipboard_with_retry() -> bool {
        for _ in 0..10 {
            if unsafe { OpenClipboard(null_mut()) } != 0 {
                return true;
            }
            std::thread::sleep(std::time::Duration::from_millis(15));
        }
        false
    }

    pub fn has_file_drop() -> bool {
        unsafe { IsClipboardFormatAvailable(CF_HDROP) != 0 }
    }

    /// Read file paths from CF_HDROP
    pub fn read_file_drop() -> Option<Vec<String>> {
        if !has_file_drop() {
            return None;
        }

        if !open_clipboard_with_retry() {
            return None;
        }

        let mut paths = Vec::new();
        unsafe {
            let handle = GetClipboardData(CF_HDROP);
            if !handle.is_null() {
                let hdrop = handle as windows_sys::Win32::UI::Shell::HDROP;
                let count = DragQueryFileW(hdrop, 0xFFFFFFFF, null_mut(), 0);
                for i in 0..count {
                    let len = DragQueryFileW(hdrop, i, null_mut(), 0);
                    if len > 0 {
                        let mut buffer: Vec<u16> = vec![0; (len + 1) as usize];
                        DragQueryFileW(hdrop, i, buffer.as_mut_ptr(), len + 1);
                        if let Ok(path) = String::from_utf16(&buffer[..len as usize]) {
                            paths.push(path);
                        }
                    }
                }
            }
            CloseClipboard();
        }

        if paths.is_empty() {
            None
        } else {
            Some(paths)
        }
    }

    /// Write file paths to CF_HDROP
    pub fn write_file_drop(paths: &[String]) -> Result<(), String> {
        if paths.is_empty() {
            return Ok(());
        }

        let mut utf16_data: Vec<u16> = Vec::new();
        for path in paths {
            utf16_data.extend(path.encode_utf16());
            utf16_data.push(0); // Null terminator between paths
        }
        utf16_data.push(0); // Double null terminator at the end

        let dropfiles_size = std::mem::size_of::<DROPFILES>();
        let data_size = utf16_data.len() * std::mem::size_of::<u16>();
        let total_size = dropfiles_size + data_size;

        unsafe {
            let h_mem = GlobalAlloc(GMEM_MOVEABLE, total_size);
            if h_mem.is_null() {
                return Err("Failed to allocate global memory for HDROP".to_string());
            }

            let p_mem = GlobalLock(h_mem);
            if p_mem.is_null() {
                return Err("Failed to lock global memory for HDROP".to_string());
            }

            let dropfiles = p_mem as *mut DROPFILES;
            (*dropfiles).pFiles = dropfiles_size as u32;
            (*dropfiles).pt = POINT { x: 0, y: 0 };
            (*dropfiles).fNC = 0;
            (*dropfiles).fWide = 1; // Wide / Unicode strings

            let dest_paths = (p_mem as *mut u8).add(dropfiles_size) as *mut u16;
            std::ptr::copy_nonoverlapping(utf16_data.as_ptr(), dest_paths, utf16_data.len());

            GlobalUnlock(h_mem);

            if !open_clipboard_with_retry() {
                return Err("Failed to open clipboard for writing HDROP".to_string());
            }

            EmptyClipboard();
            let res = SetClipboardData(CF_HDROP, h_mem as HANDLE);
            CloseClipboard();

            if res.is_null() {
                Err("SetClipboardData for CF_HDROP failed".to_string())
            } else {
                Ok(())
            }
        }
    }
}

#[cfg(not(target_os = "windows"))]
mod win32 {
    pub fn get_sequence_number() -> u32 { 0 }
    pub fn has_file_drop() -> bool { false }
    pub fn read_file_drop() -> Option<Vec<String>> { None }
    pub fn write_file_drop(_paths: &[String]) -> Result<(), String> { Ok(()) }
}

/// Maximum dimension (px) for the display thumbnail. Full-resolution image
/// stays in `data_url`; this is only what the list renders (see ADR-0004).
const THUMBNAIL_MAX_DIM: u32 = 480;

/// Build a small PNG data URL for an image, preserving aspect ratio.
/// Returns None if downscaling/encoding fails (caller keeps full image only).
fn make_thumbnail(img: &image::RgbaImage, width: u32, height: u32) -> Option<String> {
    let longest = width.max(height);
    if longest <= THUMBNAIL_MAX_DIM {
        // Small enough already — re-encode as-is
        let mut png = Vec::new();
        let enc = image::codecs::png::PngEncoder::new(&mut png);
        use image::ImageEncoder;
        enc.write_image(img, width, height, image::ExtendedColorType::Rgba8)
            .ok()?;
        use base64::Engine;
        return Some(format!(
            "data:image/png;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(&png)
        ));
    }

    let dyn_img = image::DynamicImage::ImageRgba8(img.clone());
    let thumb = dyn_img.thumbnail(THUMBNAIL_MAX_DIM, THUMBNAIL_MAX_DIM);
    let mut png = Vec::new();
    let mut cursor = std::io::Cursor::new(&mut png);
    thumb.write_to(&mut cursor, image::ImageFormat::Png).ok()?;
    use base64::Engine;
    Some(format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(&png)
    ))
}

/// Read current clipboard content into a ClipboardPayload
pub fn read_clipboard() -> Option<ClipboardPayload> {
    // 1. Check for File Drop (CF_HDROP) first
    #[cfg(target_os = "windows")]
    {
        if win32::has_file_drop() {
            if let Some(paths) = win32::read_file_drop() {
                let count = paths.len();
                let preview = if count == 1 {
                    Path::new(&paths[0])
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or(&paths[0])
                        .to_string()
                } else {
                    let first = Path::new(&paths[0])
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("file");
                    format!("{} (+{} more files)", first, count - 1)
                };
                return Some(ClipboardPayload::File {
                    paths,
                    count,
                    preview,
                });
            }
        }
    }

    // 2. Check for Image content
    if let Ok(mut clipboard) = arboard::Clipboard::new() {
        if let Ok(img) = clipboard.get_image() {
            let width = img.width;
            let height = img.height;
            let bytes = img.bytes.into_owned();

            if let Some(rgba_img) = image::RgbaImage::from_raw(width as u32, height as u32, bytes) {
                let mut png_bytes = Vec::new();
                let encoder = image::codecs::png::PngEncoder::new(&mut png_bytes);
                use image::ImageEncoder;
                if encoder
                    .write_image(
                        &rgba_img,
                        width as u32,
                        height as u32,
                        image::ExtendedColorType::Rgba8,
                    )
                    .is_ok()
                {
                    use base64::Engine;
                    let b64 = base64::engine::general_purpose::STANDARD.encode(&png_bytes);
                    let data_url = format!("data:image/png;base64,{}", b64);
                    let byte_size = png_bytes.len();
                    let thumbnail = make_thumbnail(&rgba_img, width as u32, height as u32);
                    return Some(ClipboardPayload::Image {
                        data_url,
                        thumbnail,
                        width,
                        height,
                        byte_size,
                    });
                }
            }
        }
    }

    // 3. Check for Text content
    if let Ok(mut clipboard) = arboard::Clipboard::new() {
        if let Ok(text) = clipboard.get_text() {
            let trimmed = text.trim();
            if !trimmed.is_empty() {
                let char_count = text.chars().count();
                let line_count = text.lines().count();
                // Create preview: first ~100 characters or first 2 lines
                let preview: String = text
                    .lines()
                    .take(2)
                    .collect::<Vec<&str>>()
                    .join(" ")
                    .chars()
                    .take(120)
                    .collect();
                return Some(ClipboardPayload::Text {
                    text,
                    preview,
                    char_count,
                    line_count,
                });
            }
        }
    }

    None
}

/// Write a ClipboardPayload back to the OS clipboard
pub fn write_clipboard(payload: &ClipboardPayload) -> Result<(), String> {
    IS_SELF_COPY.store(true, Ordering::SeqCst);

    // Keep fallible decoding/opening inside the closure so every error path
    // clears the in-flight flag below.
    let result = (|| match payload {
        ClipboardPayload::Text { text, .. } => {
            let mut clipboard = arboard::Clipboard::new()
                .map_err(|e| format!("Failed to open clipboard: {}", e))?;
            clipboard
                .set_text(text)
                .map_err(|e| format!("Failed to set text: {}", e))
        }
        ClipboardPayload::Image {
            width,
            height,
            data_url,
            ..
        } => {
            // Extract raw bytes from base64 data URL
            let prefix = "data:image/png;base64,";
            if let Some(b64) = data_url.strip_prefix(prefix) {
                use base64::Engine;
                let png_bytes = base64::engine::general_purpose::STANDARD
                    .decode(b64)
                    .map_err(|e| format!("Failed to decode PNG base64: {}", e))?;
                let img = image::load_from_memory(&png_bytes)
                    .map_err(|e| format!("Failed to load PNG: {}", e))?
                    .to_rgba8();

                let mut clipboard = arboard::Clipboard::new()
                    .map_err(|e| format!("Failed to open clipboard: {}", e))?;
                clipboard
                    .set_image(arboard::ImageData {
                        width: *width,
                        height: *height,
                        bytes: std::borrow::Cow::Owned(img.into_raw()),
                    })
                    .map_err(|e| format!("Failed to set image: {}", e))
            } else {
                Err("Invalid image data url".to_string())
            }
        }
        ClipboardPayload::File { paths, .. } => {
            #[cfg(target_os = "windows")]
            {
                win32::write_file_drop(paths)
            }
            #[cfg(not(target_os = "windows"))]
            {
                let _ = paths;
                Err("File clipboard writing only supported on Windows".to_string())
            }
        }
    })();

    // A polling monitor can observe the write after this function returns.
    // Remember the OS sequence rather than depending on a short timed flag.
    if result.is_ok() {
        SELF_COPY_SEQUENCE.store(win32::get_sequence_number(), Ordering::SeqCst);
    }
    IS_SELF_COPY.store(false, Ordering::SeqCst);

    result
}

/// Move the entry at `pos` to the top of `history`, refreshing its timestamp.
///
/// Shared by live dedup (`record_capture`) and restore-from-history
/// (`bump_on_select`): in both cases the item just became the clipboard's
/// most recent content, so it takes the top slot.
fn move_to_top(history: &mut Vec<ClipboardItem>, pos: usize, now: u64) -> ClipboardItem {
    let mut existing = history.remove(pos);
    existing.timestamp = now;
    history.insert(0, existing.clone());
    existing
}

/// Record a captured clipboard payload into history.
///
/// Full-history dedup: if an equal payload already exists *anywhere* in
/// history, that entry is moved to the top with a refreshed timestamp
/// instead of creating a duplicate — the clipboard now holds it, so it is
/// the most recent item.
///
/// `move_existing` is false for the startup capture: at launch we only want
/// to avoid re-adding the clipboard's current content (which is almost
/// always already item #1 from the last session); restarting the app must
/// not reorder history as a side effect.
///
/// Emits `clipboard-updated` with the item that ended up at the top.
/// Storage writes are best-effort (logged, never fatal to the monitor).
fn record_capture(
    app_handle: &AppHandle,
    state: &Arc<Mutex<Vec<ClipboardItem>>>,
    db: &Arc<Mutex<Option<rusqlite::Connection>>>,
    payload: ClipboardPayload,
    move_existing: bool,
) {
    let now = current_time_ms();
    let item = {
        let mut history = state.lock().unwrap();
        match history.iter().position(|i| i.payload == payload) {
            Some(pos) if move_existing => {
                let item = move_to_top(&mut history, pos, now);
                crate::app_log(&format!(
                    "Dedup: moved existing item id={} to top",
                    item.id
                ));
                item
            }
            Some(_) => {
                // Startup: content already in history — leave order untouched.
                crate::app_log("Dedup: startup clipboard already in history, skipped");
                return;
            }
            None => {
                let item = ClipboardItem {
                    id: format!("{}-{}", now, history.len() + 1),
                    timestamp: now,
                    pinned: false,
                    payload,
                };
                history.insert(0, item.clone());
                let max_h = crate::storage::get_max_history();
                if history.len() > max_h {
                    // Don't trim pinned items
                    let mut kept = Vec::new();
                    let mut unpinned = Vec::new();
                    for i in history.drain(..) {
                        if i.pinned {
                            kept.push(i);
                        } else {
                            unpinned.push(i);
                        }
                    }
                    unpinned.truncate(max_h.saturating_sub(kept.len()));
                    kept.extend(unpinned);
                    *history = kept;
                }
                item
            }
        }
    };

    // Persist (best-effort) — INSERT OR REPLACE also handles the
    // moved-and-retimestamped case.
    {
        let db = db.lock().unwrap();
        if let Some(conn) = db.as_ref() {
            if let Err(e) = crate::storage::insert(conn, &item) {
                crate::app_log(&format!("storage: insert failed: {}", e));
            }
            if let Err(e) = crate::storage::trim(conn, crate::storage::get_max_history()) {
                crate::app_log(&format!("storage: trim failed: {}", e));
            }
        }
    }

    let _ = app_handle.emit("clipboard-updated", &item);
}

/// Bump an existing history entry to the top after the user restores it from
/// the Clippy list (`select_item`).
///
/// This mirrors the live-capture dedup rule: whatever sits on the OS clipboard
/// is the most recent item. Selection is suppressed from the monitor by
/// `IS_SELF_COPY`, so the reorder happens directly here — keyed by id, after
/// the clipboard write has succeeded (a failed restore must not reorder).
/// Returns the moved item so the caller can emit it to the frontend.
///
/// Lock order: history mutex → released → db mutex → released → emit.
pub fn bump_on_select(
    state: &ClipboardState,
    id: &str,
) -> Option<ClipboardItem> {
    let now = current_time_ms();
    let item = {
        let mut history = state.history.lock().unwrap();
        let pos = history.iter().position(|i| i.id == id)?;
        let item = move_to_top(&mut history, pos, now);
        crate::app_log(&format!(
            "Select: moved existing item id={} to top",
            item.id
        ));
        item
    };

    {
        let db = state.db.lock().unwrap();
        if let Some(conn) = db.as_ref() {
            if let Err(e) = crate::storage::insert(conn, &item) {
                crate::app_log(&format!("storage: insert failed: {}", e));
            }
        }
    }

    Some(item)
}

/// Start background clipboard monitoring thread
pub fn start_clipboard_monitor(
    app_handle: AppHandle,
    state: ClipboardState,
) {
    std::thread::spawn(move || {
        // Startup capture: only add if the current clipboard is NOT already
        // anywhere in the loaded history (never reorder on launch).
        let mut last_seq = win32::get_sequence_number();
        let initial = read_clipboard();
        if let Some(payload) = initial.clone() {
            record_capture(&app_handle, &state.history, &state.db, payload, false);
        }
        crate::current_clipboard::update(&app_handle, initial, last_seq);
        loop {
            std::thread::sleep(std::time::Duration::from_millis(150));

            let current_seq = win32::get_sequence_number();
            if current_seq != last_seq {
                last_seq = current_seq;

                // Check if this was triggered by our own copy operation
                if is_self_copy(current_seq) {
                    continue;
                }

                let payload = read_clipboard();
                // A clipboard change during a read invalidates this snapshot.
                if win32::get_sequence_number() != current_seq {
                    continue;
                }
                if !IS_LISTENING_PAUSED.load(Ordering::SeqCst) {
                    if let Some(payload) = payload.clone() {
                        record_capture(&app_handle, &state.history, &state.db, payload, true);
                    }
                }
                crate::current_clipboard::update(&app_handle, payload, current_seq);
            }
        }
    });
}
