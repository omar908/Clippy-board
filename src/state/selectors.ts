import type { AppState, DisplayItem } from "./store";

/** Compute the visible list without sorting or mutating the stored history. */
export function deriveHistoryView(state: Readonly<AppState>) {
  const { currentFilter, searchQuery } = state;
  const query = searchQuery.trim().toLowerCase();
  let filteredHistory: DisplayItem[];
  if (currentFilter === "deleted") {
    filteredHistory = state.deletedItems.filter((item: any) => {
      if (!query) return true;
      // Deleted entries may arrive flattened from the backend.
      const payload = item.payload ?? item;
      if (item.type === "text") {
        return (payload.text || payload.preview || "").toLowerCase().includes(query);
      }
      if (item.type === "file") {
        return payload.preview?.toLowerCase().includes(query) ||
          payload.paths?.some((path: string) => path.toLowerCase().includes(query));
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
