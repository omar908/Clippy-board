import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClipboardItem } from "./types";

const runtime = vi.hoisted(() => ({
  label: "main",
  handlers: new Map<string, () => void>(),
  events: new Map<string, (event: { payload: ClipboardItem }) => void>(),
  invoke: vi.fn(),
  initPreview: vi.fn(),
  renderList: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: runtime.invoke }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ label: runtime.label }) }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async (name, callback) => {
  runtime.events.set(name, callback);
  return vi.fn();
}) }));
vi.mock("./preview", () => ({ initPreview: runtime.initPreview, previewRefresh: vi.fn(), previewDismiss: vi.fn(), previewSelectionChanged: vi.fn() }));
vi.mock("./ui/render/list", () => ({ renderList: runtime.renderList }));
vi.mock("./ui/keyboard", () => ({ bindKeyboardEvents: vi.fn() }));
vi.mock("./ui/search", () => ({ bindSearchEvents: vi.fn() }));
vi.mock("./ui/settings", () => ({ bindSettingsEvents: vi.fn() }));
vi.mock("./ui/controls", () => ({ bindWindowControls: vi.fn() }));
vi.mock("./ui/elements", () => ({ getAppElements: () => {
  const counter = () => ({ textContent: "" });
  return {
    countAll: counter(), countPinned: counter(), countText: counter(), countImage: counter(), countFile: counter(), countDeleted: counter(),
    clearBtn: {}, filterTabs: [], historyList: { querySelector: () => null, firstElementChild: null },
  };
} }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
  runtime.handlers.clear();
  runtime.events.clear();
  runtime.label = "main";
  runtime.invoke.mockResolvedValue([]);
  vi.stubGlobal("window", { addEventListener: (name: string, callback: () => void) => runtime.handlers.set(name, callback) });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("application startup", () => {
  it("connects clipboard events to the store and renderer and keeps the history cap", async () => {
    await import("./main");
    runtime.handlers.get("DOMContentLoaded")!();
    // Resolve the async initial fetch and listener registration.
    await vi.advanceTimersByTimeAsync(0);
    expect(runtime.initPreview).toHaveBeenCalledOnce();
    expect(runtime.invoke).toHaveBeenCalledWith("get_history");
    const { store } = await import("./state/store");
    const item: ClipboardItem = { id: "copy", timestamp: 1, type: "text", payload: { text: "copy", preview: "copy", char_count: 4, line_count: 1 } };
    const otherItems = Array.from({ length: 10000 }, (_, i) => ({ ...item, id: String(i) }));
    store.set({ history: [...otherItems, item], selectedIndex: 2,
      deletedItems: [{ ...item, deleted_at: 1, original_timestamp: 1 }] });
    runtime.events.get("clipboard-updated")!({ payload: item });
    expect(store.get().history).toHaveLength(10000);
    expect(store.get().history[0].id).toBe("copy");
    expect(store.get().history.filter(entry => entry.id === "copy")).toHaveLength(1);
    expect(store.get().deletedItems).toEqual([]);
    expect(store.get().selectedIndex).toBe(0);
    expect(runtime.renderList).toHaveBeenCalled();
    const host = runtime.initPreview.mock.calls[0][0];
    expect(host.getSelected().id).toBe(store.get().filteredHistory[0].id);
  });

  it("initializes the preview webview without fetching main history or listening for clipboard updates", async () => {
    runtime.label = "preview";
    await import("./main");
    runtime.handlers.get("DOMContentLoaded")!();
    await vi.advanceTimersByTimeAsync(0);
    expect(runtime.initPreview).toHaveBeenCalledOnce();
    expect(runtime.invoke).not.toHaveBeenCalledWith("get_history");
    expect(runtime.events.has("clipboard-updated")).toBe(false);
  });
});
