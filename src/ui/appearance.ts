import { listen } from "@tauri-apps/api/event";
import { getSettings, type AppSettings } from "../api/settings";

type Appearance = Pick<AppSettings, "theme" | "font" | "text_size">;

let stopFollowingSystem: (() => void) | undefined;

export function applyAppearance({ theme, font, text_size }: Appearance) {
  stopFollowingSystem?.();
  stopFollowingSystem = undefined;
  const root = document.documentElement;
  root.dataset.font = font;
  root.dataset.textSize = text_size;
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
