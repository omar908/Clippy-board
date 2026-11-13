import { listen } from "@tauri-apps/api/event";
import { getSettings, type Theme } from "../api/settings";

let stopFollowingSystem: (() => void) | undefined;

export function applyTheme(theme: Theme) {
  stopFollowingSystem?.();
  stopFollowingSystem = undefined;
  const root = document.documentElement;
  if (theme !== "system") {
    root.dataset.theme = theme;
    return;
  }

  const scheme = window.matchMedia("(prefers-color-scheme: light)");
  const sync = () => { root.dataset.theme = scheme.matches ? "light" : "dark"; };
  sync();
  scheme.addEventListener("change", sync);
  stopFollowingSystem = () => scheme.removeEventListener("change", sync);
}

export async function watchPreviewTheme() {
  let receivedChange = false;
  const unlisten = await listen<Theme>("appearance-theme-changed", ({ payload }) => {
    receivedChange = true;
    applyTheme(payload);
  });
  window.addEventListener("beforeunload", unlisten, { once: true });
  const settings = await getSettings();
  if (!receivedChange) applyTheme(settings.theme);
}
