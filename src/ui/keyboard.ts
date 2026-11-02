import { invoke } from "@tauri-apps/api/core";
import { listen, emitTo } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Store } from "../state/store";
import type { AppElements } from "./elements";
import type { HistoryController } from "../app/history";
import type { SelectionController } from "./selection";
import { ShortcutManager } from "../shortcuts";
import { deleteItemAction } from "../actions";
import * as api from "../api";
import { previewDismiss } from "../preview";

export function bindKeyboardEvents(store: Store, elements: AppElements, history: HistoryController, selection: SelectionController) {
  const { settingsPage, mainContent, searchInput, pauseBtn } = elements;
  const { deleteItem, fetchInitialHistory, filterAndRender } = history;
  const { cycleFilterTab, handleListKey } = selection;
  const isPreviewWindow = getCurrentWindow().label === "preview";
  // Keyboard Navigation
  function normalizeKeyCombo(e: KeyboardEvent): string {
    const parts: string[] = [];
    if (e.ctrlKey)
      parts.push("Ctrl");
    if (e.metaKey)
      parts.push("Meta");
    if (e.altKey)
      parts.push("Alt");
    if (e.shiftKey)
      parts.push("Shift");
    let key = e.key;
    if (key === " ")
      key = "Space";
    if (key === "Enter")
      key = "Enter";
    if (key === "Escape")
      key = "Escape";
    if (key === "Delete")
      key = "Delete";
    if (key === "Backspace")
      key = "Backspace";
    if (key === "ArrowUp")
      key = "ArrowUp";
    if (key === "ArrowDown")
      key = "ArrowDown";
    if (key === "ArrowLeft")
      key = "ArrowLeft";
    if (key === "ArrowRight")
      key = "ArrowRight";
    if (key === "Tab")
      key = "Tab";
    if (key.length === 1)
      key = key.toUpperCase();
    if (key === "Control" || key === "Meta" || key === "Alt" || key === "Shift")
      return parts.join("+");
    parts.push(key);
    return parts.join("+");
  }
  let currentSettingsCache: any = null;
  (async () => {
    try {
      currentSettingsCache = await invoke("get_settings");
    }
    catch { }
  })();
  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === "f") {
      e.preventDefault();
      e.stopImmediatePropagation();
      e.stopPropagation();
      (async () => {
        try {
          currentSettingsCache = await invoke("get_settings");
        }
        catch { }
        const searchShortcut = currentSettingsCache?.shortcuts?.search || "Ctrl+F";
        if (searchShortcut === "Ctrl+F") {
          shortcutManager.handle(new KeyboardEvent("keydown", { key: "f", ctrlKey: true }), true);
        }
      })();
      return false;
    }
    if ((e.ctrlKey || e.metaKey) && k === "p") {
      e.preventDefault();
      e.stopImmediatePropagation();
      e.stopPropagation();
      (async () => {
        try {
          currentSettingsCache = await invoke("get_settings");
        }
        catch { }
        const pauseShortcut = currentSettingsCache?.shortcuts?.pause || "Ctrl+P";
        if (pauseShortcut === "Ctrl+P") {
          shortcutManager.handle(new KeyboardEvent("keydown", { key: "p", ctrlKey: true }), true);
        }
      })();
      return false;
    }
  }, true);
  const shortcutManager = new ShortcutManager({
    isSettingsOpen: () => !!(settingsPage && settingsPage.style.display !== "none"),
    isSettingsInputActive: () => {
      const el = document.activeElement as HTMLElement | null;
      return !!(el && el.classList.contains("settings-input"));
    },
    isSearchInputActive: () => document.activeElement === searchInput,
    getActiveElement: () => document.activeElement as HTMLElement | null,
  });
  shortcutManager.register({
    id: "search-focus",
    combo: async () => {
      try {
        currentSettingsCache = await invoke("get_settings");
      }
      catch { }
      return currentSettingsCache?.shortcuts?.search || "Ctrl+F";
    },
    action: (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (searchInput) {
        if (document.activeElement === searchInput) {
          searchInput.blur();
        }
        else {
          searchInput.focus();
        }
      }
    },
    allowInSearchInput: true,
    preventDefault: true,
    stopPropagation: true,
    stopImmediatePropagation: true,
    capture: true,
  });
  shortcutManager.register({
    id: "pause-toggle",
    combo: async () => {
      try {
        currentSettingsCache = await invoke("get_settings");
      }
      catch { }
      return currentSettingsCache?.shortcuts?.pause || "Ctrl+P";
    },
    action: async (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      store.set({ isPaused: !store.get().isPaused });
      try {
        await api.setListeningPaused(store.get().isPaused);
      }
      catch { }
      if (store.get().isPaused) {
        pauseBtn.classList.add("active");
        try {
          pauseBtn.innerHTML = "⏸";
        }
        catch { }
        pauseBtn.title = "Resume clipboard listening";
        document.body.classList.add("paused");
      }
      else {
        pauseBtn.classList.remove("active");
        try {
          pauseBtn.innerHTML = "⏯";
        }
        catch { }
        pauseBtn.title = "Pause clipboard listening";
        document.body.classList.remove("paused");
      }
    },
    preventDefault: true,
    stopPropagation: true,
    stopImmediatePropagation: true,
    capture: true,
  });
  shortcutManager.register({
    id: "pin-toggle",
    combo: async () => {
      try {
        currentSettingsCache = await invoke("get_settings");
      }
      catch { }
      return currentSettingsCache?.shortcuts?.pinItem || "Alt+P";
    },
    action: async (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      const target = store.get().filteredHistory[store.get().selectedIndex];
      if (target) {
        try {
          await api.togglePin(target.id, !target.pinned);
          await fetchInitialHistory();
          filterAndRender();
        }
        catch { }
      }
    },
    preventDefault: true,
    stopPropagation: true,
    stopImmediatePropagation: true,
  });
  shortcutManager.register({
    id: "delete-item",
    combo: async () => {
      try {
        currentSettingsCache = await invoke("get_settings");
      }
      catch { }
      return currentSettingsCache?.shortcuts?.delete || "Delete";
    },
    action: async () => {
      const target = store.get().filteredHistory[store.get().selectedIndex];
      await deleteItemAction(target as any, deleteItem);
    },
    preventDefault: true,
    stopPropagation: true,
  });
  window.addEventListener("keydown", (e) => {
    const navKey = e.key === "ArrowDown" ||
      e.key === "ArrowUp" ||
      e.key === "Enter" ||
      e.key === "Home" ||
      e.key === "End" ||
      e.key === "PageUp" ||
      e.key === "PageDown";
    const modified = e.shiftKey || e.ctrlKey || e.metaKey || e.altKey;
    if (settingsPage && settingsPage.style.display !== "none") {
      const activeEl = document.activeElement as HTMLElement | null;
      if (activeEl && activeEl.classList.contains("settings-input")) {
        return;
      }
    }
    (async () => {
      try {
        currentSettingsCache = await invoke("get_settings");
        const searchShortcut = currentSettingsCache?.shortcuts?.search || "Ctrl+F";
        let combo = normalizeKeyCombo(e);
        // Normalize common forms
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f")
          combo = "Ctrl+F";
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p")
          combo = "Ctrl+P";
        if (combo === searchShortcut || (e.ctrlKey && e.key.toLowerCase() === "f")) {
          if ((e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            e.stopPropagation();
          }
          if (settingsPage && settingsPage.style.display !== "none") {
            const activeEl = document.activeElement as HTMLElement | null;
            if (activeEl && activeEl.classList.contains("settings-input"))
              return;
          }
          e.preventDefault();
          e.stopPropagation();
          if (document.activeElement === searchInput) {
            searchInput.blur();
          }
          else {
            searchInput.focus();
          }
          return;
        }
        const pinShortcut = currentSettingsCache?.shortcuts?.pinItem;
        if (pinShortcut && combo === pinShortcut) {
          e.preventDefault();
          e.stopPropagation();
          const target = store.get().filteredHistory[store.get().selectedIndex];
          if (target) {
            try {
              await invoke("toggle_pin", { id: target.id, pinned: !target.pinned });
              await fetchInitialHistory();
              filterAndRender();
            }
            catch { }
          }
          return;
        }
        const delShortcut = currentSettingsCache?.shortcuts?.delete;
        if (delShortcut && combo === delShortcut) {
          e.preventDefault();
          e.stopPropagation();
          const target = store.get().filteredHistory[store.get().selectedIndex];
          if (target && !target.pinned) {
            deleteItem(target.id);
          }
          return;
        }
        const pauseShortcut = currentSettingsCache?.shortcuts?.pause || "Ctrl+P";
        if (pauseShortcut && (combo === pauseShortcut || (e.ctrlKey && e.key.toLowerCase() === "p"))) {
          e.preventDefault();
          e.stopPropagation();
          store.set({ isPaused: !store.get().isPaused });
          await invoke("set_listening_paused", { paused: store.get().isPaused });
          if (store.get().isPaused) {
            pauseBtn.classList.add("active");
            try {
              pauseBtn.innerHTML = "⏸";
            }
            catch { }
            pauseBtn.title = "Resume clipboard listening";
            document.body.classList.add("paused");
          }
          else {
            pauseBtn.classList.remove("active");
            try {
              pauseBtn.innerHTML = "⏯";
            }
            catch { }
            pauseBtn.title = "Pause clipboard listening";
            document.body.classList.remove("paused");
          }
          return;
        }
      }
      catch { }
    })();
    // Don't intercept when typing in search input
    const activeEl = document.activeElement as HTMLElement | null;
    if (activeEl && activeEl.id === "search-input") {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        searchInput.blur();
        return;
      }
      else if (e.ctrlKey || e.metaKey) {
        return;
      }
      else if (e.key === "Enter") {
        return;
      }
      else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        // Allow tab switching even when in search
      }
      else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        // Don't allow arrow keys in search to navigate list
        return;
      }
      else {
        return;
      }
    }
    else if (activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA")) {
      if (activeEl.classList.contains("settings-input")) {
        return;
      }
      return;
    }
    // In the preview window the keys belong to the main window's list: forward
    // them so arrow traversal keeps working while the pointer is in the preview
    // (the preview has focus so the user can select text).
    if (isPreviewWindow) {
      if (navKey && !modified) {
        e.preventDefault();
        void emitTo("main", "preview-forward-key", { key: e.key }).catch(() => { });
      }
      else if (e.key === "Escape") {
        // Escape closes the app from the preview window too.
        e.preventDefault();
        void emitTo("main", "preview-forward-key", { key: "Escape" }).catch(() => { });
      }
      else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && !modified) {
        e.preventDefault();
        void emitTo("main", "preview-forward-key", { key: e.key }).catch(() => { });
      }
      return;
    }
    if (e.key === "Escape") {
      if (settingsPage && settingsPage.style.display !== "none") {
        e.preventDefault();
        e.stopPropagation();
        settingsPage.style.display = "none";
        mainContent.style.display = "flex";
        mainContent.style.flexDirection = "column";
        mainContent.style.flex = "1";
        mainContent.style.minHeight = "0";
        return;
      }
      e.preventDefault();
      // Hide first, then restore the pre-preview geometry while invisible.
      invoke("hide_window").then(() => previewDismiss()).catch(() => { });
    }
    else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && !modified) {
      e.preventDefault();
      cycleFilterTab(e.key === "ArrowRight" ? 1 : -1);
    }
    else if (navKey && !modified) {
      e.preventDefault();
      handleListKey(e.key);
    }
  });
  // Keys pressed while the preview window has focus (the user is selecting text
  // there) still drive the main list.
  void listen<{
    key: string;
  }>("preview-forward-key", (event) => {
    if (isPreviewWindow)
      return;
    if (event.payload.key === "Escape") {
      invoke("hide_window").then(() => previewDismiss()).catch(() => { });
      return;
    }
    if (event.payload.key === "ArrowLeft" || event.payload.key === "ArrowRight") {
      cycleFilterTab(event.payload.key === "ArrowRight" ? 1 : -1);
      return;
    }
    handleListKey(event.payload.key);
  }).catch(() => { });

}
