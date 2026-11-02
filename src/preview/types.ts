import type { ClipboardItem } from "../types";
import type { Placement, Rect } from "../placement";

export type Dispose = () => void;
export type PreviewHost = { getSelected: () => ClipboardItem | null };
export type PreviewGeometry = { main: Rect; workArea: Rect | null; scale: number };
export type PreviewEvents = {
  "preview-ready": unknown;
  "preview-content": unknown;
  "preview-hidden": unknown;
  "preview-request-close": unknown;
  "preview-cancel-close": unknown;
  "window-hidden": unknown;
};
export interface PreviewPorts {
  label: string;
  geometry(): Promise<PreviewGeometry>;
  show(placement: Placement, item: ClipboardItem): Promise<void>;
  hide(): Promise<void>;
  move(placement: Placement): Promise<void>;
  update(item: ClipboardItem): Promise<void>;
  pointerHeld(): Promise<boolean>;
  setInteractive(interactive: boolean): Promise<void>;
  onMoved(callback: () => void): Promise<Dispose>;
  onResized(callback: () => void): Promise<Dispose>;
  listen<K extends keyof PreviewEvents>(name: K, callback: (payload: PreviewEvents[K]) => void): Promise<Dispose>;
  emit<K extends keyof PreviewEvents>(target: "main" | "preview", name: K, payload: PreviewEvents[K]): Promise<void>;
}
export interface PreviewView {
  width(): number;
  render(item: ClipboardItem): void;
  clear(): void;
  setDocked(docked: boolean): void;
  setLayout(layout: { width: number; compact: boolean }): void;
  onBack(callback: () => void): Dispose;
  setPreviewWindow(): void;
  hovered(): boolean;
  onSurface(name: "mouseenter" | "mouseleave", callback: () => void): Dispose;
  onPanel(name: "mouseenter" | "mouseleave", callback: () => void): Dispose;
}
export interface PreviewScheduler {
  now(): number;
  timeout(callback: () => void, delay: number): number;
  clearTimeout(id: number): void;
  frame(callback: () => void): number;
  cancelFrame(id: number): void;
}
export const browserScheduler: PreviewScheduler = {
  now: () => Date.now(),
  timeout: (callback, delay) => window.setTimeout(callback, delay),
  clearTimeout: id => window.clearTimeout(id),
  frame: callback => requestAnimationFrame(callback),
  cancelFrame: id => cancelAnimationFrame(id),
};
