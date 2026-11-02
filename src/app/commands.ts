import { CommandRegistry } from "../commands";
import * as api from "../api";
import type { Store } from "../state/store";
import type { AppElements } from "../ui/elements";
import type { SelectionController } from "../ui/selection";
import type { HistoryController } from "./history";
import { previewDismiss } from "../preview";

export type AppCommandArgs = {
  "search.toggle": [];
  "listening.toggle": [];
  "item.copy": [id?: string];
  "item.pin": [id?: string];
  "item.delete": [id?: string];
  "item.restore": [id: string];
  "item.deletePermanent": [id: string];
  "history.clear": [];
  "list.navigate": [key: string];
  "tabs.cycle": [delta: number];
  "window.hide": [];
  "window.pin": [];
  "settings.close": [];
};
export type AppCommands = CommandRegistry<AppCommandArgs>;

export function createAppCommands(
  store: Store, elements: AppElements, history: HistoryController, selection: SelectionController,
  ports = { setListeningPaused: api.setListeningPaused, setPinned: api.setPinned, hideWindow: api.hideWindow, dismissPreview: previewDismiss }
) {
  const commands: AppCommands = new CommandRegistry();
  const target = (id?: string) => {
    if (store.get().currentFilter === "deleted") return undefined;
    const selectedId = id ?? store.get().filteredHistory[store.get().selectedIndex]?.id;
    return store.get().history.find(item => item.id === selectedId);
  };
  commands.register("search.toggle", {
    execute: () => {
      if (document.activeElement === elements.searchInput) elements.searchInput.blur();
      else elements.searchInput.focus();
    }
  });
  commands.register("listening.toggle", {
    exclusive: true, execute: async () => {
      const paused = !store.get().isPaused;
      await ports.setListeningPaused(paused);
      store.set({ isPaused: paused });
    }
  });
  commands.register("window.pin", {
    exclusive: true, execute: async () => {
      const pinned = !store.get().isPinned;
      await ports.setPinned(pinned);
      store.set({ isPinned: pinned });
    }
  });
  commands.register("window.hide", {
    execute: async () => {
      await ports.hideWindow();
      ports.dismissPreview();
    }
  });
  commands.register("settings.close", {
    execute: () => {
      elements.settingsPage.style.display = "none";
      Object.assign(elements.mainContent.style, { display: "flex", flexDirection: "column", flex: "1", minHeight: "0" });
    }
  });
  commands.register("item.copy", {
    enabled: id => Boolean(target(id)), execute: async id => {
      await history.selectItem(target(id)!.id);
    }
  });
  commands.register("item.pin", {
    exclusive: true, enabled: id => Boolean(target(id)), execute: async id => {
      await history.togglePin(target(id)!.id);
    }
  });
  commands.register("item.delete", {
    exclusive: true, enabled: id => Boolean(target(id) && !target(id)!.pinned), execute: async id => {
      await history.deleteItem(target(id)!.id);
    }
  });
  const isDeleted = (id: string) => store.get().deletedItems.some(item => item.id === id);
  commands.register("item.restore", { enabled: isDeleted, execute: id => history.restoreFromDeleted(id) });
  commands.register("item.deletePermanent", { enabled: isDeleted, execute: id => history.deletePermanentlyFromDeleted(id) });
  commands.register("history.clear", { exclusive: true, execute: history.clearView });
  commands.register("list.navigate", { execute: selection.handleListKey });
  commands.register("tabs.cycle", { execute: selection.cycleFilterTab });
  return commands;
}
