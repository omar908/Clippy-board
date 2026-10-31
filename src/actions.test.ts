import { describe, expect, it, vi } from "vitest";
import { togglePinAction, toggleListeningAction, copyItemAction } from "./actions";

vi.mock("./api/clipboard", () => ({
  togglePin: vi.fn(async () => {}),
  setListeningPaused: vi.fn(async () => {}),
  selectItem: vi.fn(async () => {}),
  deleteItem: vi.fn(async () => {}),
  clearHistory: vi.fn(async () => []),
  restoreFromDeleted: vi.fn(async () => ({})),
  deletePermanentlyFromDeleted: vi.fn(async () => {}),
}));

vi.mock("./api/window", () => ({
  hideWindow: vi.fn(async () => {}),
  setInteracting: vi.fn(async () => {}),
}));

vi.mock("./api/settings", () => ({
  getSettings: vi.fn(async () => ({})),
  saveSettings: vi.fn(async () => {}),
}));

describe("actions", () => {
  it("togglePinAction calls fetch and render", async () => {
    const fetch = vi.fn(async () => {});
    const render = vi.fn();
    await togglePinAction({ id: "1", pinned: false }, fetch, render);
    expect(fetch).toHaveBeenCalled();
    expect(render).toHaveBeenCalled();
  });

  it("toggleListeningAction toggles and updates UI", async () => {
    const setPaused = vi.fn();
    const updateUI = vi.fn();
    await toggleListeningAction(false, setPaused, updateUI);
    expect(setPaused).toHaveBeenCalledWith(true);
    expect(updateUI).toHaveBeenCalledWith(true);
  });

  it("copyItemAction calls selectItem", async () => {
    const { selectItem } = await import("./api/clipboard");
    await copyItemAction("123");
    expect(selectItem).toHaveBeenCalledWith("123");
  });
});
