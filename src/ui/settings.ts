import * as api from "../api";
import { defaultSettings, type AppSettings } from "../api/settings";
import type { AppElements } from "./elements";
import { bindSettingsToggle } from "./events";
import { shortcutFromEvent, normalizeShortcut } from "../shortcut-combo";
import { shortcutDefinitions, validateShortcutSettings } from "../app/shortcut-definitions";
import { bindSettingStatus } from "./settings-field-status";

export function bindSettingsEvents(elements: AppElements,
  onShortcutsSaved: (shortcuts: Record<string, string>) => void = () => { },
  closeSettings = () => {
    elements.settingsPage.style.display = "none";
    Object.assign(elements.mainContent.style, { display: "flex", flexDirection: "column", flex: "1", minHeight: "0" });
  },
  onSettingsSaved: (settings: AppSettings) => void = () => {},
  onOpen: () => Promise<void> = async () => {},
) {
  const { settingsBtn, settingMaxHistory, settingDeleteTtl, mainContent, settingsPage, settingsBackBtn, settingsSaveBtn, shortcutsReset } = elements;
  const { settingStartOnLogin, settingShowPinned, settingCompactMode } = elements;
  const statuses = [
    bindSettingStatus(settingCompactMode, "Compact mode", defaultSettings.compact_mode),
    bindSettingStatus(settingMaxHistory, "Max history items", String(defaultSettings.max_history)),
    bindSettingStatus(settingDeleteTtl, "Delete TTL", String(defaultSettings.delete_ttl_seconds)),
    bindSettingStatus(settingStartOnLogin, "Start with Windows", defaultSettings.start_on_login),
    bindSettingStatus(settingShowPinned, "Show pinned items in All", defaultSettings.show_pinned_in_all),
  ];
  const existing: Record<string, HTMLInputElement> = {
    "shortcut-pin-item": elements.shortcutPinItem, "shortcut-delete": elements.shortcutDelete,
    "shortcut-pause": elements.shortcutPause, "shortcut-search": elements.shortcutSearch,
  };
  const fields = shortcutDefinitions.filter(d => d.settingsKey).map(definition => {
    const id = definition.inputId ?? "shortcut-" + definition.id.replace(/\./g, "-");
    let input = existing[id];
    if (!input) {
      const row = document.createElement("div");
      row.className = "settings-row";
      const label = document.createElement("label");
      label.className = "settings-row-label";
      label.htmlFor = id;
      label.textContent = definition.label;
      input = document.createElement("input");
      input.id = id;
      input.type = "text";
      input.className = "settings-input";
      input.readOnly = true;
      row.append(label, input);
      document.getElementById("shortcut-fields")!.appendChild(row);
    }
    input.placeholder = "Disabled";
    input.classList.add("shortcut-recorder");
    input.title = "Press a shortcut; Backspace clears it. Save to apply.";
    const status = bindSettingStatus(input, definition.label, definition.combo);
    statuses.push(status);
    input.addEventListener("keydown", event => {
      if (event.key === "Tab" || event.key === "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      const combo = shortcutFromEvent(event);
      if (combo) input.value = combo === "Backspace" ? "" : combo;
      status.refresh();
    });
    return { definition, input };
  });
  let savedShortcuts: Record<string, string> = {};
  let startupBaseline = false;
  let previousFocus: HTMLElement | null = null;
  let revision = 0;
  function apply(settings: AppSettings) {
    settingMaxHistory.value = String(settings.max_history || 100);
    settingDeleteTtl.value = String(settings.delete_ttl_seconds ?? 60);
    settingStartOnLogin.checked = settings.start_on_login ?? false;
    settingShowPinned.checked = settings.show_pinned_in_all ?? true;
    settingCompactMode.checked = settings.compact_mode ?? false;
    startupBaseline = settingStartOnLogin.checked;
    savedShortcuts = settings.shortcuts ?? {};
    for (const { definition, input } of fields) input.value = normalizeShortcut(savedShortcuts[definition.settingsKey!] ?? definition.combo);
    statuses.forEach(status => status.refresh());
  }
  function close() {
    revision++;
    closeSettings();
    (previousFocus && previousFocus !== document.body ? previousFocus : settingsBtn).focus();
  }
  async function open() {
    const request = ++revision;
    previousFocus = document.activeElement as HTMLElement | null;
    mainContent.style.display = "none";
    settingsPage.style.display = "flex";
    settingsSaveBtn.disabled = true;
    settingsBackBtn.focus();
    try {
      await onOpen();
      if (request !== revision) return;
      const settings = await api.getSettings();
      if (request !== revision) return;
      apply(settings);
      settingsSaveBtn.disabled = false;
    } catch (error) {
      if (request === revision) {
        console.error("Failed to load settings:", error);
        alert("Could not load Settings. Close and reopen Settings to try again.");
      }
    }
  }
  async function toggle() {
    if (settingsPage.style.display !== "none") close();
    else await open();
  }
  bindSettingsToggle(settingsBtn, () => { void toggle(); });
  settingsBackBtn.addEventListener("click", close);
  let saving = false;
  settingsSaveBtn.addEventListener("click", async event => {
    event.preventDefault();
    event.stopPropagation();
    if (settingsSaveBtn.disabled || saving) return;
    try {
      const shortcuts = { ...savedShortcuts };
      for (const { definition, input } of fields) shortcuts[definition.settingsKey!] = normalizeShortcut(input.value);
      validateShortcutSettings(shortcuts);
      const settings: AppSettings = {
        max_history: Math.min(10000, Math.max(1, parseInt(settingMaxHistory.value) || 100)),
        delete_immediately: parseInt(settingDeleteTtl.value) === 0,
        delete_ttl_seconds: parseInt(settingDeleteTtl.value) || 0,
        shortcuts,
        start_on_login: settingStartOnLogin.checked,
        show_pinned_in_all: settingShowPinned.checked,
        compact_mode: settingCompactMode.checked,
      };
      saving = true;
      settingsSaveBtn.disabled = true;
      await api.setInteracting(true);
      try {
        const applied = await api.saveSettings(settings, settings.start_on_login !== startupBaseline);
        apply(applied);
        onShortcutsSaved(applied.shortcuts);
        onSettingsSaved(applied);
        alert("Settings saved");
      } finally { await api.setInteracting(false); }
    } catch (error) {
      console.error("Failed to save settings:", error);
      alert(error instanceof Error ? error.message : "Failed to save settings");
    } finally { saving = false; settingsSaveBtn.disabled = false; }
  });
  shortcutsReset.addEventListener("click", () => {
    for (const { definition, input } of fields) input.value = definition.combo;
    statuses.forEach(status => status.refresh());
  });
  return { open, close, toggle };
}
