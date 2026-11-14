import type { CustomTheme } from "../api/settings";
import { colorKeys, validColor } from "./theme-palette";

export type ThemeDraft = Omit<CustomTheme, "id">;
const format = "clippy-board-theme";
const version = 1;

export function exportTheme({ name, base, window, card, text, accent }: CustomTheme) {
  return JSON.stringify({ format, version, name, base, window, card, text, accent }, null, 2) + "\n";
}

export async function importTheme(file: File): Promise<ThemeDraft> {
  if (file.size > 16 * 1024) throw new Error("Theme files must be 16 KB or smaller.");
  let value: unknown;
  try {
    value = JSON.parse(await file.text());
  } catch {
    throw new Error("Couldn’t read the theme file. Choose a valid JSON file.");
  }
  if (!value || typeof value !== "object" || !("format" in value) || value.format !== format) {
    throw new Error("Choose a Clippy-board theme file.");
  }
  const data = value as Record<string, unknown>;
  if (data.version !== version) throw new Error("This theme file version is unsupported.");
  const { name, base } = data;
  if (typeof name !== "string" || !name.trim() || Array.from(name.trim()).length > 40
      || (base !== "dark" && base !== "light" && base !== "oled")) {
    throw new Error("The theme needs a valid name and starting theme.");
  }
  const colors = {} as Pick<ThemeDraft, typeof colorKeys[number]>;
  for (const key of colorKeys) {
    const color = data[key];
    if (typeof color !== "string" || !validColor(color)) throw new Error(`Invalid ${key} color in the theme file.`);
    colors[key] = color;
  }
  return { name: name.trim(), base, ...colors };
}

export function availableThemeName(name: string, themes: CustomTheme[]) {
  const names = new Set(themes.map(theme => theme.name.trim().toLowerCase()));
  let candidate = name;
  for (let number = 2; names.has(candidate.toLowerCase()); number++) {
    const suffix = ` (${number})`;
    candidate = Array.from(name).slice(0, 40 - suffix.length).join("").trimEnd() + suffix;
  }
  return candidate;
}
