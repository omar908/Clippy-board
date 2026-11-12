import { checkLatestRelease } from "../api/updates";

type Release = NonNullable<Awaited<ReturnType<typeof checkLatestRelease>>>;
export type UpdateStatus =
  | { phase: "checking" | "current" | "error" }
  | { phase: "available"; release: Release };

const STARTUP_DELAY_MS = 30_000;
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function createUpdateChecker(render: (status: UpdateStatus) => void, lookup = checkLatestRelease) {
  let automatic = false;
  let checking = false;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function schedule(delay: number) {
    clearTimeout(timer);
    if (automatic && !disposed) timer = setTimeout(() => { void check(); }, delay);
  }

  async function check() {
    if (checking || disposed) return;
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
