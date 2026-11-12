use std::time::Duration;
use tauri::{AppHandle, WebviewWindow};
use tauri_plugin_updater::{Update, UpdaterExt};

static INSTALLING: tauri::async_runtime::Mutex<()> = tauri::async_runtime::Mutex::const_new(());

fn configured(app: &AppHandle) -> bool {
    cfg!(windows)
        && app
            .config()
            .plugins
            .0
            .get("updater")
            .and_then(|config| config.get("pubkey"))
            .and_then(serde_json::Value::as_str)
            .is_some_and(|key| !key.trim().is_empty())
}

async fn matching_update(
    app: &AppHandle,
    version: &str,
    timeout: Duration,
) -> Result<Option<Update>, String> {
    let update = app
        .updater_builder()
        .timeout(timeout)
        .build()
        .map_err(|error| error.to_string())?
        .check()
        .await
        .map_err(|error| error.to_string())?;
    Ok(update.filter(|update| update.version == version))
}

#[tauri::command]
pub async fn signed_update_available(
    app: AppHandle,
    window: WebviewWindow,
    version: String,
) -> Result<bool, String> {
    if window.label() != "main" || !configured(&app) {
        return Ok(false);
    }
    Ok(matching_update(&app, &version, Duration::from_secs(10))
        .await?
        .is_some())
}

#[tauri::command]
pub async fn install_signed_update(
    app: AppHandle,
    window: WebviewWindow,
    version: String,
) -> Result<(), String> {
    if window.label() != "main" || !configured(&app) {
        return Err("In-app updates are unavailable in this build.".into());
    }
    let _guard = INSTALLING
        .try_lock()
        .map_err(|_| "An update is already installing.")?;
    let update = matching_update(&app, &version, Duration::from_secs(180))
        .await?
        .ok_or("This update is no longer available. Check for updates again.")?;

    // Tauri verifies the download before starting the Windows installer.
    // The installer handles the app restart after installation.
    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|error| {
            crate::app_log(&format!("Update installation failed: {error}"));
            "Couldn’t install the signed update. Check again or open the release page.".into()
        })
}
