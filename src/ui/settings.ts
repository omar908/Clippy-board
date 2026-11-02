import * as api from "../api";
import type { AppSettings } from "../api/settings";
import type { AppElements } from "./elements";
import { bindSettingsToggle } from "./events";
import { shortcutFromEvent, normalizeShortcut } from "../shortcut-combo";
import { shortcutDefinitions, validateShortcutSettings } from "../app/shortcut-definitions";

export function bindSettingsEvents(elements: AppElements,
  onShortcutsSaved: (shortcuts: Record<string, string>) => void = () => { },
  closeSettings = () => {
    elements.settingsPage.style.display = "none";
    Object.assign(elements.mainContent.style, { display: "flex", flexDirection: "column", flex: "1", minHeight: "0" });
  }
) {
  const { settingsBtn, settingMaxHistory, settingDeleteTtl, mainContent, settingsPage, settingsBackBtn, settingsSaveBtn, shortcutsReset } = elements;
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
    input.title = "Press a shortcut; Backspace clears it. Save to apply.";
    input.addEventListener("keydown", event => {
      event.preventDefault();
      event.stopPropagation();
      const combo = shortcutFromEvent(event);
      if (combo) input.value = combo === "Backspace" ? "" : combo;
    });
    return { definition, input };
  });
  let savedShortcuts: Record<string, string> = {};
  bindSettingsToggle(settingsBtn, async () => {
    try {
      const settings = await api.getSettings();
      settingMaxHistory.value = String(settings.max_history || 100);
      settingDeleteTtl.value = String(settings.delete_ttl_seconds ?? 60);
      savedShortcuts = settings.shortcuts ?? {};
      for (const { definition, input } of fields) input.value = savedShortcuts[definition.settingsKey!] ?? definition.combo;
    } catch (error) { console.error("Failed to load settings:", error); }
    mainContent.style.display = "none";
    settingsPage.style.display = "flex";
  });
  settingsBackBtn.addEventListener("click", closeSettings);
  settingsSaveBtn.addEventListener("click", async event => {
    event.preventDefault();
    event.stopPropagation();
    try {
      const shortcuts = { ...savedShortcuts };
      for (const { definition, input } of fields) shortcuts[definition.settingsKey!] = normalizeShortcut(input.value);
      validateShortcutSettings(shortcuts);
      const settings: AppSettings = {
        max_history: Math.min(10000, Math.max(1, parseInt(settingMaxHistory.value) || 100)),
        delete_immediately: parseInt(settingDeleteTtl.value) === 0,
        delete_ttl_seconds: parseInt(settingDeleteTtl.value) || 0,
        shortcuts,
      };
      await api.setInteracting(true);
      try {
        await api.saveSettings(settings);
        savedShortcuts = shortcuts;
        onShortcutsSaved(shortcuts);
        alert("Settings saved");
      } finally { await api.setInteracting(false); }
    } catch (error) {
      console.error("Failed to save settings:", error);
      alert(error instanceof Error ? error.message : "Failed to save settings");
    }
  });
  shortcutsReset.addEventListener("click", () => {
    for (const { definition, input } of fields) input.value = definition.combo;
  });
}
