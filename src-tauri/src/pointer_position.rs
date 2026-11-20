/// Return a near-pointer origin, keeping the window inside the usable monitor.
/// Coordinates and sizes are physical pixels, including negative monitor origins.
fn origin(
    pointer: (i32, i32),
    size: (i32, i32),
    work: (i32, i32, i32, i32),
    gap: i32,
) -> (i32, i32) {
    let (left, top, right, bottom) = work;
    let x = pointer
        .0
        .saturating_add(gap)
        .clamp(left, left.max(right.saturating_sub(size.0)));
    let y = pointer
        .1
        .saturating_add(gap)
        .clamp(top, top.max(bottom.saturating_sub(size.1)));
    (x, y)
}

#[cfg(windows)]
pub fn place(window: &tauri::WebviewWindow) -> bool {
    use windows_sys::Win32::{
        Foundation::{POINT, RECT},
        UI::WindowsAndMessaging::{
            GetCursorPos, GetWindowRect, IsZoomed, SetWindowPos, SWP_NOACTIVATE, SWP_NOZORDER,
        },
    };
    let Ok(hwnd) = window.hwnd() else {
        return false;
    };
    let mut cursor = POINT::default();
    if unsafe { GetCursorPos(&mut cursor) } == 0 {
        return false;
    }
    let Ok(Some(monitor)) = window.monitor_from_point(cursor.x as f64, cursor.y as f64) else {
        return false;
    };
    let work = monitor.work_area();
    let bounds = (
        work.position.x,
        work.position.y,
        work.position.x.saturating_add_unsigned(work.size.width),
        work.position.y.saturating_add_unsigned(work.size.height),
    );
    let gap = (12.0 * monitor.scale_factor()).round() as i32;
    let handle = hwnd.0 as isize;
    window
        .run_on_main_thread(move || {
            let hwnd = handle as windows_sys::Win32::Foundation::HWND;
            // Recheck after dispatch, since the user may have maximized meanwhile.
            if unsafe { IsZoomed(hwnd) } != 0 {
                return;
            }
            let mut rect = RECT::default();
            if unsafe { GetWindowRect(hwnd, &mut rect) } == 0 {
                return;
            }
            let (x, y) = origin(
                (cursor.x, cursor.y),
                (rect.right - rect.left, rect.bottom - rect.top),
                bounds,
                gap,
            );
            // Moving across monitors lets Windows apply WM_DPICHANGED first.
            if unsafe {
                SetWindowPos(
                    hwnd,
                    std::ptr::null_mut(),
                    x,
                    y,
                    0,
                    0,
                    SWP_NOACTIVATE
                        | SWP_NOZORDER
                        | windows_sys::Win32::UI::WindowsAndMessaging::SWP_NOSIZE,
                )
            } == 0
            {
                return;
            }
            if unsafe { GetWindowRect(hwnd, &mut rect) } == 0 {
                return;
            }
            let width = (rect.right - rect.left).min(bounds.2 - bounds.0);
            let height = (rect.bottom - rect.top).min(bounds.3 - bounds.1);
            let (x, y) = origin((cursor.x, cursor.y), (width, height), bounds, gap);
            unsafe {
                SetWindowPos(
                    hwnd,
                    std::ptr::null_mut(),
                    x,
                    y,
                    width,
                    height,
                    SWP_NOACTIVATE | SWP_NOZORDER,
                )
            };
        })
        .is_ok()
}

#[cfg(not(windows))]
pub fn place(_window: &tauri::WebviewWindow) -> bool {
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fits_edges_taskbar_and_negative_monitor_coordinates() {
        assert_eq!(
            origin((100, 100), (460, 580), (0, 0, 1920, 1040), 12),
            (112, 112)
        );
        assert_eq!(
            origin((1919, 1039), (460, 580), (0, 0, 1920, 1040), 12),
            (1460, 460)
        );
        assert_eq!(
            origin((-10, -10), (460, 580), (-1920, -1080, 0, -40), 12),
            (-460, -620)
        );
        assert_eq!(origin((0, 0), (2000, 2000), (0, 40, 800, 600), 12), (0, 40));
    }

    #[test]
    fn fits_physical_sizes_at_different_scaling_levels() {
        for scale in [1.0, 1.25, 1.5, 2.0, 2.25] {
            let size = ((460.0 * scale) as i32, (580.0 * scale) as i32);
            let work = (2560, 0, 5120, 1520);
            let (x, y) = origin((5000, 1500), size, work, (12.0 * scale) as i32);
            assert!(x >= work.0 && y >= work.1);
            assert!(x + size.0 <= work.2 && y + size.1 <= work.3);
        }
    }
}
