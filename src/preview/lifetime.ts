import type { Dispose } from "./types";

/** Own both synchronous and asynchronously registered listeners. */
export function createLifetime() {
  let disposed = false;
  const cleanups = new Set<Dispose>();
  function own(cleanup: Dispose) {
    if (disposed) cleanup();
    else cleanups.add(cleanup);
  }
  return {
    own,
    listen(pending: Promise<Dispose>) { void pending.then(own).catch(() => {}); },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const cleanup of cleanups) cleanup();
      cleanups.clear();
    },
  };
}
