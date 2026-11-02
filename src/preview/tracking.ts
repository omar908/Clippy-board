import type { PreviewPorts, PreviewScheduler } from "./types";
import { createLifetime } from "./lifetime";

/** Coalesce move/resize bursts but retain the final event during an in-flight
 * geometry read. Stopping invalidates queued frames and late subscriptions.
 */
export function createPreviewTracking(ports: PreviewPorts, clock: PreviewScheduler,
  update: () => Promise<void>, onResize: () => void) {
  type Session = { frame: number | null; running: boolean; dirty: boolean; lifetime: ReturnType<typeof createLifetime> };
  let session: Session | null = null;
  function request() {
    const current = session;
    if (!current) return;
    current.dirty = true;
    if (current.running || current.frame !== null) return;
    current.frame = clock.frame(() => {
      current.frame = null;
      if (session !== current) return;
      current.dirty = false;
      current.running = true;
      void update().catch(error => console.error("Preview placement failed:", error)).finally(() => {
        current.running = false;
        if (session === current && current.dirty) request();
      });
    });
  }
  return {
    request,
    start() {
      if (session) return;
      const current: Session = { frame: null, running: false, dirty: false, lifetime: createLifetime() };
      session = current;
      current.lifetime.listen(ports.onMoved(() => { if (session === current) request(); }));
      current.lifetime.listen(ports.onResized(() => {
        if (session === current) { onResize(); request(); }
      }));
    },
    stop() {
      const previous = session;
      session = null;
      if (!previous) return;
      if (previous.frame !== null) clock.cancelFrame(previous.frame);
      previous.lifetime.dispose();
    },
  };
}
