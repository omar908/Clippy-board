import { invoke } from "@tauri-apps/api/core";
import * as api from "../api";
import type { AppElements } from "./elements";
import { bindSettingsToggle } from "./events";

export function bindSettingsEvents(elements: AppElements) {
  const { settingsBtn, settingMaxHistory, settingDeleteTtl, shortcutPinItem, shortcutDelete, shortcutPause, shortcutSearch, mainContent, settingsPage, settingsBackBtn, settingsSaveBtn, shortcutsReset } = elements;
  // Settings
  bindSettingsToggle(settingsBtn, async () => {
    try {
      const settings: any = await invoke("get_settings");
      if (settingMaxHistory)
        settingMaxHistory.value = settings.max_history || 100;
      if (settingDeleteTtl)
        settingDeleteTtl.value = settings.delete_ttl_seconds ?? 60;
      if (shortcutPinItem)
        shortcutPinItem.value = settings.shortcuts?.pinItem || "Alt+P";
      if (shortcutDelete)
        shortcutDelete.value = settings.shortcuts?.delete || "Delete";
      if (shortcutPause)
        shortcutPause.value = settings.shortcuts?.pause || "Ctrl+P";
      if (shortcutSearch)
        shortcutSearch.value = settings.shortcuts?.search || "Ctrl+F";
    }
    catch (e) {
      console.error("Failed to load settings:", e);
    }
    mainContent.style.display = "none";
    settingsPage.style.display = "flex";
  });
  settingsBackBtn.addEventListener("click", () => {
    settingsPage.style.display = "none";
    mainContent.style.display = "flex";
    mainContent.style.flexDirection = "column";
    mainContent.style.flex = "1";
    mainContent.style.minHeight = "0";
  });
  settingsSaveBtn.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    (async () => {
      try {
        await api.setInteracting(true).catch(() => { });
        const settings = {
          max_history: Math.min(10000, Math.max(1, parseInt(settingMaxHistory.value) || 100)),
          delete_immediately: parseInt(settingDeleteTtl.value) === 0,
          delete_ttl_seconds: parseInt(settingDeleteTtl.value) || 0,
          shortcuts: {
            pinItem: shortcutPinItem.value || "Alt+P",
            delete: shortcutDelete.value || "Delete",
            pause: shortcutPause.value || "Ctrl+P",
            search: shortcutSearch.value || "Ctrl+F",
          },
        };
        await invoke("save_settings_cmd", { settings });
        alert("Settings saved");
        setTimeout(() => invoke("set_interacting", { interacting: false } as any).catch(() => { }), 1000);
      }
      catch (e) {
        console.error("Failed to save settings:", e);
        alert("Failed to save settings");
        invoke("set_interacting", { interacting: false } as any).catch(() => { });
      }
    })();
  });
  shortcutsReset.addEventListener("click", () => {
    if (shortcutPinItem)
      shortcutPinItem.value = "Alt+P";
    if (shortcutDelete)
      shortcutDelete.value = "Delete";
    if (shortcutPause)
      shortcutPause.value = "Ctrl+P";
    if (shortcutSearch)
      shortcutSearch.value = "Ctrl+F";
  });
  function recordShortcut(input: HTMLInputElement) {
    input.addEventListener("keydown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const parts = [];
      if (e.ctrlKey)
        parts.push("Ctrl");
      if (e.shiftKey)
        parts.push("Shift");
      if (e.altKey)
        parts.push("Alt");
      if (e.metaKey)
        parts.push("Meta");
      const key = e.key;
      if (key !== "Control" && key !== "Shift" && key !== "Alt" && key !== "Meta") {
        if (key === " ")
          parts.push("Space");
        else if (key === "ArrowUp")
          parts.push("ArrowUp");
        else if (key === "ArrowDown")
          parts.push("ArrowDown");
        else if (key === "ArrowLeft")
          parts.push("ArrowLeft");
        else if (key === "ArrowRight")
          parts.push("ArrowRight");
        else if (key === "Delete")
          parts.push("Delete");
        else if (key === "Backspace")
          parts.push("Backspace");
        else if (key === "Enter")
          parts.push("Enter");
        else if (key === "Escape")
          parts.push("Escape");
        else if (key === "Tab")
          parts.push("Tab");
        else
          parts.push(key.length === 1 ? key.toUpperCase() : key);
        input.value = parts.join("+");
      }
    });
  }
  if (shortcutPinItem)
    recordShortcut(shortcutPinItem);
  if (shortcutDelete)
    recordShortcut(shortcutDelete);
  if (shortcutPause)
    recordShortcut(shortcutPause);
  if (shortcutSearch)
    recordShortcut(shortcutSearch);

}
