import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDomPreviewView } from "./dom";

class ElementPort {
  classes = new Set<string>();
  attributes = new Map<string, string>();
  properties = new Map<string, string>();
  handlers = new Map<string, () => void>();
  classList = { add: (name: string) => this.classes.add(name), remove: (name: string) => this.classes.delete(name) };
  style = { setProperty: (name: string, value: string) => this.properties.set(name, value), removeProperty: (name: string) => this.properties.delete(name) };
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  addEventListener(name: string, callback: () => void) { this.handlers.set(name, callback); }
  removeEventListener(name: string) { this.handlers.delete(name); }
  replaceChildren() {}
}
let panel: ElementPort, surface: ElementPort, back: ElementPort;
beforeEach(() => {
  panel = new ElementPort(); surface = new ElementPort(); back = new ElementPort();
  vi.stubGlobal("document", {
    documentElement: {},
    getElementById: (id: string) => id === "preview-panel" ? panel : id === "preview-back" ? back : new ElementPort(),
    querySelector: () => surface,
  });
  vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: () => "480px" }));
});
afterEach(() => vi.unstubAllGlobals());

describe("adaptive preview DOM layout", () => {
  it("applies resolved logical widths and clears compact state on dismissal", () => {
    const view = createDomPreviewView();
    view.setLayout({ width: 338, compact: false });
    view.setDocked(true);
    expect(panel.properties.get("--resolved-preview-width")).toBe("338px");
    view.setLayout({ width: 460, compact: true });
    expect(surface.classes.has("preview-compact")).toBe(true);
    expect(view.width()).toBe(480);
    view.setDocked(false);
    expect(surface.classes.has("preview-compact")).toBe(false);
    expect(panel.classes.has("open")).toBe(false);
    expect(panel.properties.has("--resolved-preview-width")).toBe(false);
    expect(panel.attributes.get("aria-hidden")).toBe("true");
  });

  it("binds and disposes the Back action", () => {
    const view = createDomPreviewView();
    const dismiss = vi.fn();
    const dispose = view.onBack(dismiss);
    back.handlers.get("click")!();
    expect(dismiss).toHaveBeenCalledOnce();
    dispose();
    expect(back.handlers.has("click")).toBe(false);
  });
});
