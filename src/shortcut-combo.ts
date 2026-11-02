const modifiers = ["Ctrl", "Meta", "Alt", "Shift"] as const;
const aliases: Record<string, string> = {
  control: "Ctrl", ctrl: "Ctrl", meta: "Meta", cmd: "Meta", command: "Meta",
  alt: "Alt", option: "Alt", shift: "Shift", esc: "Escape", escape: "Escape",
  return: "Enter", enter: "Enter", space: "Space", spacebar: "Space", plus: "Plus",
  arrowup: "ArrowUp", arrowdown: "ArrowDown", arrowleft: "ArrowLeft", arrowright: "ArrowRight",
  delete: "Delete", backspace: "Backspace", home: "Home", end: "End",
  pageup: "PageUp", pagedown: "PageDown", tab: "Tab", insert: "Insert",
};

function keyName(key: string) {
  if (key === " ") return "Space";
  if (key === "+") return "Plus";
  return aliases[key.toLowerCase()] ?? (key.length === 1 ? key.toUpperCase() : key);
}

/** Canonical modifier ordering is shared by recording, persistence and matching. */
export function normalizeShortcut(combo: string): string {
  if (!combo.trim()) return "";
  const tokens = combo.split("+").map(token => keyName(token.trim()));
  const keys = tokens.filter(token => !modifiers.includes(token as typeof modifiers[number]));
  if (tokens.some(token => !token || /\s/.test(token)) || new Set(tokens).size !== tokens.length || keys.length !== 1) {
    throw new Error(`Invalid shortcut: ${combo}`);
  }
  return [...modifiers.filter(modifier => tokens.includes(modifier)), keys[0]].join("+");
}

export function shortcutFromEvent(event: KeyboardEvent): string {
  const key = keyName(event.key);
  if (modifiers.includes(key as typeof modifiers[number])) return "";
  return [event.ctrlKey && "Ctrl", event.metaKey && "Meta", event.altKey && "Alt", event.shiftKey && "Shift", key]
    .filter(Boolean).join("+");
}
