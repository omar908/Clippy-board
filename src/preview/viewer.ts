import { normalizeClipboardItem } from "../api/normalize";
import type { PreviewPorts, PreviewView, PreviewScheduler } from "./types";
import { createLifetime } from "./lifetime";
import { createPreviewGrace } from "./grace";

/** Separate webview mirrors content; it requests closure from main. */
export function createPreviewViewer(ports: PreviewPorts, view: PreviewView, clock: PreviewScheduler) {
  let open = false;
  let disposed = false;
  const lifetime = createLifetime();
  const grace = createPreviewGrace({
    scheduler: clock, active: () => open, hovered: view.hovered, pointerHeld: ports.pointerHeld,
    close: () => { void ports.emit("main", "preview-request-close", {}).catch(() => {}); },
  });
  view.setPreviewWindow();
  const ready = ports.listen("preview-content", payload => {
    if (disposed || !payload) return;
    try { view.render(normalizeClipboardItem(payload)); open = true; }
    catch (error) { console.error("Invalid preview content:", error); }
  });
  lifetime.listen(ready);
  lifetime.listen(ports.listen("preview-hidden", () => { open = false; grace.reset(); view.clear(); }));
  lifetime.own(view.onPanel("mouseenter", () => {
    grace.cancel();
    void ports.emit("main", "preview-cancel-close", {}).catch(() => {});
    void ports.setInteractive(true).catch(() => {});
  }));
  lifetime.own(view.onPanel("mouseleave", () => {
    void ports.setInteractive(false).catch(() => {});
    if (open) grace.start();
  }));
  // Announce only after the content listener is actually registered.
  void ready.then(() => { if (!disposed) return ports.emit("main", "preview-ready", {}); }).catch(() => {});
  return {
    selectionChanged() {}, refresh() {},
    dismiss() { open = false; grace.reset(); view.clear(); },
    handleResize: grace.refreshHold, dragStart: grace.dragStart, dragEnd: grace.dragEnd,
    dispose() { disposed = true; open = false; grace.dispose(); lifetime.dispose(); view.clear(); },
  };
}
