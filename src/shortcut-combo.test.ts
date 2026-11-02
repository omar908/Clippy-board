import { describe, expect, it } from "vitest";
import { normalizeShortcut, shortcutFromEvent } from "./shortcut-combo";

describe("shortcut normalization", () => {
  it.each([
    ["Shift+Control+Alt+k", "Ctrl+Alt+Shift+K"],
    ["Cmd+Esc", "Meta+Escape"], ["ctrl+spacebar", "Ctrl+Space"], ["", ""],
  ])("canonicalizes %s", (combo, expected) => expect(normalizeShortcut(combo)).toBe(expected));

  it.each(["Ctrl+Ctrl+K", "Ctrl+Shift", "Ctrl+K+L", "Ctrl++K"])("rejects malformed binding %s", combo => {
    expect(() => normalizeShortcut(combo)).toThrow("Invalid shortcut");
  });

  it("preserves every modifier and uses the same representation for events", () => {
    const event = { key: "k", ctrlKey: true, metaKey: true, altKey: true, shiftKey: true } as KeyboardEvent;
    expect(shortcutFromEvent(event)).toBe(normalizeShortcut("Shift+Alt+Meta+Ctrl+k"));
    expect(shortcutFromEvent({ ...event, key: "Control" })).toBe("");
  });
});
