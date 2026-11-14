import type { ThemeIcons } from "../api/settings";

export const contentIcons = ["text", "image", "file"] as const;
export const iconRoles = {
  settings: "Settings", pause: "Pause", resume: "Resume", pin: "Pin",
  unpin: "Unpin", clear: "Clear history", delete: "Delete", restore: "Restore",
  close: "Close", text: "Text", image: "Image", file: "Files",
} as const;
export type IconRole = keyof typeof iconRoles;
export const iconChoices = Object.entries({
  ...iconRoles, "text-alt": "Notepad", "image-alt": "Camera", "file-alt": "Folder",
}).flatMap(([id, label]) => (["emoji", "outline"] as const).map(style => ({
  id: `${style}:${id}`, label: `${label} · ${style === "emoji" ? "Emoji" : "Outline"}`,
})));
const applied = new WeakMap<HTMLElement, string[]>();
export const defaultIcons: ThemeIcons = { style: "emoji", text: false, image: false, file: false };

export function applyIcons(element: HTMLElement, icons = defaultIcons) {
  element.dataset.iconStyle = icons.style;
  element.dataset.iconText = String(icons.text);
  element.dataset.iconImage = String(icons.image);
  element.dataset.iconFile = String(icons.file);
  for (const property of applied.get(element) ?? []) element.style.removeProperty(property);
  const properties: string[] = [];
  for (const [role, choice] of Object.entries(icons.overrides ?? {})) {
    if (!Object.prototype.hasOwnProperty.call(iconRoles, role) || !iconChoices.some(entry => entry.id === choice)) continue;
    const [style, glyph] = choice.split(":");
    const values = {
      [`--icon-${role}-emoji`]: style === "emoji" ? `var(--glyph-${glyph}-emoji)` : '""',
      [`--icon-${role}-outline`]: style === "outline" ? `var(--glyph-${glyph}-outline)` : "none",
      [`--icon-${role}-mask-display`]: style === "outline" ? "inline-block" : "none",
      [`--icon-${role}-visibility`]: "inline",
    };
    for (const [property, value] of Object.entries(values)) {
      element.style.setProperty(property, value);
      properties.push(property);
    }
  }
  applied.set(element, properties);
}

export function icon(kind: string) {
  const element = document.createElement("span");
  element.dataset.icon = kind;
  element.setAttribute("aria-hidden", "true");
  return element;
}
