import { describe, expect, it, vi } from "vitest";
import { TestKeyEvent } from "./test/keyboard-harness";
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
    const event = new TestKeyEvent("keydown", { key: "t", ctrlKey: true });
    manager.handle(event as unknown as KeyboardEvent);
    expect(action).toHaveBeenCalled();
  });
});
