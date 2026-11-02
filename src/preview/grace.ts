import type { PreviewScheduler } from "./types";

/** Cancellable grace/resize hold. Pending pointer queries belong to a generation
 * so a late result cannot dismiss a preview that the pointer has re-entered.
 */
export function createPreviewGrace(options: {
  scheduler: PreviewScheduler;
  active: () => boolean;
  hovered: () => boolean;
  pointerHeld: () => Promise<boolean>;
  close: () => void;
}) {
  const clock = options.scheduler;
  let generation = 0;
  let timer: number | null = null;
  let nativeDrag = false;
  let holdUntil = 0;
  let disposed = false;

  function cancel() {
    generation++;
    if (timer !== null) clock.clearTimeout(timer);
    timer = null;
    holdUntil = 0;
  }
  const valid = (token: number) => !disposed && options.active() && token === generation;
  async function fire(token: number, pollingSince?: number) {
    if (!valid(token) || nativeDrag || clock.now() < holdUntil) return;
    const held = await options.pointerHeld();
    if (!valid(token) || nativeDrag || clock.now() < holdUntil) return;
    if (held) {
      const since = pollingSince ?? clock.now();
      if (clock.now() - since >= 30_000) { refreshHold(); return; }
      timer = clock.timeout(() => { timer = null; void fire(token, since); }, 150);
    } else if (pollingSince !== undefined) refreshHold();
    else options.close();
  }
  function start() {
    cancel();
    if (disposed || !options.active()) return;
    const token = generation;
    timer = clock.timeout(() => { timer = null; void fire(token); }, 350);
  }
  function refreshHold() {
    cancel();
    if (disposed || !options.active()) return;
    holdUntil = clock.now() + 150;
    timer = clock.timeout(() => {
      timer = null;
      holdUntil = 0;
      if (!options.hovered()) start();
    }, 160);
  }
  return {
    start, cancel, refreshHold,
    dragStart() { nativeDrag = true; cancel(); },
    dragEnd() { nativeDrag = false; refreshHold(); },
    reset() { cancel(); nativeDrag = false; },
    dispose() { disposed = true; cancel(); },
  };
}
