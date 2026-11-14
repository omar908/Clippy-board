import type { AppSettings } from "../api/settings";
import { defaultSettings } from "../api/settings";
import { shortcutDefinitions } from "../app/shortcut-definitions";
import { normalizeShortcut, shortcutFromEvent } from "../shortcut-combo";
import type { AppElements } from "./elements";
import { bindSettingStatus } from "./settings-field-status";

type ScalarKey = "max_history" | "delete_ttl_seconds" | "start_on_login" | "show_pinned_in_all" | "compact_mode" | "automatic_update_checks" | "theme" | "font" | "text_size";
export type SettingField = {
  input: HTMLInputElement | HTMLSelectElement; label: string; key: ScalarKey | "shortcuts";
  shortcutKey?: string; defaultValue: string | boolean;
  read: (settings: AppSettings) => string | boolean;
  status: ReturnType<typeof bindSettingStatus>;
};

export function createSettingsFields(elements: AppElements, edit: (field: SettingField, ready: boolean) => void) {
  const fields: SettingField[] = [];
  function add(input: SettingField["input"], label: string, key: ScalarKey | "shortcuts", defaultValue: string | boolean,
    read: SettingField["read"], shortcutKey?: string) {
    let editing = false;
    input.setAttribute("aria-label", label);
    const field: SettingField = { input, label, key, defaultValue, read, shortcutKey,
      status: bindSettingStatus(input, label, defaultValue,
        () => { editing = false; edit(field, true); }, () => { editing = false; edit(field, true); }) };
    fields.push(field);
    if (shortcutKey && input.tagName === "INPUT") {
      const recorder = input as HTMLInputElement;
      recorder.placeholder = "Disabled";
      input.classList.add("shortcut-recorder");
      input.title = "Press a shortcut to save it automatically; Backspace disables it.";
      recorder.addEventListener("keydown", event => {
        if (event.key === "Tab" || event.key === "Escape") return;
        event.preventDefault(); event.stopPropagation();
        const combo = shortcutFromEvent(event);
        if (!combo) return;
        input.value = combo === "Backspace" ? "" : combo;
        field.status.refresh(); edit(field, true);
      });
    } else if (typeof defaultValue === "boolean" || input.tagName === "SELECT") {
      input.addEventListener("change", () => edit(field, true));
    } else {
      input.addEventListener("input", () => { editing = true; edit(field, false); });
      input.addEventListener("blur", () => { if (editing) { editing = false; edit(field, true); } });
      (input as HTMLInputElement).addEventListener("keydown", event => {
        if (event.key === "Enter") { event.preventDefault(); editing = false; edit(field, true); }
      });
    }
  }
  for (const [input, label, key] of [
    [elements.settingMaxHistory, "Max history items", "max_history"],
    [elements.settingDeleteTtl, "Delete TTL", "delete_ttl_seconds"],
    [elements.settingStartOnLogin, "Start with Windows", "start_on_login"],
    [elements.settingShowPinned, "Show pinned items in All", "show_pinned_in_all"],
    [elements.settingCompactMode, "Compact mode", "compact_mode"],
    [elements.settingAutomaticUpdateChecks, "Check for updates automatically", "automatic_update_checks"],
    [elements.settingTheme, "Theme", "theme"],
    [elements.settingFont, "Font", "font"],
    [elements.settingTextSize, "Text size", "text_size"],
  ] as const) {
    const value = defaultSettings[key];
    add(input, label, key, typeof value === "boolean" ? value : String(value), settings => {
      if (key === "theme") return themeSelection(settings);
      const value = settings[key]; return typeof value === "boolean" ? value : String(value);
    });
  }
  const existing: Record<string, HTMLInputElement> = {
    "shortcut-pin-item": elements.shortcutPinItem, "shortcut-delete": elements.shortcutDelete,
    "shortcut-pause": elements.shortcutPause, "shortcut-search": elements.shortcutSearch,
  };
  for (const definition of shortcutDefinitions.filter(d => d.settingsKey)) {
    const id = definition.inputId ?? "shortcut-" + definition.id.replace(/\./g, "-");
    let input = existing[id];
    if (!input) {
      const row = document.createElement("div"); row.className = "settings-row";
      const label = document.createElement("label"); label.className = "settings-row-label";
      label.htmlFor = id; label.textContent = definition.label;
      input = document.createElement("input"); input.id = id; input.type = "text";
      input.className = "settings-input"; input.readOnly = true;
      row.append(label, input); document.getElementById("shortcut-fields")!.appendChild(row);
    }
    add(input, definition.label, "shortcuts", definition.combo,
      settings => normalizeShortcut(settings.shortcuts[definition.settingsKey!] ?? definition.combo), definition.settingsKey);
  }
  return fields;
}

export function fieldValue(field: SettingField) {
  return "checked" in field.input && typeof field.defaultValue === "boolean" ? field.input.checked : field.input.value;
}

export function themeSelection(settings: AppSettings) {
  return settings.theme === "custom" ? `custom:${settings.custom_theme_id}` : settings.theme;
}

export function renderField(field: SettingField, settings: AppSettings) {
  const value = field.read(settings);
  if (typeof value === "boolean") {
    if ("checked" in field.input) field.input.checked = value;
  } else field.input.value = value;
  field.status.refresh();
}

export function numberValue(value: string, label: string, min: number, max: number) {
  const number = Number(value);
  if (!value.trim() || !Number.isInteger(number) || number < min || number > max) {
    throw new Error(`${label}: enter a whole number from ${min} to ${max}.`);
  }
  return number;
}
