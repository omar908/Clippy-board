export function renderEmptyState(
  emptyState: HTMLElement,
  emptyTitle: HTMLElement,
  emptyDesc: HTMLElement,
  options: {
    hasSearch: boolean;
    searchQuery: string;
    currentFilter: string;
    emptyTitleDefault: string;
    emptyDescDefault: string;
    pinnedHidden?: boolean;
  }
) {
  emptyState.style.display = "flex";
  if (options.hasSearch) {
    emptyTitle.textContent = "No matches found";
    emptyDesc.textContent = `No items found matching "${options.searchQuery}"`;
    return;
  }
  if (options.currentFilter === "deleted") {
    emptyTitle.textContent = "No deleted items";
    emptyDesc.textContent = "Items you delete will appear here temporarily until they expire.";
    return;
  }
  if (options.pinnedHidden && options.currentFilter === "all") {
    emptyTitle.textContent = "No unpinned items";
    emptyDesc.textContent = "Your pinned entries are available in the Pinned tab.";
    return;
  }
  emptyTitle.textContent = options.emptyTitleDefault;
  emptyDesc.innerHTML = options.emptyDescDefault;
}
