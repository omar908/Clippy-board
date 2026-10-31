import { invoke } from "@tauri-apps/api/core";

export async function getSettings() {
  return invoke<any>("get_settings");
}

export async function saveSettings(settings: any) {
  return invoke<void>("save_settings_cmd", { settings });
}
