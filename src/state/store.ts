import type { ClipboardItem, DeletedItem } from "../types";

export type AppFilter = "all" | "pinned" | "text" | "image" | "file" | "deleted";
export type DisplayItem = (ClipboardItem | DeletedItem) & { pinned?: boolean };

export type AppState = {
  history: ClipboardItem[];
  deletedItems: DeletedItem[];
  filteredHistory: DisplayItem[];
  currentFilter: AppFilter;
  selectedIndex: number;
  searchQuery: string;
  isPinned: boolean;
  isPaused: boolean;
};

export class Store {
  private state: AppState = {
    history: [], deletedItems: [], filteredHistory: [],
    currentFilter: "all", selectedIndex: 0, searchQuery: "",
    isPinned: false, isPaused: false,
  };
  private listeners = new Set<(state: AppState) => void>();

  get(): Readonly<AppState> { return this.state; }

  set(partial: Partial<AppState>) {
    this.state = { ...this.state, ...partial };
    for (const listener of this.listeners) listener(this.state);
  }

  subscribe(listener: (state: AppState) => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
}

// Each Tauri webview loads its own instance, including the preview window.
export const store = new Store();
