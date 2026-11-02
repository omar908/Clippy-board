import type { Store, AppFilter } from "../state/store";
import type { AppElements } from "./elements";
import type { HistoryController } from "../app/history";
import { renderTabs } from "./render/tabs";
import { bindTabEvents } from "./events";

export function bindSearchEvents(store: Store, elements: AppElements, history: HistoryController) {
  const { searchInput, searchClearBtn, filterTabs } = elements;
  const { filterAndRender, loadDeleted } = history;
  // Search input events
  searchInput.addEventListener("input", () => {
    store.set({ searchQuery: searchInput.value });
    searchClearBtn.style.display = store.get().searchQuery ? "flex" : "none";
    store.set({ selectedIndex: 0 });
    filterAndRender();
  });
  searchClearBtn.addEventListener("click", () => {
    searchInput.value = "";
    store.set({ searchQuery: "" });
    searchClearBtn.style.display = "none";
    store.set({ selectedIndex: 0 });
    filterAndRender();
  });
  // Filter Tabs
  renderTabs(filterTabs, store.get().currentFilter);
  bindTabEvents(filterTabs, async (filter) => {
    store.set({ currentFilter: filter as AppFilter });
    renderTabs(filterTabs, store.get().currentFilter);
    store.set({ selectedIndex: 0 });
    if (store.get().currentFilter === "deleted") {
      await loadDeleted();
    }
    filterAndRender();
    // Don't auto-focus search bar
  });

}
