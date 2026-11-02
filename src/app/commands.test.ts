import { describe, expect, it, vi } from "vitest";
import { Store } from "../state/store";
import type { ClipboardItem } from "../types";
import type { AppElements } from "../ui/elements";
import type { SelectionController } from "../ui/selection";
import type { HistoryController } from "./history";
import { createAppCommands } from "./commands";

vi.mock("../preview", () => ({ previewDismiss: vi.fn() }));

describe("application command availability", () => {
  it("resolves the current selection at execution and protects pinned/deleted items", async () => {
    const store = new Store();
    const item: ClipboardItem = { id: "first", timestamp: 1, type: "text", payload: { text: "a", preview: "a", char_count: 1, line_count: 1 } };
    const locked = { ...item, id: "locked", pinned: true };
    const history = {
      selectItem: vi.fn(), togglePin: vi.fn(), deleteItem: vi.fn(),
      restoreFromDeleted: vi.fn(), deletePermanentlyFromDeleted: vi.fn(), clearView: vi.fn(),
    };
    const selection = { handleListKey: vi.fn(), cycleFilterTab: vi.fn() };
    const commands = createAppCommands(store, {} as AppElements,
      history as unknown as HistoryController, selection as unknown as SelectionController);
    expect(await commands.execute("item.copy")).toBe(false);
    store.set({ history: [item, locked], filteredHistory: [item, locked], selectedIndex: 1 });
    expect(await commands.execute("item.delete")).toBe(false);
    expect(history.deleteItem).not.toHaveBeenCalled();
    await commands.execute("item.pin");
    expect(history.togglePin).toHaveBeenCalledExactlyOnceWith("locked");
    store.set({ selectedIndex: 0 });
    await commands.execute("item.copy");
    expect(history.selectItem).toHaveBeenCalledExactlyOnceWith("first");
    await commands.execute("item.delete");
    expect(history.deleteItem).toHaveBeenCalledExactlyOnceWith("first");
    store.set({ currentFilter: "deleted", deletedItems: [{ ...item, deleted_at: 2, original_timestamp: 1 }] });
    expect(await commands.execute("item.copy", "first")).toBe(true);
    expect(await commands.execute("item.pin", "first")).toBe(false);
    expect(await commands.execute("item.delete", "first")).toBe(true);
    expect(history.deletePermanentlyFromDeleted).toHaveBeenCalledExactlyOnceWith("first");
    expect(history.deleteItem).toHaveBeenCalledTimes(1);
    expect(await commands.execute("item.copy", "unknown")).toBe(false);
    expect(await commands.execute("item.delete", "unknown")).toBe(false);
    expect(await commands.execute("item.restore", "unknown")).toBe(false);
    await commands.execute("item.restore", "first");
    expect(history.restoreFromDeleted).toHaveBeenCalledExactlyOnceWith("first");
  });
});
