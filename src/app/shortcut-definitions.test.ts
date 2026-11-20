import { describe, expect, it } from "vitest";
import { bindingsFromSettings, validateShortcutSettings } from "./shortcut-definitions";

describe("saved shortcut settings", () => {
  it("preserves legacy settings keys and explicit disabling", () => {
    expect(bindingsFromSettings({ pinItem: "Ctrl+K", pause: "", unrelated: "Ctrl+Q" }))
      .toEqual({ "item.pin": "Ctrl+K", "listening.toggle": null,
        "tabs.ArrowLeft.search": "Alt+ArrowLeft", "tabs.ArrowRight.search": "Alt+ArrowRight" });
  });

  it("rejects collisions with configured actions and fixed navigation", () => {
    expect(() => validateShortcutSettings({ pause: "Ctrl+F" })).toThrow("both use Ctrl+F");
    expect(() => validateShortcutSettings({ search: "ArrowDown" })).toThrow("both use ArrowDown");
    expect(() => validateShortcutSettings({ search: "Ctrl+K", pause: "Ctrl+F" })).not.toThrow();
    expect(() => validateShortcutSettings({ restore: "Alt+Space" })).toThrow("both use Alt+Space");
    expect(() => validateShortcutSettings({ windowMenu: "Ctrl+R" })).toThrow("both use Ctrl+R");
    expect(bindingsFromSettings({ restore: "", windowMenu: "Ctrl+M" }))
      .toEqual({ "item.restore": null, "window.menu": "Ctrl+M",
        "tabs.ArrowLeft.search": "Alt+ArrowLeft", "tabs.ArrowRight.search": "Alt+ArrowRight" });
  });

  it("derives search bindings without repeating Alt and preserves disabling", () => {
    expect(bindingsFromSettings({ tabLeft: "Alt+J", tabRight: "" })).toMatchObject({
      "tabs.ArrowLeft.search": "Alt+J", "tabs.ArrowRight.search": null,
    });
    expect(() => validateShortcutSettings({ tabLeft: "Space" })).toThrow("both use Alt+Space while searching");
  });
});
