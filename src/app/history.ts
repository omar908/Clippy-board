import { invoke } from "@tauri-apps/api/core";
import type { ClipboardItem } from "../types";
import { deriveHistoryView } from "../state/selectors";
import type { Store } from "../state/store";
import type { AppElements } from "../ui/elements";
import { deleteItem as apiDeleteItem } from "../api/clipboard";
import { getSettings as apiGetSettings } from "../api/settings";
import { updateCountsUI } from "../ui/render/header";
import { previewRefresh, previewDismiss } from "../preview";

export function createHistoryController(store: Store, elements: AppElements, callbacks: { renderList: () => void; onSelected: () => void }) {
  const { countAll, countPinned, countText, countImage, countFile, countDeleted, clearBtn } = elements;
  const renderList = callbacks.renderList;
  function updateCounts() {
    updateCountsUI({
      all: countAll, pinned: countPinned, text: countText,
      image: countImage, file: countFile, deleted: countDeleted,
    }, store.get().history, store.get().deletedItems.length);
  }
  function filterAndRender() {
    store.set(deriveHistoryView(store.get()));
    renderList();
    updateClearButtonState();
    previewRefresh();
  }
  async function selectItem(id: string) {
    try {
      await invoke("select_item", { id });
      // The copy bumped this entry to the top of history — follow it there:
      // highlight index 0 and scroll to top (persisting across hide/show,
      // since the DOM survives), and ignore hover at the parked cursor so
      // the re-render can't stomp the selection back.
      store.set({ selectedIndex: 0 });
      callbacks.onSelected();
      filterAndRender();
      // Unpinned: Rust hid the window — restore the pre-preview geometry
      // while it's invisible. Pinned: the window stays open, so the panel
      // (and geometry) follow their normal lifetime instead.
      if (!store.get().isPinned)
        previewDismiss();
    }
    catch (err) {
      console.error("Failed to select item:", err);
    }
  }
  async function deleteItem(id: string) {
    try {
      const item = store.get().history.find((i) => i.id === id);
      if (item?.pinned) {
        console.warn("Cannot delete pinned item");
        return;
      }
      let ttlSeconds = 60;
      try {
        const settings: any = await apiGetSettings();
        if (settings && typeof settings.delete_ttl_seconds === "number") {
          ttlSeconds = settings.delete_ttl_seconds;
        }
      }
      catch { }
      await apiDeleteItem(id, ttlSeconds);
      store.set({ history: store.get().history.filter((i) => i.id !== id) });
      await loadDeleted();
      updateCounts();
      filterAndRender();
    }
    catch (err) {
      console.error("Failed to delete item:", err);
    }
  }
  async function restoreFromDeleted(id: string) {
    try {
      const restored = await invoke<ClipboardItem>("restore_from_deleted", { id });
      store.set({ deletedItems: store.get().deletedItems.filter((i) => i.id !== id) });
      // Add to history
      store.set({ history: [restored, ...store.get().history.filter((i) => i.id !== restored.id)] });
      updateCounts();
      filterAndRender();
    }
    catch (err) {
      console.error("Failed to restore from deleted:", err);
    }
  }
  async function deletePermanentlyFromDeleted(id: string) {
    try {
      await invoke("delete_permanently_from_deleted", { id });
      store.set({ deletedItems: store.get().deletedItems.filter((i) => i.id !== id) });
      updateCounts();
      filterAndRender();
    }
    catch (err) {
      console.error("Failed to permanently delete:", err);
    }
  }
  async function loadDeleted() {
    try {
      const res = await invoke<any[]>("get_deleted");
      console.log("Loaded deleted items raw:", res);
      store.set({ deletedItems: res });
      console.log("Loaded deleted items:", store.get().deletedItems.length, store.get().deletedItems);
      updateCounts();
    }
    catch (err) {
      console.error("Failed to load deleted items:", err);
    }
  }
  async function togglePin(id: string) {
    try {
      const item = store.get().history.find((i) => i.id === id);
      if (!item)
        return;
      const pinned = !item.pinned;
      store.set({ history: store.get().history.map(entry => entry.id === id ? { ...entry, pinned } : entry) });
      await invoke("toggle_pin", { id, pinned });
      updateCounts();
      filterAndRender();
    }
    catch (err) {
      console.error("Failed to toggle pin:", err);
    }
  }
  async function clearView() {
    // Clear only what the user is currently looking at (active tab + search),
    // and never pinned entries — those must be unlocked first.
    if (store.get().currentFilter === "deleted") {
      try {
        for (const item of store.get().filteredHistory as any[]) {
          await invoke("delete_permanently_from_deleted", { id: item.id });
        }
        await loadDeleted();
        updateCounts();
        filterAndRender();
      }
      catch (err) {
        console.error("Failed to clear deleted items:", err);
      }
      return;
    }
    const ids = (store.get().filteredHistory as any[]).filter((i: any) => !i.pinned).map((i: any) => i.id);
    if (ids.length === 0)
      return;
    try {
      let ttlSeconds = 60;
      try {
        const settings: any = await invoke("get_settings");
        if (settings && typeof settings.delete_ttl_seconds === "number") {
          ttlSeconds = settings.delete_ttl_seconds;
        }
      }
      catch { }
      const removed = await invoke<string[]>("clear_history", { ids, ttlSeconds });
      const gone = new Set(removed);
      store.set({ history: store.get().history.filter((i) => !gone.has(i.id)) });
      await loadDeleted();
      updateCounts();
      filterAndRender();
    }
    catch (err) {
      console.error("Failed to clear history:", err);
    }
  }
  /** Keep the trash button's tooltip honest about its scope. */
  function updateClearButtonState() {
    if (store.get().currentFilter === "deleted") {
      const clearable = store.get().filteredHistory.length;
      clearBtn.disabled = clearable === 0;
      clearBtn.title = clearable === 0 ? "Nothing to delete permanently" : "Delete permanently from Deleted tab";
      return;
    }
    const clearable = (store.get().filteredHistory as any[]).filter((i: any) => !i.pinned).length;
    const scope = store.get().searchQuery.trim()
      ? "matching items"
      : store.get().currentFilter === "all"
        ? "all unpinned items"
        : `${store.get().currentFilter} items`;
    clearBtn.disabled = clearable === 0;
    clearBtn.title =
      clearable === 0
        ? "Nothing to clear here (pinned entries are kept)"
        : `Move ${scope} to Deleted (pinned entries are kept)`;
  }
  async function fetchInitialHistory() {
    try {
      store.set({ history: await invoke<ClipboardItem[]>("get_history") });
      await loadDeleted();
      updateCounts();
      filterAndRender();
    }
    catch (err) {
      console.error("Failed to load initial history:", err);
    }
  }

  return { updateCounts, filterAndRender, renderList, selectItem, deleteItem, restoreFromDeleted, deletePermanentlyFromDeleted, loadDeleted, togglePin, clearView, updateClearButtonState, fetchInitialHistory };
}

export type HistoryController = ReturnType<typeof createHistoryController>;
