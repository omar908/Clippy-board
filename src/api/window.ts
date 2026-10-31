import { invoke } from "@tauri-apps/api/core";

export async function hideWindow() {
  return invoke<void>("hide_window");
}

export async function showWindow() {
  return invoke<void>("show_window");
}

export async function setInteracting(interacting: boolean) {
  return invoke<boolean>("set_interacting", { interacting });
}
