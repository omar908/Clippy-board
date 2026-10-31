import { describe, expect, it, vi } from "vitest";
import { ShortcutManager } from "./shortcuts";

describe("ShortcutManager", () => {
  it("registers and handles shortcuts", async () => {
    const action = vi.fn();
    const manager = new ShortcutManager({
      isSettingsOpen: () => false,
      isSettingsInputActive: () => false,
      isSearchInputActive: () => false,
      getActiveElement: () => null,
    });
    manager.register({
      id: "test",
      combo: "Ctrl+T",
      action,
      preventDefault: true,
      stopPropagation: true,
    });
    const e = { key: "t", ctrlKey: true, preventDefault: vi.fn(), stopPropagation: vi.fn(), stopImmediatePropagation: vi.fn() } as any;
    await (manager as any).handle(e, false);
    expect(action).toHaveBeenCalled();
  });
});
