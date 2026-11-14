use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Theme {
    Light,
    Oled,
    Dark,
    Custom,
    #[default]
    #[serde(other)]
    System,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    #[serde(default = "default_max_history")]
    pub max_history: usize,
    #[serde(default)]
    pub delete_immediately: bool,
    #[serde(default = "default_delete_ttl")]
    pub delete_ttl_seconds: u64,
    #[serde(default)]
    pub shortcuts: std::collections::HashMap<String, String>,
    #[serde(default)]
    pub start_on_login: bool,
    #[serde(default = "default_show_pinned")]
    pub show_pinned_in_all: bool,
    #[serde(default)]
    pub compact_mode: bool,
    #[serde(default = "default_automatic_update_checks")]
    pub automatic_update_checks: bool,
    #[serde(default)]
    pub theme: Theme,
    #[serde(default)]
    pub custom_theme_id: Option<String>,
    #[serde(default)]
    pub custom_themes: Vec<CustomTheme>,
    #[serde(default)]
    pub font: AppearanceFont,
    #[serde(default)]
    pub text_size: TextSize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomTheme {
    pub id: String,
    pub name: String,
    pub base: Theme,
    pub window: String,
    pub card: String,
    pub text: String,
    pub accent: String,
    #[serde(default)]
    pub icons: ThemeIcons,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ThemeIcons {
    #[serde(default)]
    pub style: IconStyle,
    #[serde(default)]
    pub text: bool,
    #[serde(default)]
    pub image: bool,
    #[serde(default)]
    pub file: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum IconStyle {
    Outline,
    #[default]
    #[serde(other)]
    Emoji,
}

pub fn validate_custom_themes(settings: &AppSettings) -> Result<(), String> {
    let mut ids = std::collections::HashSet::new();
    let mut names = std::collections::HashSet::new();
    for theme in &settings.custom_themes {
        if theme.id.is_empty()
            || !ids.insert(&theme.id)
            || theme.name.trim().is_empty()
            || theme.name.chars().count() > 40
            || !names.insert(theme.name.trim().to_lowercase())
            || !matches!(theme.base, Theme::Light | Theme::Dark | Theme::Oled)
            || [&theme.window, &theme.card, &theme.text, &theme.accent].iter().any(|color| {
                color.len() != 7 || !color.starts_with('#') || !color.as_bytes()[1..].iter().all(u8::is_ascii_hexdigit)
            })
        {
            return Err("Each custom theme needs a unique name and valid colors.".into());
        }
    }
    if settings.theme == Theme::Custom
        && !settings.custom_theme_id.as_ref().is_some_and(|id| ids.contains(id))
    {
        return Err("The selected custom theme no longer exists.".into());
    }
    Ok(())
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub enum TextSize {
    #[serde(rename = "85")]
    Small,
    #[serde(rename = "115")]
    Large,
    #[serde(rename = "130")]
    Largest,
    #[default]
    #[serde(rename = "100", other)]
    Standard,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum AppearanceFont {
    OpenDyslexic,
    #[default]
    #[serde(other)]
    System,
}

fn default_automatic_update_checks() -> bool {
    true
}

fn default_show_pinned() -> bool {
    true
}

fn default_max_history() -> usize {
    100
}

fn default_delete_ttl() -> u64 {
    60
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            max_history: 100,
            delete_immediately: false,
            delete_ttl_seconds: 60,
            shortcuts: std::collections::HashMap::new(),
            start_on_login: false,
            show_pinned_in_all: true,
            compact_mode: false,
            automatic_update_checks: default_automatic_update_checks(),
            theme: Theme::default(),
            custom_theme_id: None,
            custom_themes: Vec::new(),
            font: AppearanceFont::default(),
            text_size: TextSize::default(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn old_settings_keep_existing_pinned_visibility_and_startup_is_opt_in() {
        let settings: AppSettings =
            serde_json::from_str(r#"{"shortcuts":{"restore":"Ctrl+K"}}"#).unwrap();
        assert!(settings.show_pinned_in_all);
        assert!(!settings.start_on_login);
        assert!(!settings.compact_mode);
        assert!(settings.automatic_update_checks);
        assert_eq!(settings.theme, Theme::System);
        assert_eq!(settings.font, AppearanceFont::System);
        assert_eq!(settings.text_size, TextSize::Standard);
        assert_eq!(settings.shortcuts["restore"], "Ctrl+K");
    }

    #[test]
    fn compact_mode_and_font_preferences_round_trip() {
        let settings = AppSettings {
            compact_mode: true,
            font: AppearanceFont::OpenDyslexic,
            text_size: TextSize::Small,
            ..AppSettings::default()
        };
        let json = serde_json::to_string(&settings).unwrap();
        let loaded: AppSettings = serde_json::from_str(&json).unwrap();
        assert!(loaded.compact_mode);
        assert_eq!(loaded.font, AppearanceFont::OpenDyslexic);
        assert_eq!(loaded.text_size, TextSize::Small);
    }
}

fn get_settings_path(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_data_dir()
        .ok()
        .map(|dir| dir.join("settings.json"))
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
