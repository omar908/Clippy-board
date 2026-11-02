//! Keep a bare Alt/F10 from taking arrow navigation away from the webview.
//! Alt+Space still opens the native system menu; Alt shortcuts pass through.

#[cfg(windows)]
mod windows {
    use windows_sys::Win32::{
        Foundation::{HWND, LPARAM, LRESULT, WPARAM},
        UI::{
            Shell::{DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass},
            WindowsAndMessaging::{SC_KEYMENU, WM_NCDESTROY, WM_SYSCOMMAND},
        },
    };

    fn suppress(message: u32, command: usize, key: isize) -> bool {
        message == WM_SYSCOMMAND && command & 0xfff0 == SC_KEYMENU as usize && key == 0
    }

    unsafe extern "system" fn window_proc(
        hwnd: HWND,
        message: u32,
        wparam: WPARAM,
        lparam: LPARAM,
        id: usize,
        _data: usize,
    ) -> LRESULT {
        if suppress(message, wparam, lparam) {
            return 0;
        }
        if message == WM_NCDESTROY {
            RemoveWindowSubclass(hwnd, Some(window_proc), id);
        }
        DefSubclassProc(hwnd, message, wparam, lparam)
    }

    pub fn install(window: &tauri::WebviewWindow) -> Result<(), Box<dyn std::error::Error>> {
        // Called from setup on the window-owning UI thread. No borrowed state
        // is stored in the callback, and it removes itself on WM_NCDESTROY.
        let hwnd = window.hwnd()?;
        if unsafe { SetWindowSubclass(hwnd.0 as _, Some(window_proc), 1, 0) } == 0 {
            return Err(std::io::Error::last_os_error().into());
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
            assert!(!suppress(WM_SYSCOMMAND, SC_KEYMENU as usize, 32)); // Alt+Space
            assert!(!suppress(WM_SYSCOMMAND, SC_KEYMENU as usize, 'p' as isize));
            assert!(!suppress(WM_SYSCOMMAND, SC_CLOSE as usize, 0));
            assert!(!suppress(WM_SYSCOMMAND, SC_RESTORE as usize, 0));
            assert!(!suppress(WM_KEYDOWN, SC_KEYMENU as usize, 0));
        }
    }
}

#[cfg(windows)]
pub use windows::install;

#[cfg(not(windows))]
pub fn install(_window: &tauri::WebviewWindow) -> Result<(), Box<dyn std::error::Error>> {
    Ok(())
}
