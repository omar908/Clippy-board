export type AppState = {
  history: any[];
  deletedHistory: any[];
  filteredHistory: any[];
  currentFilter: "history" | "deleted";
  selectedIndex: number;
  isListening: boolean;
  searchQuery: string;
};

export class Store {
  state: AppState = {
    history: [],
    deletedHistory: [],
    filteredHistory: [],
    currentFilter: "history",
    selectedIndex: 0,
    isListening: true,
    searchQuery: "",
  };
  private listeners: ((s: AppState) => void)[] = [];
  get() { return this.state; }
  set(partial: Partial<AppState>) {
    this.state = { ...this.state, ...partial };
    this.notify();
  }
  subscribe(fn: (s: AppState) => void) {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter(f => f !== fn); };
  }
  private notify() {
    for (const fn of this.listeners) fn(this.state);
  }
}

export const store = new Store();
