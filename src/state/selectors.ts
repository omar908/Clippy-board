import type { AppState, DisplayItem } from "./store";

/** Compute the visible list without sorting or mutating the stored history. */
export function deriveHistoryView(state: Readonly<AppState>) {
  const { currentFilter, searchQuery } = state;
  const query = searchQuery.trim().toLowerCase();
  let filteredHistory: DisplayItem[];
  if (currentFilter === "deleted") {
    filteredHistory = state.deletedItems.filter(item => {
      if (!query) return true;
      if (item.type === "text") {
        return (item.payload.text || item.payload.preview || "").toLowerCase().includes(query);
      }
      if (item.type === "file") {
        return item.payload.preview.toLowerCase().includes(query) ||
          item.payload.paths.some(path => path.toLowerCase().includes(query));
      }
      if (item.type === "image") return "image".includes(query);
      return true;
    }).sort((a, b) => (b.deleted_at || 0) - (a.deleted_at || 0));
  } else {
    filteredHistory = state.history.filter(item => {
      if (currentFilter === "pinned" && !item.pinned) return false;
      if (currentFilter !== "all" && currentFilter !== "pinned" && item.type !== currentFilter) return false;
      if (!query) return true;
      if (item.type === "text") return item.payload.text.toLowerCase().includes(query);
      if (item.type === "file") return item.payload.paths.some(path => path.toLowerCase().includes(query));
      if (item.type === "image") {
        return "image".includes(query) || `${item.payload.width}x${item.payload.height}`.includes(query);
      }
      return true;
    }).sort((a, b) => {
      const pinned = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
      return pinned || (b.timestamp || 0) - (a.timestamp || 0);
    });
  }
  return {
    filteredHistory,
    selectedIndex: Math.min(state.selectedIndex, Math.max(0, filteredHistory.length - 1)),
  };
}
