import { describe, expect, it } from "vitest";
import type { ClipboardItem } from "../types";
import { normalizeDeletedItems } from "../api/normalize";
import { Store, type AppFilter } from "./store";
import { deriveHistoryView } from "./selectors";

const history: ClipboardItem[] = [
  { id: "text", timestamp: 30, type: "text", payload: { text: "Hello World", preview: "Hello", char_count: 11, line_count: 1 } },
  { id: "file", timestamp: 20, type: "file", payload: { paths: ["C:/Report.pdf"], preview: "Report", count: 1 } },
  { id: "image", timestamp: 10, pinned: true, type: "image", payload: { data_url: "data:image/png;base64,", width: 640, height: 480, byte_size: 10 } },
];

describe("deriveHistoryView", () => {
  it.each<[AppFilter, string[]]>([
    ["all", ["image", "text", "file"]], ["pinned", ["image"]],
    ["text", ["text"]], ["image", ["image"]], ["file", ["file"]], ["deleted", []],
  ])("filters %s without sorting the source history", (currentFilter, expected) => {
    const store = new Store();
    store.set({ history, currentFilter });
    expect(deriveHistoryView(store.get()).filteredHistory.map(i => i.id)).toEqual(expected);
    expect(history.map(i => i.id)).toEqual(["text", "file", "image"]);
  });

  it.each([
    [" WORLD ", ["text"]], ["report.PDF", ["file"]],
    ["640x480", ["image"]], ["image", ["image"]], ["absent", []],
  ])("searches text, paths and image dimensions: %s", (searchQuery, expected) => {
    const store = new Store();
    store.set({ history, searchQuery: searchQuery as string, selectedIndex: 2 });
    const view = deriveHistoryView(store.get());
    expect(view.filteredHistory.map(i => i.id)).toEqual(expected);
    expect(view.selectedIndex).toBe(0);
  });

  it("searches both nested and flattened deleted entries, newest deletion first", () => {
    const deletedItems = normalizeDeletedItems([
      { ...history[0], deleted_at: 10, original_timestamp: 30 },
      { id: "flat", type: "file", paths: ["C:/hello.txt"], preview: "hello.txt", count: 1, deleted_at: 20, original_timestamp: 20 },
    ]);
    const store = new Store();
    store.set({ currentFilter: "deleted", deletedItems, searchQuery: "HELLO" });
    expect(deriveHistoryView(store.get()).filteredHistory.map(i => i.id)).toEqual(["flat", "text"]);
    expect(deletedItems.map(i => i.id)).toEqual(["text", "flat"]);
  });

  it("retains an in-range selection and clamps it when the view shrinks", () => {
    const store = new Store();
    store.set({ history, selectedIndex: 1 });
    expect(deriveHistoryView(store.get()).selectedIndex).toBe(1);
    store.set({ currentFilter: "pinned" });
    expect(deriveHistoryView(store.get()).selectedIndex).toBe(0);
  });
});
