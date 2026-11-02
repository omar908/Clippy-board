import { describe, expect, it, vi } from "vitest";
import { Store } from "./store";

describe("Store", () => {
  it("starts on All with independent state for each instance", () => {
    const first = new Store(), second = new Store();
    first.set({ currentFilter: "file", searchQuery: "report", isPaused: true });
    expect(second.get()).toMatchObject({ currentFilter: "all", searchQuery: "", isPaused: false });
    expect(first.get().history).not.toBe(second.get().history);
  });

  it("merges patches, notifies subscribers, and leaves earlier snapshots intact", () => {
    const store = new Store();
    const initial = store.get();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.set({ currentFilter: "pinned", selectedIndex: 2 });
    store.set({ searchQuery: "needle" });
    expect(store.get()).toMatchObject({ currentFilter: "pinned", selectedIndex: 2, searchQuery: "needle" });
    expect(initial).toMatchObject({ currentFilter: "all", selectedIndex: 0, searchQuery: "" });
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenLastCalledWith(store.get());
    unsubscribe();
    store.set({ isPinned: true });
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
