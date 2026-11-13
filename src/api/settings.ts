import { invoke } from "@tauri-apps/api/core";

export type Theme = "dark" | "light" | "system" | "oled";

export type AppSettings = {
  max_history: number;
  delete_immediately: boolean;
  delete_ttl_seconds: number;
  shortcuts: Record<string, string>;
  start_on_login: boolean;
  show_pinned_in_all: boolean;
  compact_mode: boolean;
  automatic_update_checks: boolean;
  theme: Theme;
};

export const defaultSettings: AppSettings = {
  max_history: 100, delete_immediately: false, delete_ttl_seconds: 60,
  shortcuts: {}, start_on_login: false, show_pinned_in_all: true, compact_mode: false,
  automatic_update_checks: true, theme: "system",
};

export async function getSettings() {
  return { ...defaultSettings, ...await invoke<AppSettings>("get_settings") };
}

export async function saveSettings(settings: AppSettings, updateStartup = false) {
  return invoke<AppSettings>("save_settings_cmd", { settings, updateStartup });
}
