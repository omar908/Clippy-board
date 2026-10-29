use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    #[serde(default = "default_max_history")]
    pub max_history: usize,
    #[serde(default)]
    pub delete_immediately: bool, // if true and ttl is 0 or this flag set, delete immediately
    #[serde(default)]
    pub shortcuts: std::collections::HashMap<String, String>,
}

fn default_max_history() -> usize {
    100
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            max_history: 100,
            delete_immediately: false,
            shortcuts: std::collections::HashMap::new(),
        }
    }
}

fn get_settings_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|dir| dir.join("settings.json"))
}

pub fn load_settings(app: &AppHandle) -> AppSettings {
    if let Some(path) = get_settings_path(app) {
        if path.exists() {
            if let Ok(contents) = fs::read_to_string(&path) {
                if let Ok(settings) = serde_json::from_str(&contents) {
                    return settings;
                }
            }
        }
    }
    AppSettings::default()
}

pub fn save_settings(app: &AppHandle, settings: &AppSettings) -> Result<(), String> {
    if let Some(path) = get_settings_path(app) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let contents = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
        fs::write(&path, contents).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Could not get settings path".to_string())
    }
}
