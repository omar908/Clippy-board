import { listen } from "@tauri-apps/api/event";
import { getSettings, type AppSettings } from "../api/settings";
import { applyPalette } from "./theme-palette";

type Appearance = Pick<AppSettings, "theme" | "font" | "text_size" | "custom_themes" | "custom_theme_id">;

let stopFollowingSystem: (() => void) | undefined;
let clearPalette: (() => void) | undefined;

export function applyAppearance({ theme, font, text_size, custom_themes, custom_theme_id }: Appearance) {
  stopFollowingSystem?.();
  stopFollowingSystem = undefined;
  const root = document.documentElement;
  clearPalette?.();
  const custom = theme === "custom" ? custom_themes?.find(entry => entry.id === custom_theme_id) : undefined;
  clearPalette = applyPalette(root, custom);
  const base = custom?.base ?? (theme === "custom" ? "system" : theme);
  root.dataset.font = font;
  root.dataset.textSize = text_size;
  if (base !== "system") {
    root.dataset.theme = base;
    return;
  }

  const scheme = window.matchMedia("(prefers-color-scheme: light)");
  const sync = () => { root.dataset.theme = scheme.matches ? "light" : "dark"; };
  sync();
  scheme.addEventListener("change", sync);
  stopFollowingSystem = () => scheme.removeEventListener("change", sync);
}

export async function watchPreviewAppearance() {
  let receivedChange = false;
  const unlisten = await listen<Appearance>("appearance-changed", ({ payload }) => {
    receivedChange = true;
    applyAppearance(payload);
  });
  window.addEventListener("beforeunload", unlisten, { once: true });
  const settings = await getSettings();
  if (!receivedChange) applyAppearance(settings);
}
