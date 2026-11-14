import type { ThemeIcons } from "../api/settings";

export const contentIcons = ["text", "image", "file"] as const;
export const defaultIcons: ThemeIcons = { style: "emoji", text: false, image: false, file: false };

export function applyIcons(element: HTMLElement, icons = defaultIcons) {
  element.dataset.iconStyle = icons.style;
  element.dataset.iconText = String(icons.text);
  element.dataset.iconImage = String(icons.image);
  element.dataset.iconFile = String(icons.file);
}

export function icon(kind: string) {
  const element = document.createElement("span");
  element.dataset.icon = kind;
  element.setAttribute("aria-hidden", "true");
  return element;
}
