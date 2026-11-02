import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { Store } from "../state/store";
import type { ClipboardItem } from "../types";
import type { AppElements } from "../ui/elements";
import { previewDismiss } from "../preview";
import { createHistoryController } from "./history";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../preview", () => ({ previewRefresh: vi.fn(), previewDismiss: vi.fn() }));

const text = (id: string, pinned = false): ClipboardItem => ({
  id, pinned, timestamp: 1, type: "text",
  payload: { text: id, preview: id, char_count: id.length, line_count: 1 },
});

function setup() {
  const store = new Store();
  const counter = () => ({ textContent: "" });
  const elements = {
    countAll: counter(), countPinned: counter(), countText: counter(),
    countImage: counter(), countFile: counter(), countDeleted: counter(),
    clearBtn: { disabled: false, title: "" },
  } as unknown as AppElements;
  const callbacks = { renderList: vi.fn(), onSelected: vi.fn() };
  return { store, elements, callbacks, controller: createHistoryController(store, elements, callbacks) };
}

beforeEach(() => vi.mocked(invoke).mockReset());
afterEach(() => vi.restoreAllMocks());

describe("history controller with shared state", () => {
  it("refreshes both tabs and counts after restoring and copying from Deleted", async () => {
    const { store, controller, callbacks } = setup();
    const deleted = ["one", "two"].map(id => ({ ...text(id), deleted_at: 10, original_timestamp: 1 }));
    store.set({ currentFilter: "deleted", deletedItems: deleted, selectedIndex: 1 });
    controller.filterAndRender();
    vi.mocked(invoke).mockImplementation(async command => {
      if (command === "get_history") return [{ ...text("two"), timestamp: 100 }];
      if (command === "get_deleted") return [deleted[0]];
    });
    await controller.selectItem("two");
    expect(invoke).toHaveBeenCalledWith("select_item", { id: "two" });
    expect(store.get().deletedItems).toMatchObject([{ id: "one", original_timestamp: 1, deleted_at: 10 }]);
    expect(store.get().history).toEqual([{ ...text("two"), timestamp: 100 }]);
    expect(store.get().selectedIndex).toBe(0);
    expect(callbacks.onSelected).toHaveBeenCalledOnce();
  });
  it("leaves Deleted intact when copying fails", async () => {
    const { store, controller } = setup();
    const deleted = [{ ...text("one"), deleted_at: 10, original_timestamp: 1 }];
    store.set({ currentFilter: "deleted", deletedItems: deleted });
    vi.mocked(invoke).mockRejectedValueOnce(new Error("Clipboard busy"));
    await expect(controller.selectItem("one")).rejects.toThrow("Clipboard busy");
    expect(store.get().deletedItems).toEqual(deleted);
    expect(store.get().history).toEqual([]);
  });
  it("preserves the last valid history when a malformed fetch is rejected at the API boundary", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { store, controller, callbacks } = setup();
    store.set({ history: [text("existing")] });
    const previous = store.get();
    vi.mocked(invoke).mockResolvedValueOnce([{ id: "broken", timestamp: 1, type: "file", paths: [42] }]);
    await controller.fetchInitialHistory();
    expect(store.get()).toBe(previous);
    expect(callbacks.renderList).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith("Failed to load initial history:", expect.any(TypeError));
  });

  it("clears only matching, unpinned items and refreshes the store and counts", async () => {
    const { store, controller, elements } = setup();
    store.set({ history: [text("match"), text("match-locked", true), text("other")], searchQuery: "match" });
    controller.filterAndRender();
    vi.mocked(invoke).mockImplementation(async command => {
      if (command === "get_settings") return { delete_ttl_seconds: 45 };
      if (command === "clear_history") return ["match"];
      return [];
    });
    await controller.clearView();
    expect(invoke).toHaveBeenCalledWith("clear_history", { ids: ["match"], ttlSeconds: 45 });
    expect(store.get().history.map(i => i.id)).toEqual(["match-locked", "other"]);
    expect(store.get().filteredHistory.map(i => i.id)).toEqual(["match-locked"]);
    expect(elements.countAll.textContent).toBe("2");
    expect(elements.clearBtn.disabled).toBe(true);
  });

  it("restores an item once and removes it from Deleted", async () => {
    const { store, controller } = setup();
    const restored = text("restored");
    const newer = { ...text("newer"), timestamp: 10 };
    store.set({ history: [newer, restored], deletedItems: [{ ...restored, deleted_at: 2, original_timestamp: 1 }] });
    vi.mocked(invoke).mockResolvedValue(restored);
    await controller.restoreFromDeleted("restored");
    expect(store.get().history).toEqual([restored, newer]);
    expect(store.get().filteredHistory.map(item => item.id)).toEqual(["newer", "restored"]);
    expect(invoke).toHaveBeenCalledExactlyOnceWith("restore_from_deleted", { id: "restored" });
    expect(store.get().deletedItems).toEqual([]);
  });

  it("publishes pin changes through the store without mutating old snapshots", async () => {
    const { store, controller } = setup();
    const item = text("pin-me");
    store.set({ history: [item] });
    const oldState = store.get();
    const listener = vi.fn();
    store.subscribe(listener);
    await controller.togglePin(item.id);
    expect(invoke).toHaveBeenCalledWith("toggle_pin", { id: item.id, pinned: true });
    expect(store.get().history[0].pinned).toBe(true);
    expect(oldState.history[0].pinned).toBe(false);
    expect(listener).toHaveBeenCalled();
  });

  it("leaves pin state unchanged if the backend rejects the mutation", async () => {
    const { store, controller } = setup();
    store.set({ history: [text("pin-me")] });
    vi.mocked(invoke).mockRejectedValueOnce(new Error("offline"));
    await expect(controller.togglePin("pin-me")).rejects.toThrow("offline");
    expect(store.get().history[0].pinned).toBe(false);
  });

  it("resets selection after copying and keeps a pinned window's preview open", async () => {
    vi.mocked(previewDismiss).mockClear();
    const { store, controller, callbacks } = setup();
    store.set({ history: [text("first"), text("second")], selectedIndex: 1, isPinned: true });
    await controller.selectItem("second");
    expect(store.get().selectedIndex).toBe(0);
    expect(callbacks.onSelected).toHaveBeenCalledOnce();
    expect(previewDismiss).not.toHaveBeenCalled();
    store.set({ isPinned: false });
    await controller.selectItem("first");
    expect(previewDismiss).toHaveBeenCalledOnce();
  });
});
