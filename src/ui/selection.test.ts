import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Store } from "../state/store";
import type { ClipboardItem } from "../types";
import type { AppElements } from "./elements";
import { createSelectionController } from "./selection";

vi.mock("../preview", () => ({ previewSelectionChanged: vi.fn() }));

let move: (event: { clientX: number; clientY: number }) => void;
let classes: Set<string>;

beforeEach(() => {
  classes = new Set();
  vi.stubGlobal("window", { addEventListener: (_: string, listener: typeof move) => { move = listener; } });
  vi.stubGlobal("document", {
    body: { classList: { add: (name: string) => classes.add(name), remove: (name: string) => classes.delete(name) } },
    elementFromPoint: () => ({ closest: () => ({ dataset: { id: "2" } }) }),
  });
});
afterEach(() => vi.unstubAllGlobals());

function setup() {
  const store = new Store();
  const items: ClipboardItem[] = Array.from({ length: 15 }, (_, i) => ({
    id: String(i), type: "text", timestamp: i,
    payload: { text: String(i), preview: String(i), char_count: 1, line_count: 1 },
  }));
  store.set({ history: items, filteredHistory: items });
  const callbacks = { renderList: vi.fn(), selectItem: vi.fn() };
  const selection = createSelectionController(store, { filterTabs: [] } as unknown as AppElements, callbacks);
  return { store, callbacks, selection };
}

describe("selection controller", () => {
  it("moves the shared selection with arrows and paging, then copies it on Enter", () => {
    const { store, callbacks, selection } = setup();
    selection.handleListKey("PageDown");
    expect(store.get().selectedIndex).toBe(10);
    selection.handleListKey("End");
    selection.handleListKey("ArrowDown");
    expect(store.get().selectedIndex).toBe(14);
    selection.handleListKey("ArrowUp");
    selection.handleListKey("Enter");
    expect(callbacks.selectItem).toHaveBeenCalledWith("13");
    selection.handleListKey("Home");
    selection.handleListKey("PageUp");
    expect(store.get().selectedIndex).toBe(0);
  });

  it("ignores a parked pointer during keyboard navigation until it moves", () => {
    const { store, selection } = setup();
    move({ clientX: 10, clientY: 20 });
    selection.handleListKey("ArrowDown");
    expect(classes.has("keyboard-nav")).toBe(true);
    selection.hoverCard("0", 10, 20);
    expect(store.get().selectedIndex).toBe(1);
    selection.hoverCard("0", 11, 20);
    expect(store.get().selectedIndex).toBe(0);
    expect(classes.has("keyboard-nav")).toBe(false);
  });

  it("waits for distinct pointer positions before releasing the resize guard", () => {
    const { store, selection } = setup();
    selection.armHoverResizeGuard();
    move({ clientX: 10, clientY: 20 });
    move({ clientX: 10, clientY: 20 });
    expect(selection.isHoverBlocked()).toBe(true);
    expect(store.get().selectedIndex).toBe(0);
    move({ clientX: 11, clientY: 20 });
    expect(selection.isHoverBlocked()).toBe(false);
    expect(store.get().selectedIndex).toBe(2);
  });

  it("anchors hover after copying and releases keyboard ownership on hide", () => {
    const { store, selection } = setup();
    move({ clientX: 10, clientY: 20 });
    selection.anchorAfterCopy();
    selection.hoverCard("3", 10, 20);
    expect(store.get().selectedIndex).toBe(0);
    selection.handleListKey("ArrowDown");
    selection.releaseKeyboard();
    expect(classes.has("keyboard-nav")).toBe(false);
    selection.hoverCard("3", 10, 20);
    expect(store.get().selectedIndex).toBe(3);
  });
});
