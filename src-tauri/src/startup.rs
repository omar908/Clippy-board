//! The OS registration is authoritative; never apply it automatically at launch.
use tauri::AppHandle;
use tauri_plugin_autostart::ManagerExt;

#[cfg(windows)]
const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";

#[cfg(windows)]
fn registered() -> Result<bool, String> {
    use winreg::{enums::HKEY_CURRENT_USER, RegKey};
    let result = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(RUN_KEY)
        .and_then(|key| key.get_value::<String, _>(crate::APP_NAME));
    match result {
        Ok(_) => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error.to_string()),
    }
}

pub fn enabled(app: &AppHandle) -> Result<bool, String> {
    // The compatible plugin version expects the Run key to exist. A fresh
    // Windows account with no startup entries simply has autostart off.
    #[cfg(windows)]
    if !registered()? {
        return Ok(false);
    }
    app.autolaunch()
        .is_enabled()
        .map_err(|error| error.to_string())
}

pub fn set_enabled(app: &AppHandle, enabled: bool) -> Result<(), String> {
    #[cfg(windows)]
    {
        use winreg::{enums::HKEY_CURRENT_USER, RegKey};
        if enabled {
            let (key, _) = RegKey::predef(HKEY_CURRENT_USER)
                .create_subkey(RUN_KEY)
                .map_err(|error| error.to_string())?;
            app.autolaunch()
                .enable()
                .map_err(|error| error.to_string())?;
            // Quote the executable explicitly: installed paths may contain spaces.
            let executable = std::env::current_exe().map_err(|error| error.to_string())?;
            key.set_value(crate::APP_NAME, &format!("\"{}\"", executable.display()))
                .map_err(|error| error.to_string())?;
            return Ok(());
        }
        if !registered()? {
            return Ok(());
        }
    }
    if enabled {
        app.autolaunch().enable()
    } else {
        app.autolaunch().disable()
    }
    .map_err(|error| error.to_string())
}

/// Roll back the OS change if saving preferences fails. Unchanged startup
/// controls never touch the registry, including changes made in Task Manager.
pub fn save(
    before: bool,
    requested: bool,
    mut apply: impl FnMut(bool) -> Result<(), String>,
    persist: impl FnOnce() -> Result<(), String>,
) -> Result<(), String> {
    let changed = before != requested;
    let result = if changed {
        apply(requested).and_then(|_| persist())
    } else {
        persist()
    };
    if let Err(error) = result {
        if changed {
            if let Err(rollback) = apply(before) {
                return Err(format!(
                    "{error}. Could not restore startup setting: {rollback}"
                ));
            }
        }
        return Err(error);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;

    #[test]
    fn unchanged_startup_does_not_rewrite_os_state() {
        save(
            false,
            false,
            |_| panic!("must not touch registry"),
            || Ok(()),
        )
        .unwrap();
    }

    #[test]
    fn failed_persistence_restores_previous_startup_state() {
        let enabled = Cell::new(false);
        assert!(save(
            false,
            true,
            |value| {
                enabled.set(value);
                Ok(())
            },
            || Err("disk full".into())
        )
        .is_err());
        assert!(!enabled.get());
    }

    #[test]
    fn successful_save_applies_startup_once() {
        let calls = Cell::new(0);
        save(
            false,
            true,
            |value| {
                assert!(value);
                calls.set(calls.get() + 1);
                Ok(())
            },
            || Ok(()),
        )
        .unwrap();
        assert_eq!(calls.get(), 1);
    }
}
