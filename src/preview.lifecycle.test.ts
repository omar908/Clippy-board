import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClipboardItem } from "./types";

class ElementPort {
  children: ElementPort[] = [];
  className = "";
  textContent = "";
  hovered = true;
  private classes = new Set<string>();
  classList = { add: (name: string) => this.classes.add(name), remove: (name: string) => this.classes.delete(name), contains: (name: string) => this.classes.has(name) };
  listeners = new Map<string, () => void>();
  append(...children: ElementPort[]) { this.children.push(...children); }
  replaceChildren() { this.children = []; }
  setAttribute() {}
  addEventListener(name: string, callback: () => void) { this.listeners.set(name, callback); }
  removeEventListener(name: string) { this.listeners.delete(name); }
  matches() { return this.hovered; }
}

const runtime = vi.hoisted(() => ({
  invoke: vi.fn(), emit: vi.fn(async () => {}), listeners: new Map<string, (event: { payload: unknown }) => void>(),
  move: undefined as (() => void) | undefined, resize: undefined as (() => void) | undefined,
  unmove: vi.fn(), unresize: vi.fn(), scale: 1,
  position: { x: 100, y: 100 }, size: { width: 460, height: 580 },
  workArea: { position: { x: 0, y: 0 }, size: { width: 2560, height: 1560 } },
  pointerHeld: false, positionRead: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: runtime.invoke }));
vi.mock("@tauri-apps/api/event", () => ({
  emitTo: runtime.emit,
  listen: vi.fn(async (name, callback) => { runtime.listeners.set(name, callback); return vi.fn(); }),
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    label: "main", scaleFactor: async () => runtime.scale,
    outerPosition: runtime.positionRead, outerSize: async () => runtime.size,
    onMoved: vi.fn(async callback => { runtime.move = callback; return runtime.unmove; }),
    onResized: vi.fn(async callback => { runtime.resize = callback; return runtime.unresize; }),
  }),
  currentMonitor: async () => ({ workArea: runtime.workArea }),
}));

let surface: ElementPort, panel: ElementPort, header: ElementPort, body: ElementPort;
let selected: ClipboardItem | null;
const text = (id: string): ClipboardItem => ({ id, timestamp: 1, type: "text", payload: { text: id, preview: id, char_count: id.length, line_count: 1 } });

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
  runtime.listeners.clear();
  runtime.scale = 1;
  runtime.position = { x: 100, y: 100 };
  runtime.size = { width: 460, height: 580 };
  runtime.pointerHeld = false;
  runtime.positionRead.mockImplementation(async () => runtime.position);
  runtime.invoke.mockImplementation(async command => command === "is_pointer_held" ? runtime.pointerHeld : undefined);
  surface = new ElementPort(); panel = new ElementPort(); header = new ElementPort(); body = new ElementPort();
  selected = text("first");
  vi.stubGlobal("window", { setTimeout, clearTimeout, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => setTimeout(callback, 0));
  vi.stubGlobal("cancelAnimationFrame", (id: ReturnType<typeof setTimeout>) => clearTimeout(id));
  vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: () => "480px" }));
  vi.stubGlobal("document", {
    documentElement: {}, body: new ElementPort(), createElement: () => new ElementPort(),
    getElementById: (id: string) => ({ "preview-header": header, "preview-body": body, "preview-panel": panel })[id],
    querySelector: () => surface,
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

async function setup() {
  const preview = await import("./preview");
  preview.initPreview({ getSelected: () => selected });
  return preview;
}
const calls = (name: string) => runtime.invoke.mock.calls.filter(call => call[0] === name);
const settle = () => vi.advanceTimersByTimeAsync(0);

describe("preview lifecycle regression contracts", () => {
  it("opens only on user selection and pushes later background changes without showing twice", async () => {
    const preview = await setup();
    preview.previewRefresh();
    await settle();
    expect(calls("preview_show")).toEqual([]);
    preview.previewSelectionChanged();
    await settle();
    expect(calls("preview_show")).toHaveLength(1);
    selected = text("second");
    preview.previewRefresh();
    await settle();
    expect(calls("preview_update")).toEqual([["preview_update", { item: selected }]]);
    expect(calls("preview_show")).toHaveLength(1);
  });

  it("uses the readiness handshake and keeps close ownership in main", async () => {
    const preview = await setup();
    preview.previewSelectionChanged();
    await settle();
    runtime.listeners.get("preview-ready")!({ payload: {} });
    expect(runtime.emit).toHaveBeenCalledWith("preview", "preview-content", selected);
    runtime.listeners.get("preview-request-close")!({ payload: {} });
    expect(calls("preview_hide")).toEqual([]);
    surface.hovered = false;
    runtime.listeners.get("preview-request-close")!({ payload: {} });
    preview.previewDismiss();
    await settle();
    expect(calls("preview_hide")).toHaveLength(1);
    expect(runtime.unmove).toHaveBeenCalledOnce();
    expect(runtime.unresize).toHaveBeenCalledOnce();
  });

  it("cancels grace when the pointer crosses into the preview", async () => {
    const preview = await setup();
    preview.previewSelectionChanged();
    await settle();
    surface.listeners.get("mouseleave")!();
    await vi.advanceTimersByTimeAsync(300);
    runtime.listeners.get("preview-cancel-close")!({ payload: {} });
    await vi.advanceTimersByTimeAsync(200);
    expect(calls("preview_hide")).toEqual([]);
    surface.listeners.get("mouseleave")!();
    await vi.advanceTimersByTimeAsync(350);
    expect(calls("preview_hide")).toHaveLength(1);
  });

  it("does not dismiss while the native pointer is held during resize", async () => {
    const preview = await setup();
    preview.previewSelectionChanged();
    await settle();
    surface.hovered = false;
    runtime.pointerHeld = true;
    surface.listeners.get("mouseleave")!();
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls("preview_hide")).toEqual([]);
    runtime.pointerHeld = false;
    await vi.advanceTimersByTimeAsync(700);
    expect(calls("preview_hide")).toHaveLength(1);
  });

  it("switches between docked and separate presentations without retaining docked content", async () => {
    runtime.position = { x: 0, y: 0 };
    runtime.size = { width: 2560, height: 1560 };
    const preview = await setup();
    preview.previewSelectionChanged();
    await settle();
    expect(panel.classList.contains("open")).toBe(true);
    expect(body.children).toHaveLength(1);
    runtime.position = { x: 1000, y: 100 };
    runtime.size = { width: 460, height: 580 };
    preview.previewHandleResize();
    await settle();
    expect(panel.classList.contains("open")).toBe(false);
    expect(body.children).toHaveLength(0);
    expect(calls("preview_show")).toHaveLength(1);
  });

  it("does not show a preview after dismissal while geometry is still loading", async () => {
    let finish!: (position: { x: number; y: number }) => void;
    runtime.positionRead.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const preview = await setup();
    preview.previewSelectionChanged();
    await settle();
    preview.previewDismiss();
    finish({ x: 100, y: 100 });
    await settle();
    expect(calls("preview_show")).toEqual([]);
    expect(panel.classList.contains("open")).toBe(false);
  });
});
