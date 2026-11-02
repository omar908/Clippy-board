import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { ClipboardItem } from "./types";
import { store } from "./state/store";
import { createHistoryController } from "./app/history";
import { getAppElements } from "./ui/elements";
import { renderList } from "./ui/render/list";
import { createSelectionController } from "./ui/selection";
import { bindKeyboardEvents } from "./ui/keyboard";
import { bindSearchEvents } from "./ui/search";
import { bindSettingsEvents } from "./ui/settings";
import { bindWindowControls } from "./ui/controls";
import { initPreview } from "./preview";

const elements = getAppElements();
const history = createHistoryController(store, elements, {
  renderList: () => renderList(elements, () => store.get(), {
    selectItem: history.selectItem,
    togglePin: history.togglePin,
    deleteItem: history.deleteItem,
    restoreFromDeleted: history.restoreFromDeleted,
    deletePermanentlyFromDeleted: history.deletePermanentlyFromDeleted,
    hoverCard: selection.hoverCard,
    isHoverBlocked: selection.isHoverBlocked,
  }),
  onSelected: () => selection.anchorAfterCopy(),
});
const selection = createSelectionController(store, elements, history);
const { updateCounts, filterAndRender, loadDeleted, fetchInitialHistory } = history;
const { historyList } = elements;
const { releaseKeyboard } = selection;

history.updateClearButtonState();
bindKeyboardEvents(store, elements, history, selection);
bindSearchEvents(store, elements, history);
bindSettingsEvents(elements);
bindWindowControls(store, elements, selection, history.clearView);

// Setup real-time clipboard listener
async function setupListener() {
  await listen<ClipboardItem>("clipboard-updated", (event) => {
    const newItem = event.payload;
    // If item was in deleted, remove it from deleted
    store.set({ deletedItems: store.get().deletedItems.filter((i) => i.id !== newItem.id) });
    // Prepend new item
    store.set({ history: [newItem, ...store.get().history.filter((i) => i.id !== newItem.id)] });
    const maxH = store.get().history.length;
    if (maxH > 10000)
      store.set({ history: store.get().history.slice(0, 10000) });
    updateCounts();
    store.set({ selectedIndex: 0 });
    filterAndRender();
    // Ensure we scroll to top when new item comes in (especially when pinned)
    setTimeout(() => {
      const activeEl = historyList.querySelector(".history-item.selected") as HTMLElement | null;
      if (activeEl) {
        activeEl.scrollIntoView({ block: "start", behavior: "smooth" });
      }
      else if (historyList.firstElementChild) {
        historyList.firstElementChild.scrollIntoView({ block: "start", behavior: "smooth" });
      }
    }, 50);
  });
  // Each window session starts mouse-ready: keyboard takeover ends on hide.
  await listen("window-hidden", () => releaseKeyboard());
}
// Periodically refresh deleted items and purge expired
setInterval(async () => {
  try {
    await invoke("purge_expired_deleted");
    await loadDeleted();
    filterAndRender();
  }
  catch (err) {
    // ignore
  }
}, 5000);
// Initialization
window.addEventListener("DOMContentLoaded", () => {
  const label = getCurrentWindow().label;
  // The preview window loads the same bundle but renders only the preview
  // panel; initPreview() branches on the window label internally.
  initPreview({
    getSelected: () => {
      const item = store.get().filteredHistory[store.get().selectedIndex];
      if (!item) return null;
      return "timestamp" in item ? item : { ...item, timestamp: item.original_timestamp };
    },
  });
  if (label === "preview")
    return;
  fetchInitialHistory();
  setupListener();
});
