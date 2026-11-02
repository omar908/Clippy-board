import type { AppCommands } from "./commands";
import { normalizeShortcut } from "../shortcut-combo";
import type { ShortcutBindings } from "../shortcuts";

export type AppShortcut = {
  id: string;
  label: string;
  combo: string;
  settingsKey?: string;
  inputId?: string;
  scope: "list" | "search" | "escape" | "tabs";
  forwardKey?: string;
  run: (commands: AppCommands) => Promise<boolean>;
};

/** Add a definition here to expose an action to the router and settings UI. */
export const shortcutDefinitions: AppShortcut[] = [
  { id: "search.toggle", label: "Search", combo: "Ctrl+F", settingsKey: "search", inputId: "shortcut-search", scope: "search", run: c => c.execute("search.toggle") },
  { id: "listening.toggle", label: "Pause / resume listening", combo: "Ctrl+P", settingsKey: "pause", inputId: "shortcut-pause", scope: "list", run: c => c.execute("listening.toggle") },
  { id: "item.pin", label: "Pin / unpin item", combo: "Alt+P", settingsKey: "pinItem", inputId: "shortcut-pin-item", scope: "list", run: c => c.execute("item.pin") },
  { id: "item.delete", label: "Delete item", combo: "Delete", settingsKey: "delete", inputId: "shortcut-delete", scope: "list", run: c => c.execute("item.delete") },
  { id: "item.copy", label: "Copy selected item", combo: "Enter", scope: "list", forwardKey: "Enter", run: c => c.execute("item.copy") },
  ...["ArrowDown", "ArrowUp", "Home", "End", "PageDown", "PageUp"].map(key => ({
    id: `list.${key}`, label: key, combo: key, scope: "list" as const, forwardKey: key,
    run: (c: AppCommands) => c.execute("list.navigate", key),
  })),
  ...["ArrowLeft", "ArrowRight"].map((key, index) => ({
    id: `tabs.${key}`, label: key, combo: key, scope: "tabs" as const, forwardKey: key,
    run: (c: AppCommands) => c.execute("tabs.cycle", index === 0 ? -1 : 1),
  })),
  { id: "window.escape", label: "Close", combo: "Escape", scope: "escape", forwardKey: "Escape", run: c => c.execute("window.hide") },
];

export function bindingsFromSettings(shortcuts: Record<string, string> = {}): ShortcutBindings {
  return Object.fromEntries(shortcutDefinitions.filter(d => d.settingsKey && Object.prototype.hasOwnProperty.call(shortcuts, d.settingsKey))
    .map(d => [d.id, shortcuts[d.settingsKey!] || null]));
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
}
