import { installSignedUpdate, lookupUpdate } from "../api/updates";

export type Release = NonNullable<Awaited<ReturnType<typeof lookupUpdate>>>;
export type UpdateStatus =
  | { phase: "checking" | "current" | "error" }
  | { phase: "available" | "installing" | "install-error"; release: Release };

const STARTUP_DELAY_MS = 30_000;
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function createUpdateChecker(render: (status: UpdateStatus) => void, lookup = lookupUpdate, installUpdate = installSignedUpdate) {
  let automatic = false;
  let checking = false;
  let installing = false;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function schedule(delay: number) {
    clearTimeout(timer);
    if (automatic && !disposed && !installing) timer = setTimeout(() => { void check(); }, delay);
  }

  async function check() {
    if (checking || installing || disposed) return;
    clearTimeout(timer);
    checking = true;
    render({ phase: "checking" });
    try {
      const release = await lookup();
      if (!disposed) render(release ? { phase: "available", release } : { phase: "current" });
    } catch {
      if (!disposed) render({ phase: "error" });
    } finally {
      checking = false;
      schedule(CHECK_INTERVAL_MS);
    }
  }

  return {
    check,
    async install(release: Release) {
      if (checking || installing || disposed || !release.installable) return;
      clearTimeout(timer);
      installing = true;
      render({ phase: "installing", release });
      try {
        await installUpdate(release.version);
      } catch {
        installing = false;
        if (!disposed) render({ phase: "install-error", release });
        schedule(CHECK_INTERVAL_MS);
      }
    },
    setAutomatic(enabled: boolean) {
      if (enabled === automatic || disposed) return;
      automatic = enabled;
      schedule(STARTUP_DELAY_MS);
    },
    dispose() {
      disposed = true;
      clearTimeout(timer);
    },
  };
}
