import type { CustomTheme } from "../api/settings";
import { colorKeys, validColor } from "./theme-palette";
import { iconChoices, iconRoles } from "./theme-icons";

export type ThemeDraft = Omit<CustomTheme, "id">;
const format = "clippy-board-theme";
const version = 1;

export function exportTheme({ name, base, window, card, text, accent, icons }: CustomTheme) {
  return JSON.stringify({ format, version, name, base, window, card, text, accent, icons }, null, 2) + "\n";
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
  const { icons } = data;
  if (icons !== undefined && (!icons || typeof icons !== "object" || !("style" in icons)
      || (icons.style !== "emoji" && icons.style !== "outline")
      || !("text" in icons) || typeof icons.text !== "boolean"
      || !("image" in icons) || typeof icons.image !== "boolean"
      || !("file" in icons) || typeof icons.file !== "boolean")) {
    throw new Error("Invalid icon choices in the theme file.");
  }
  const settings = icons as NonNullable<CustomTheme["icons"]> | undefined;
  if (settings?.overrides !== undefined) {
    if (!settings.overrides || typeof settings.overrides !== "object" || Array.isArray(settings.overrides)) {
      throw new Error("Invalid icon overrides in the theme file.");
    }
    settings.overrides = Object.fromEntries(Object.entries(settings.overrides).filter(([role, choice]) =>
      Object.prototype.hasOwnProperty.call(iconRoles, role) && iconChoices.some(entry => entry.id === choice)));
  }
  return { name: name.trim(), base, ...colors, ...(settings && { icons: settings }) };
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
