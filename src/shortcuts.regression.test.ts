import { afterEach, describe, expect, it, vi } from "vitest";
import { ShortcutManager, type ShortcutContext } from "./shortcuts";
import { installKeyboardWindow, settleKeyboard, TestKeyEvent } from "./test/keyboard-harness";

afterEach(() => vi.unstubAllGlobals());

const context = (overrides: Partial<ShortcutContext> = {}): ShortcutContext => ({
  isSettingsOpen: () => false,
  isSettingsInputActive: () => false,
  isSearchInputActive: () => false,
  getActiveElement: () => null,
  ...overrides,
});

describe("shortcut regression contracts", () => {
  // Bindings are now cached synchronously; actions may still be asynchronous.
  // These assertions retain the original one-execution/consumption contracts.
  it("executes an asynchronous action once across capture and bubble", async () => {
    const dispatch = installKeyboardWindow();
    const action = vi.fn(async () => {});
    const manager = new ShortcutManager(context());
    manager.register({ id: "pin", combo: "Alt+P", action, stopImmediatePropagation: true });
    dispatch("p", { altKey: true });
    await settleKeyboard();
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("consumes a matching key before asynchronous work yields", async () => {
    const dispatch = installKeyboardWindow();
    const manager = new ShortcutManager(context());
    const action = vi.fn();
    manager.register({ id: "custom", combo: "Ctrl+K", action });
    const event = dispatch("k", { ctrlKey: true });
    const consumedDuringDispatch = event.defaultPrevented;
    await settleKeyboard();
    expect(consumedDuringDispatch).toBe(true);
    expect(action).toHaveBeenCalledOnce();
  });

  it("distinguishes Ctrl+Shift+P from Ctrl+P", async () => {
    installKeyboardWindow();
    const manager = new ShortcutManager(context());
    const action = vi.fn();
    manager.register({ id: "pause", combo: "Ctrl+P", action });
    await manager.handle(new TestKeyEvent("keydown", { key: "p", ctrlKey: true, shiftKey: true }) as unknown as KeyboardEvent);
    expect(action).not.toHaveBeenCalled();
  });

  it("uses the current binding and stops matching the old one", async () => {
    installKeyboardWindow();
    const manager = new ShortcutManager(context());
    const action = vi.fn();
    let binding = "Ctrl+K";
    manager.register({ id: "custom", combo: () => binding, action });
    const press = (key: string) => manager.handle(new TestKeyEvent("keydown", { key, ctrlKey: true }) as unknown as KeyboardEvent);
    await press("k");
    binding = "Ctrl+L";
    await press("k");
    expect(action).toHaveBeenCalledTimes(1);
    await press("l");
    expect(action).toHaveBeenCalledTimes(2);
  });

  it.each(["INPUT", "TEXTAREA"])("blocks item actions while typing in %s", async tagName => {
    installKeyboardWindow();
    const action = vi.fn();
    const manager = new ShortcutManager(context({ getActiveElement: () => ({ tagName }) as HTMLElement }));
    manager.register({ id: "delete", combo: "Delete", action });
    await manager.handle(new TestKeyEvent("keydown", { key: "Delete" }) as unknown as KeyboardEvent);
    expect(action).not.toHaveBeenCalled();
  });
});
