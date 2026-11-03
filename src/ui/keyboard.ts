import { listen, emitTo } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getSettings } from "../api/settings";
import type { AppElements } from "./elements";
import type { AppCommands } from "../app/commands";
import { shortcutDefinitions, bindingsFromSettings, type AppShortcut } from "../app/shortcut-definitions";
import { ShortcutManager } from "../shortcuts";

export function bindKeyboardEvents(elements: AppElements, commands: AppCommands) {
  const isPreview = getCurrentWindow().label === "preview";
  const settingsOpen = () => elements.settingsPage.style.display !== "none";
  const active = () => document.activeElement as HTMLElement | null;
  // Windows may route Alt+Space to the host before it reaches the DOM.
  // The host forwards that one key; ignore its DOM copy to avoid duplicates.
  const nativeWindows = "__TAURI_INTERNALS__" in window && navigator.platform === "Win32";
  const deferNativeMenuKey = (event: KeyboardEvent) => {
    if (nativeWindows && event.isTrusted && event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && event.code === "Space") {
      event.stopImmediatePropagation();
    }
  };
  window.addEventListener("keydown", deferNativeMenuKey, true);
  const manager = new ShortcutManager({
    isSettingsOpen: settingsOpen,
    isSettingsInputActive: () => Boolean(active()?.classList.contains("shortcut-recorder")),
    isSearchInputActive: () => active() === elements.searchInput,
    getActiveElement: active,
  });
  let disposed = false;
  let revision = 0;
  const cleanups: (() => void)[] = [];
  for (const definition of shortcutDefinitions) {
    manager.register({
      id: definition.id, combo: definition.combo,
      allowInSearchInput: definition.scope !== "list",
      allowWhenTyping: definition.scope === "settings" || definition.scope === "escape" || definition.scope === "window",
      allowInSettingsInput: definition.scope === "settings" || definition.scope === "escape",
      when: () => {
        // Enter activates the compact preview's Back button natively.
        if (definition.id === "item.copy" && active()?.id === "preview-back") return false;
        if (definition.scope === "settings" && active()?.classList.contains("shortcut-recorder")) return false;
        return !settingsOpen() || definition.scope === "escape" || definition.scope === "window" || definition.scope === "settings";
      },
      stopImmediatePropagation: true,
      action: () => {
        if (isPreview && definition.id !== "window.menu") {
          if (definition.forwardKey) return emitTo("main", "preview-forward-key", { key: definition.forwardKey });
          return emitTo("main", "preview-command", { id: definition.id });
        }
        if (definition.scope === "escape") {
          if (active() === elements.searchInput) { elements.searchInput.blur(); return; }
          if (settingsOpen()) return commands.execute("settings.close");
        }
        return definition.run(commands);
      },
    });
  }
  function updateBindings(shortcuts: Record<string, string>) {
    revision++;
    if (!disposed) manager.setBindings(bindingsFromSettings(shortcuts));
    if (!disposed && !isPreview) {
      void emitTo("preview", "shortcuts-updated", { shortcuts })
        .catch(error => console.error("Could not update preview shortcuts:", error));
    }
  }
  async function refreshSettings() {
    const request = ++revision;
    const settings = await getSettings();
    if (!disposed && request === revision) manager.setBindings(bindingsFromSettings(settings?.shortcuts));
  }
  const ready = refreshSettings().catch(error => console.error("Could not load shortcuts:", error));
  function keep(promise: Promise<() => void>) {
    void promise.then(unlisten => { if (disposed) unlisten(); else cleanups.push(unlisten); })
      .catch(error => console.error("Could not bind preview shortcuts:", error));
  }
  function runForwarded(definition: AppShortcut | undefined) {
    if (isPreview || disposed || !definition) return;
    if (settingsOpen() && definition.scope !== "settings") {
      if (definition.scope === "escape") void commands.execute("settings.close");
      return;
    }
    void definition.run(commands);
  }
  keep(listen("native-menu-key", () => {
    if (disposed) return;
    const event = new KeyboardEvent("keydown", { key: " ", code: "Space", altKey: true, bubbles: true, cancelable: true });
    (active() ?? document.body).dispatchEvent(event);
  }));
  keep(listen<{ key: string }>("preview-forward-key", event => {
    runForwarded(shortcutDefinitions.find(d => d.forwardKey === event.payload.key));
  }));
  keep(listen<{ id: string }>("preview-command", event => {
    runForwarded(shortcutDefinitions.find(d => d.id === event.payload.id));
  }));
  keep(listen<{ shortcuts: Record<string, string> }>("shortcuts-updated", event => {
    if (isPreview) updateBindings(event.payload.shortcuts);
  }));
  return {
    manager, ready, refreshSettings, updateBindings,
    dispose() {
      disposed = true;
      window.removeEventListener("keydown", deferNativeMenuKey, true);
      manager.dispose(); cleanups.splice(0).forEach(cleanup => cleanup());
    },
  };
}
