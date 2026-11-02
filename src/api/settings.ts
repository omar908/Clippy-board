import { invoke } from "@tauri-apps/api/core";

export type AppSettings = {
  max_history: number;
  delete_immediately: boolean;
  delete_ttl_seconds: number;
  shortcuts: Record<string, string>;
};

export async function getSettings() {
  return invoke<AppSettings>("get_settings");
}

export async function saveSettings(settings: AppSettings) {
  return invoke<void>("save_settings_cmd", { settings });
}
