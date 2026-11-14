import type { CustomTheme } from "../api/settings";

export const colorKeys = ["window", "card", "text", "accent"] as const;
export const validColor = (value: string) => /^#[0-9a-f]{6}$/i.test(value);

function rgb(hex: string) {
  return [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
}

function mix(base: string, tint: string, amount: number) {
  const tintChannels = rgb(tint);
  return "#" + rgb(base).map((channel, index) =>
    Math.round(channel * (1 - amount) + tintChannels[index] * amount).toString(16).padStart(2, "0")).join("");
}

function luminance(hex: string) {
  return rgb(hex).map(value => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
}

function contrast(a: string, b: string) {
  const values = [luminance(a), luminance(b)];
  return (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
}

export function themePalette({ window, card, text, accent }: CustomTheme) {
  return {
    "--bg-window": window, "--bg-surface": window, "--bg-sunken": window,
    "--bg-card": card, "--bg-card-hover": mix(card, text, 0.08),
    "--bg-card-selected": mix(card, accent, 0.22),
    "--text-primary": text, "--text-body": text, "--text-strong": text,
    "--text-secondary": text, "--text-muted": text,
    "--border-subtle": mix(card, text, 0.25), "--border-strong": mix(card, text, 0.55),
    "--border-active": accent, "--accent-color": accent, "--accent-text": accent,
    "--accent-soft": mix(window, accent, 0.12), "--accent-border": accent,
    "--accent-count-bg": mix(window, accent, 0.18), "--accent-count-text": text,
    "--accent-ring": mix(window, accent, 0.35),
    "--text-on-accent": contrast(accent, "#000000") >= contrast(accent, "#ffffff") ? "#000000" : "#ffffff",
  };
}

export function contrastWarnings(theme: CustomTheme) {
  const palette = themePalette(theme);
  const pairs = [
    ["Text on the window", theme.text, theme.window],
    ["Text on cards", theme.text, theme.card],
    ["Text on selected cards", theme.text, palette["--bg-card-selected"]],
    ["Accent text on the window", theme.accent, theme.window],
    ["Accent text on cards", theme.accent, theme.card],
    ["Accent text on highlighted controls", theme.accent, palette["--accent-soft"]],
  ];
  return pairs.flatMap(([label, foreground, background]) => {
    const ratio = contrast(foreground, background);
    return ratio < 4.5 ? [`${label} has low contrast (${ratio.toFixed(1)}:1).`] : [];
  });
}

export function applyPalette(element: HTMLElement, theme?: CustomTheme) {
  if (!theme || !colorKeys.every(key => validColor(theme[key]))) return () => {};
  const palette = themePalette(theme);
  for (const [key, color] of Object.entries(palette)) element.style.setProperty(key, color);
  return () => {
    for (const key of Object.keys(palette)) element.style.removeProperty(key);
  };
}
