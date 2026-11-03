import { deriveHistoryView } from "../state/selectors";
import type { Store } from "../state/store";
import type { AppElements } from "../ui/elements";
import * as api from "../api";
import { updateCountsUI } from "../ui/render/header";
import { previewRefresh, previewDismiss } from "../preview";
const defaultPorts = {
  getHistory: api.getHistory, getDeleted: api.getDeleted, getSettings: api.getSettings,
  selectItem: api.selectItem, deleteItem: api.deleteItem, togglePin: api.togglePin,
  restoreFromDeleted: api.restoreFromDeleted, deletePermanentlyFromDeleted: api.deletePermanentlyFromDeleted,
  clearHistory: api.clearHistory, refreshPreview: previewRefresh, dismissPreview: previewDismiss,
};
export type HistoryPorts = typeof defaultPorts;
export function createHistoryController(store: Store, elements: AppElements, callbacks: {
  renderList: () => void;
  onSelected: () => void;
  onSettingsLoaded?: (settings: Awaited<ReturnType<typeof api.getSettings>>) => void;
}, ports: HistoryPorts = defaultPorts) {
  const { countAll, countPinned, countText, countImage, countFile, countDeleted, clearBtn } = elements;
  const renderList = callbacks.renderList;
  function updateCounts() {
    updateCountsUI({
      all: countAll, pinned: countPinned, text: countText,
      image: countImage, file: countFile, deleted: countDeleted,
    }, store.get().history, store.get().deletedItems.length, store.get().showPinnedInAll);
  }
  function filterAndRender() {
    store.set(deriveHistoryView(store.get()));
    renderList();
    updateClearButtonState();
    ports.refreshPreview();
  }
  async function selectItem(id: string) {
    const fromDeleted = store.get().currentFilter === "deleted";
    await ports.selectItem(id);
    if (fromDeleted) {
      const [history, deletedItems] = await Promise.all([ports.getHistory(), ports.getDeleted()]);
      store.set({ history, deletedItems });
      updateCounts();
    }
    // The copy bumped this entry to the top of history — follow it there:
    // highlight index 0 and scroll to top (persisting across hide/show,
    // since the DOM survives), and ignore hover at the parked cursor so
    // the re-render can't stomp the selection back.
    if (!fromDeleted) store.set({ selectedIndex: 0 });
    callbacks.onSelected();
    filterAndRender();
    // Unpinned: Rust hid the window — restore the pre-preview geometry
    // while it's invisible. Pinned: the window stays open, so the panel
    // (and geometry) follow their normal lifetime instead.
    if (!store.get().isPinned)
      ports.dismissPreview();
  }
  async function deleteItem(id: string) {
    const item = store.get().history.find((i) => i.id === id);
    if (item?.pinned) {
      console.warn("Cannot delete pinned item");
      return;
    }
    let ttlSeconds = 60;
    try {
      const settings = await ports.getSettings();
      if (settings && typeof settings.delete_ttl_seconds === "number") {
        ttlSeconds = settings.delete_ttl_seconds;
      }
    }
    catch { }
    await ports.deleteItem(id, ttlSeconds);
    store.set({ history: store.get().history.filter((i) => i.id !== id) });
    await loadDeleted();
    updateCounts();
    filterAndRender();
  }
  async function restoreFromDeleted(id: string) {
    const restored = await ports.restoreFromDeleted(id);
    store.set({ deletedItems: store.get().deletedItems.filter((i) => i.id !== id) });
    // Add to history
    store.set({ history: [restored, ...store.get().history.filter((i) => i.id !== restored.id)] });
    updateCounts();
    filterAndRender();
  }
  async function deletePermanentlyFromDeleted(id: string) {
    await ports.deletePermanentlyFromDeleted(id);
    store.set({ deletedItems: store.get().deletedItems.filter((i) => i.id !== id) });
    updateCounts();
    filterAndRender();
  }
  async function loadDeleted() {
    try {
      const res = await ports.getDeleted();
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
    const item = store.get().history.find((i) => i.id === id);
    if (!item)
      return;
    const pinned = !item.pinned;
    await ports.togglePin(id, pinned);
    store.set({ history: store.get().history.map(entry => entry.id === id ? { ...entry, pinned } : entry) });
    updateCounts();
    filterAndRender();
  }
  async function clearView() {
    // Clear only what the user is currently looking at (active tab + search),
    // and never pinned entries — those must be unlocked first.
    if (store.get().currentFilter === "deleted") {
      for (const item of store.get().filteredHistory) {
        await ports.deletePermanentlyFromDeleted(item.id);
      }
      await loadDeleted();
      updateCounts();
      filterAndRender();
      return;
    }
    const ids = store.get().filteredHistory.filter((i) => !i.pinned).map((i) => i.id);
    if (ids.length === 0)
      return;
    let ttlSeconds = 60;
    try {
      const settings = await ports.getSettings();
      if (settings && typeof settings.delete_ttl_seconds === "number") {
        ttlSeconds = settings.delete_ttl_seconds;
      }
    }
    catch { }
    const removed = await ports.clearHistory(ids, ttlSeconds);
    const gone = new Set(removed);
    store.set({ history: store.get().history.filter((i) => !gone.has(i.id)) });
    await loadDeleted();
    updateCounts();
    filterAndRender();
  }
  /** Keep the trash button's tooltip honest about its scope. */
  function updateClearButtonState() {
    if (store.get().currentFilter === "deleted") {
      const clearable = store.get().filteredHistory.length;
      clearBtn.disabled = clearable === 0;
      clearBtn.title = clearable === 0 ? "Nothing to delete permanently" : "Delete permanently from Deleted tab";
      return;
    }
    const clearable = store.get().filteredHistory.filter((i) => !i.pinned).length;
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
      store.set({ history: await ports.getHistory() });
      try {
        const settings = await ports.getSettings();
        store.set({ showPinnedInAll: settings.show_pinned_in_all ?? true });
        callbacks.onSettingsLoaded?.(settings);
      }
      catch { /* Existing history remains usable if preferences cannot be read. */ }
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
