import type { Placement } from "../placement";
import type { PreviewHost, PreviewPorts, PreviewScheduler, PreviewView } from "./types";
import { createPreviewGrace } from "./grace";
import { createPreviewTracking } from "./tracking";
import { resolveGeometryPlacement } from "./geometry";
import { createLifetime } from "./lifetime";

/** Main owns presentation and selected content. Native writes are serialized;
 * geometry and pointer reads are invalidated when their session ends.
 */
export function createPreviewController(host: PreviewHost, ports: PreviewPorts, view: PreviewView, clock: PreviewScheduler) {
  let open = false;
  let disposed = false;
  let generation = 0;
  let mode: "none" | "window" | "docked" = "none";
  let renderedId: string | null = null;
  let effects = Promise.resolve();
  const lifetime = createLifetime();
  const valid = (token: number) => !disposed && open && generation === token;
  function enqueue(task: () => Promise<void>) {
    effects = effects.then(task).catch(error => console.error("Preview operation failed:", error));
    return effects;
  }
  const grace = createPreviewGrace({
    scheduler: clock, active: () => open, hovered: view.hovered,
    pointerHeld: ports.pointerHeld, close: dismiss,
  });
  const tracking = createPreviewTracking(ports, clock, position, grace.refreshHold);

  async function syncContent(token: number) {
    if (!valid(token)) return;
    const item = host.getSelected();
    if (!item) { dismiss(); return; }
    if (item.id === renderedId || mode === "none") return;
    if (mode === "docked") view.render(item);
    else await ports.update(item);
    if (valid(token)) renderedId = item.id;
  }
  async function apply(placement: Placement, token: number, scale: number) {
    if (!valid(token)) return;
    let item = host.getSelected();
    if (!item) { dismiss(); return; }
    if (placement.docked) {
      if (mode !== "docked") {
        await ports.hide();
        if (!valid(token)) return;
        void ports.emit("preview", "preview-hidden", {}).catch(() => {});
        // The selection can move while the native operation is pending.
        item = host.getSelected();
        if (!item) { dismiss(); return; }
      }
      view.setLayout({ width: placement.width / scale, compact: Boolean(placement.compact) });
      view.setDocked(true);
      if (mode !== "docked") {
        view.render(item);
        mode = "docked";
        renderedId = item.id;
      }
    } else if (mode !== "window") {
      view.setDocked(false);
      view.clear();
      await ports.show(placement, item);
      if (!valid(token)) return;
      mode = "window";
      renderedId = item.id;
    } else await ports.move(placement);
    await syncContent(token);
  }
  async function position() {
    const token = generation;
    if (!valid(token)) return;
    const geometry = await ports.geometry();
    if (!valid(token)) return;
    const placement = resolveGeometryPlacement(geometry, view.width());
    await enqueue(() => apply(placement, token, geometry.scale));
  }
  function dismiss() {
    const wasOpen = open;
    open = false;
    generation++;
    mode = "none";
    renderedId = null;
    grace.reset();
    tracking.stop();
    if (!wasOpen) return;
    view.clear();
    view.setDocked(false);
    void enqueue(async () => {
      await ports.hide();
      await ports.emit("preview", "preview-hidden", {});
    });
  }
  function update(shouldOpen: boolean) {
    if (disposed) return;
    if (!host.getSelected()) { dismiss(); return; }
    if (!open) {
      if (!shouldOpen) return;
      open = true;
      generation++;
      tracking.start();
    }
    if (mode === "none") tracking.request();
    else {
      const token = generation;
      void enqueue(() => syncContent(token));
    }
  }
  lifetime.own(view.onSurface("mouseenter", grace.cancel));
  lifetime.own(view.onBack(dismiss));
  lifetime.own(view.onSurface("mouseleave", () => { if (open) grace.start(); }));
  lifetime.listen(ports.listen("preview-ready", () => {
    const item = host.getSelected();
    if (open && item) void ports.emit("preview", "preview-content", item).catch(() => {});
  }));
  lifetime.listen(ports.listen("preview-request-close", () => { if (!view.hovered()) dismiss(); }));
  lifetime.listen(ports.listen("preview-cancel-close", grace.cancel));
  lifetime.listen(ports.listen("window-hidden", dismiss));

  return {
    selectionChanged() { grace.cancel(); update(true); },
    refresh() { if (open) update(false); },
    dismiss,
    handleResize() { grace.refreshHold(); tracking.request(); },
    dragStart: grace.dragStart,
    dragEnd: grace.dragEnd,
    dispose() {
      if (disposed) return;
      dismiss();
      disposed = true;
      lifetime.dispose();
      grace.dispose();
    },
  };
}
