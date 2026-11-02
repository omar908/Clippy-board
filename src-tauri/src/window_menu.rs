//! Keep a bare Alt/F10 from taking arrow navigation away from the webview.
//! Alt+Space is forwarded to the shared shortcut router so it can be rebound.

#[cfg(windows)]
mod windows {
    use tauri::Emitter;
    use windows_sys::Win32::{
        Foundation::{HWND, LPARAM, LRESULT, WPARAM},
        UI::{
            Shell::{DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass},
            WindowsAndMessaging::{
                DefWindowProcW, PostMessageW, SC_KEYMENU, WM_APP, WM_NCDESTROY, WM_SYSCOMMAND,
            },
        },
    };

    const SHOW_MENU: u32 = WM_APP + 0x35;
    const ROUTE_MENU_KEY: u32 = WM_APP + 0x36;

    fn suppress(message: u32, command: usize, key: isize) -> bool {
        message == WM_SYSCOMMAND
            && command & 0xfff0 == SC_KEYMENU as usize
            && (key == 0 || key == 32)
    }

    unsafe extern "system" fn window_proc(
        hwnd: HWND,
        message: u32,
        wparam: WPARAM,
        lparam: LPARAM,
        id: usize,
        data: usize,
    ) -> LRESULT {
        if message == ROUTE_MENU_KEY {
            let window = &*(data as *const tauri::WebviewWindow);
            let _ = window.emit("native-menu-key", ());
            return 0;
        }
        if message == SHOW_MENU {
            // Explicit command bypasses the shortcut filter and lets Windows
            // supply its normal menu state, keyboard navigation and actions.
            return DefWindowProcW(hwnd, WM_SYSCOMMAND, SC_KEYMENU as usize, 32);
        }
        if suppress(message, wparam, lparam) {
            if lparam == 32 {
                // Defer frontend IPC until the native key message unwinds.
                PostMessageW(hwnd, ROUTE_MENU_KEY, 0, 0);
            }
            return 0;
        }
        if message == WM_NCDESTROY {
            RemoveWindowSubclass(hwnd, Some(window_proc), id);
            drop(Box::from_raw(data as *mut tauri::WebviewWindow));
        }
        DefSubclassProc(hwnd, message, wparam, lparam)
    }

    pub fn install(window: &tauri::WebviewWindow) -> Result<(), Box<dyn std::error::Error>> {
        // The callback owns its window clone until WM_NCDESTROY.
        let hwnd = window.hwnd()?;
        let data = Box::into_raw(Box::new(window.clone()));
        if unsafe { SetWindowSubclass(hwnd.0 as _, Some(window_proc), 1, data as usize) } == 0 {
            unsafe {
                drop(Box::from_raw(data));
            }
            return Err(std::io::Error::last_os_error().into());
        }
        Ok(())
    }

    pub fn show(window: &tauri::WebviewWindow) -> Result<(), String> {
        let hwnd = window.hwnd().map_err(|error| error.to_string())?;
        // Queue the modal menu after the IPC handler returns.
        if unsafe { PostMessageW(hwnd.0 as _, SHOW_MENU, 0, 0) } == 0 {
            return Err(std::io::Error::last_os_error().to_string());
        }
        Ok(())
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use windows_sys::Win32::UI::WindowsAndMessaging::{SC_CLOSE, SC_RESTORE, WM_KEYDOWN};

        #[test]
        fn blocks_bare_menu_activation_but_preserves_explicit_menu_and_window_commands() {
            assert!(suppress(WM_SYSCOMMAND, SC_KEYMENU as usize, 0));
            assert!(suppress(WM_SYSCOMMAND, SC_KEYMENU as usize | 1, 0));
            assert!(suppress(WM_SYSCOMMAND, SC_KEYMENU as usize, 32)); // Routed Alt+Space
            assert!(!suppress(WM_SYSCOMMAND, SC_KEYMENU as usize, 'p' as isize));
            assert!(!suppress(WM_SYSCOMMAND, SC_CLOSE as usize, 0));
            assert!(!suppress(WM_SYSCOMMAND, SC_RESTORE as usize, 0));
            assert!(!suppress(WM_KEYDOWN, SC_KEYMENU as usize, 0));
        }
    }
}

#[cfg(windows)]
pub use windows::{install, show};

#[cfg(not(windows))]
pub fn install(_window: &tauri::WebviewWindow) -> Result<(), Box<dyn std::error::Error>> {
    Ok(())
}

#[cfg(not(windows))]
pub fn show(_window: &tauri::WebviewWindow) -> Result<(), String> {
    Err("The native window menu is only available on Windows".into())
}
