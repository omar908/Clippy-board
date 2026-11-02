import { vi } from "vitest";
import type { ClipboardItem } from "../types";
import { browserScheduler, type Dispose, type PreviewEvents, type PreviewGeometry, type PreviewPorts, type PreviewView } from "./types";

export const textItem = (id: string): ClipboardItem => ({
  id, timestamp: 1, type: "text", payload: { text: id, preview: id, char_count: id.length, line_count: 1 },
});
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
export function previewFixture() {
  vi.stubGlobal("window", { setTimeout, clearTimeout });
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => setTimeout(callback, 0));
  vi.stubGlobal("cancelAnimationFrame", (id: ReturnType<typeof setTimeout>) => clearTimeout(id));
  const events = new Map<keyof PreviewEvents, (payload: unknown) => void>();
  const domEvents = new Map<string, () => void>();
  const geometry: PreviewGeometry = {
    main: { x: 100, y: 100, width: 460, height: 580 },
    workArea: { x: 0, y: 0, width: 2560, height: 1560 }, scale: 1,
  };
  const move = { callback: () => {} }, resize = { callback: () => {} };
  const unmove = vi.fn(), unresize = vi.fn(), unlisten = vi.fn();
  const ports = {
    label: "main",
    geometry: vi.fn(async () => geometry),
    show: vi.fn(async () => {}), hide: vi.fn(async () => {}), move: vi.fn(async () => {}),
    update: vi.fn(async () => {}), pointerHeld: vi.fn(async () => false),
    setInteractive: vi.fn(async () => {}),
    onMoved: vi.fn(async (callback: () => void): Promise<Dispose> => { move.callback = callback; return () => { unmove(); }; }),
    onResized: vi.fn(async (callback: () => void): Promise<Dispose> => { resize.callback = callback; return () => { unresize(); }; }),
    listen: vi.fn(async (name: keyof PreviewEvents, callback: (payload: unknown) => void): Promise<Dispose> => {
      events.set(name, callback); return () => { unlisten(); };
    }),
    emit: vi.fn(async () => {}),
  } satisfies PreviewPorts;
  const view = {
    width: vi.fn(() => 480), render: vi.fn(), clear: vi.fn(), setDocked: vi.fn(),
    setLayout: vi.fn(),
    onBack: (callback: () => void) => {
      domEvents.set("back", callback); return () => { domEvents.delete("back"); };
    },
    setPreviewWindow: vi.fn(), hovered: vi.fn(() => true),
    onSurface: (name: string, callback: () => void) => {
      domEvents.set(`surface.${name}`, callback);
      return () => { domEvents.delete(`surface.${name}`); };
    },
    onPanel: (name: string, callback: () => void) => {
      domEvents.set(`panel.${name}`, callback);
      return () => { domEvents.delete(`panel.${name}`); };
    },
  } satisfies PreviewView;
  const host = { getSelected: vi.fn<() => ClipboardItem | null>(() => textItem("first")) };
  return { ports, view, host, geometry, move, resize, events, domEvents, unmove, unresize, unlisten, clock: browserScheduler };
}

export const settlePreview = () => vi.advanceTimersByTimeAsync(1);
