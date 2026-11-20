import type { AppCommands } from "./commands";
import { normalizeShortcut } from "../shortcut-combo";
import type { ShortcutBindings } from "../shortcuts";

export type AppShortcut = {
  id: string;
  label: string;
  combo: string;
  settingsKey?: string;
  inputId?: string;
  scope: "list" | "search" | "escape" | "tabs" | "window" | "settings";
  forwardKey?: string;
  run: (commands: AppCommands) => Promise<boolean>;
};

/** Add a definition here to expose an action to the router and settings UI. */
export const shortcutDefinitions: AppShortcut[] = [
  { id: "search.toggle", label: "Search", combo: "Ctrl+F", settingsKey: "search", inputId: "shortcut-search", scope: "search", run: c => c.execute("search.toggle") },
  { id: "listening.toggle", label: "Pause / resume listening", combo: "Ctrl+P", settingsKey: "pause", inputId: "shortcut-pause", scope: "list", run: c => c.execute("listening.toggle") },
  { id: "item.pin", label: "Pin / unpin item", combo: "Alt+P", settingsKey: "pinItem", inputId: "shortcut-pin-item", scope: "list", run: c => c.execute("item.pin") },
  { id: "item.delete", label: "Delete item", combo: "Delete", settingsKey: "delete", inputId: "shortcut-delete", scope: "list", run: c => c.execute("item.delete") },
  { id: "item.restore", label: "Restore item without copying", combo: "Ctrl+R", settingsKey: "restore", scope: "list", run: c => c.execute("item.restore") },
  { id: "window.menu", label: "Window menu", combo: "Alt+Space", settingsKey: "windowMenu", scope: "window", run: c => c.execute("window.menu") },
  { id: "settings.toggle", label: "Open / close Settings", combo: "Ctrl+,", settingsKey: "settings", scope: "settings", run: c => c.execute("settings.toggle") },
  { id: "item.copy", label: "Copy selected item", combo: "Enter", scope: "list", forwardKey: "Enter", run: c => c.execute("item.copy") },
  ...["ArrowDown", "ArrowUp", "Home", "End", "PageDown", "PageUp"].map(key => ({
    id: `list.${key}`, label: key, combo: key, scope: "list" as const, forwardKey: key,
    run: (c: AppCommands) => c.execute("list.navigate", key),
  })),
  ...["ArrowLeft", "ArrowRight"].map((key, index) => ({
    id: `tabs.${key}`, label: index === 0 ? "Previous tab" : "Next tab", combo: key,
    settingsKey: index === 0 ? "tabLeft" : "tabRight", scope: "tabs" as const, forwardKey: key,
    run: (c: AppCommands) => c.execute("tabs.cycle", index === 0 ? -1 : 1),
  })),
  { id: "window.escape", label: "Close", combo: "Escape", scope: "escape", forwardKey: "Escape", run: c => c.execute("window.hide") },
];

export function searchTabShortcut(combo: string) {
  const normalized = normalizeShortcut(combo);
  return normalized && normalizeShortcut(normalized.split("+").includes("Alt") ? normalized : `Alt+${normalized}`);
}

export function bindingsFromSettings(shortcuts: Record<string, string> = {}): ShortcutBindings {
  const bindings: ShortcutBindings = Object.fromEntries(shortcutDefinitions.filter(d => d.settingsKey && Object.prototype.hasOwnProperty.call(shortcuts, d.settingsKey))
    .map(d => [d.id, shortcuts[d.settingsKey!] || null]));
  for (const definition of shortcutDefinitions.filter(d => d.scope === "tabs")) {
    bindings[`${definition.id}.search`] = searchTabShortcut(shortcuts[definition.settingsKey!] ?? definition.combo) || null;
  }
  return bindings;
}

export function validateShortcutSettings(shortcuts: Record<string, string>) {
  const used = new Map<string, string>();
  for (const definition of shortcutDefinitions) {
    const combo = normalizeShortcut(definition.settingsKey ? shortcuts[definition.settingsKey] ?? definition.combo : definition.combo);
    if (!combo) continue; // Empty saved bindings explicitly disable shortcuts.
    const other = used.get(combo);
    if (other) throw new Error(`${definition.label} and ${other} both use ${combo}`);
    used.set(combo, definition.label);
  }
  const searchUsed = new Map<string, string>();
  for (const definition of shortcutDefinitions.filter(d => d.scope === "tabs" || ["search", "escape", "window", "settings"].includes(d.scope))) {
    let combo = normalizeShortcut(shortcuts[definition.settingsKey!] ?? definition.combo);
    if (definition.scope === "tabs") combo = searchTabShortcut(combo);
    if (!combo) continue;
    const other = searchUsed.get(combo);
    if (other) throw new Error(`${definition.label} and ${other} both use ${combo} while searching`);
    searchUsed.set(combo, definition.label);
  }
}
