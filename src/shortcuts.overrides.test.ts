import { afterEach, describe, expect, it, vi } from "vitest";
import { ShortcutManager } from "./shortcuts";
import { installKeyboardWindow } from "./test/keyboard-harness";

afterEach(() => vi.unstubAllGlobals());

function setup() {
  const dispatch = installKeyboardWindow();
  const manager = new ShortcutManager({
    isSettingsOpen: () => false, isSettingsInputActive: () => false,
    isSearchInputActive: () => false, getActiveElement: () => null,
  });
  const first = vi.fn(), second = vi.fn();
  manager.register({ id: "first", combo: "Ctrl+K", action: first });
  manager.register({ id: "second", combo: "Ctrl+L", action: second });
  return { manager, dispatch, first, second };
}

describe("shortcut overrides", () => {
  it("gives saved bindings precedence over defaults and reports collisions", () => {
    const { manager, dispatch, first, second } = setup();
    manager.setBindings({ second: "Ctrl+K" });
    expect(manager.getConflicts()).toEqual([{ combo: "Ctrl+K", ids: ["first", "second"] }]);
    dispatch("k", { ctrlKey: true });
    expect(second).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
  });

  it("disables a saved binding explicitly and restores the default when removed", () => {
    const { manager, dispatch, first } = setup();
    manager.setBindings({ first: null });
    expect(dispatch("k", { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(first).not.toHaveBeenCalled();
    manager.setBindings({});
    dispatch("k", { ctrlKey: true });
    expect(first).toHaveBeenCalledOnce();
  });

  it("gives the most recent temporary scope precedence across different actions", () => {
    const { manager, dispatch, first, second } = setup();
    manager.setBindings({ first: "Ctrl+J" });
    const disposeFirst = manager.overrideBindings({ second: "Ctrl+K" });
    const disposeSecond = manager.overrideBindings({ first: "Ctrl+K" });
    dispatch("k", { ctrlKey: true });
    expect(first).toHaveBeenCalledOnce();
    expect(second).not.toHaveBeenCalled();
    disposeFirst();
    dispatch("k", { ctrlKey: true });
    expect(first).toHaveBeenCalledTimes(2);
    disposeSecond();
    expect(dispatch("k", { ctrlKey: true }).defaultPrevented).toBe(false);
    dispatch("j", { ctrlKey: true });
    expect(first).toHaveBeenCalledTimes(3);
  });

  it("replaces a registration by ID without leaving a duplicate action", () => {
    const { manager, dispatch, first } = setup();
    const replacement = vi.fn();
    manager.register({ id: "first", combo: "Ctrl+K", action: replacement });
    dispatch("k", { ctrlKey: true });
    expect(first).not.toHaveBeenCalled();
    expect(replacement).toHaveBeenCalledOnce();
  });

  it("lets explicit priority resolve a same-layer conflict", () => {
    const { manager, dispatch, second } = setup();
    const priority = vi.fn();
    manager.register({ id: "priority", combo: "Ctrl+L", priority: 10, action: priority });
    dispatch("l", { ctrlKey: true });
    expect(priority).toHaveBeenCalledOnce();
    expect(second).not.toHaveBeenCalled();
  });

  it("does not consume unrelated keys or composition events and disposes its listener", () => {
    const { manager, dispatch, first } = setup();
    expect(dispatch("z", { ctrlKey: true }).defaultPrevented).toBe(false);
    dispatch("k", { ctrlKey: true, isComposing: true });
    expect(first).not.toHaveBeenCalled();
    manager.dispose();
    expect(dispatch("k", { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(first).not.toHaveBeenCalled();
  });
});
