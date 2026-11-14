import { invoke } from "@tauri-apps/api/core";

export type Theme = "dark" | "light" | "system" | "oled";
export type ThemeIcons = {
  style: "emoji" | "outline";
  text: boolean; image: boolean; file: boolean;
  overrides?: Record<string, string>;
};
export type CustomTheme = {
  id: string; name: string; base: Exclude<Theme, "system">;
  window: string; card: string; text: string; accent: string;
  icons?: ThemeIcons;
};
export type AppearanceFont = "system" | "open-dyslexic";

export type AppSettings = {
  max_history: number;
  delete_immediately: boolean;
  delete_ttl_seconds: number;
  shortcuts: Record<string, string>;
  start_on_login: boolean;
  show_pinned_in_all: boolean;
  compact_mode: boolean;
  automatic_update_checks: boolean;
  theme: Theme | "custom";
  custom_theme_id: string | null;
  custom_themes: CustomTheme[];
  font: AppearanceFont;
  text_size: "85" | "100" | "115" | "130";
};

export const defaultSettings: AppSettings = {
  max_history: 100, delete_immediately: false, delete_ttl_seconds: 60,
  shortcuts: {}, start_on_login: false, show_pinned_in_all: true, compact_mode: false,
  automatic_update_checks: true, theme: "system", font: "system", text_size: "100",
  custom_theme_id: null, custom_themes: [],
};

export async function getSettings() {
  return { ...defaultSettings, ...await invoke<AppSettings>("get_settings") };
}

export async function saveSettings(settings: AppSettings, updateStartup = false) {
  return invoke<AppSettings>("save_settings_cmd", { settings, updateStartup });
}
