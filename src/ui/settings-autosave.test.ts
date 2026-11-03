import { describe, it, expect, vi } from "vitest";
import { SettingsAutosave } from "./settings-autosave";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const initial = { width: 100, compact: false, startup: false };

describe("settings autosave coordination", () => {
  it("serializes changes from confirmed state and keeps a newer edit while a request is in flight", async () => {
    const first = deferred<typeof initial>();
    const save = vi.fn(async (settings: typeof initial) => settings).mockImplementationOnce(() => first.promise);
    const queue = new SettingsAutosave(initial, { save, changed: vi.fn(), saved: vi.fn() });
    queue.edit("width", saved => ({ ...saved, width: 200 }));
    await Promise.resolve();
    queue.edit("width", saved => ({ ...saved, width: 300 }));
    queue.edit("compact", saved => ({ ...saved, compact: true }));
    expect(queue.busy).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    first.resolve({ ...initial, width: 200 });
    await queue.flush();
    expect(save.mock.calls.map(([settings]) => settings)).toEqual([
      { ...initial, width: 200 }, { ...initial, width: 300 }, { ...initial, width: 300, compact: true },
    ]);
    expect(queue.confirmed).toEqual({ ...initial, width: 300, compact: true });
    expect(queue.unresolved).toBe(false);
  });

  it("saves a reversal made before the original request completes", async () => {
    const first = deferred<typeof initial>();
    const save = vi.fn(async (settings: typeof initial) => settings).mockImplementationOnce(() => first.promise);
    const queue = new SettingsAutosave(initial, { save, changed: vi.fn(), saved: vi.fn() });
    queue.edit("compact", saved => ({ ...saved, compact: true }));
    await Promise.resolve();
    queue.edit("compact", saved => ({ ...saved, compact: false }));
    first.resolve({ ...initial, compact: true });
    await queue.flush();
    expect(queue.confirmed.compact).toBe(false);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("keeps unfinished and invalid fields out of unrelated saves and supports retry", async () => {
    const save = vi.fn(async (settings: typeof initial) => settings);
    const queue = new SettingsAutosave(initial, { save, changed: vi.fn(), saved: vi.fn() });
    queue.edit("width", () => { throw new Error("Enter a whole number"); }, false);
    queue.edit("compact", saved => ({ ...saved, compact: true }));
    await queue.flush();
    expect(save).toHaveBeenCalledExactlyOnceWith({ ...initial, compact: true }, "compact");
    queue.edit("width", () => { throw new Error("Enter a whole number"); });
    await queue.flush();
    expect(queue.state("width")?.phase).toBe("error");
    expect(queue.unresolved).toBe(true);
    queue.edit("width", saved => ({ ...saved, width: 250 }));
    await queue.flush();
    expect(queue.confirmed).toEqual({ ...initial, compact: true, width: 250 });
    expect(queue.unresolved).toBe(false);
  });

  it("retains confirmed values on a native string error and retries without losing later successful changes", async () => {
    const save = vi.fn(async (settings: typeof initial) => settings).mockRejectedValueOnce("Disk is full");
    const queue = new SettingsAutosave(initial, { save, changed: vi.fn(), saved: vi.fn() });
    queue.edit("width", saved => ({ ...saved, width: 200 }));
    await queue.flush();
    expect(queue.confirmed.width).toBe(100);
    expect(queue.state("width")?.message).toBe("Disk is full");
    queue.edit("compact", saved => ({ ...saved, compact: true }));
    await queue.flush();
    queue.retry("width");
    await queue.flush();
    expect(queue.confirmed).toEqual({ ...initial, width: 200, compact: true });
  });

  it("does not report an older failure against a newer draft and never discards an active write", async () => {
    const first = deferred<typeof initial>();
    const save = vi.fn(async (settings: typeof initial) => settings).mockImplementationOnce(() => first.promise);
    const queue = new SettingsAutosave(initial, { save, changed: vi.fn(), saved: vi.fn() });
    queue.edit("width", saved => ({ ...saved, width: 200 }));
    await Promise.resolve();
    queue.edit("width", saved => ({ ...saved, width: 300 }));
    queue.discard();
    first.reject("offline");
    await queue.flush();
    expect(queue.confirmed.width).toBe(300);
    expect(queue.state("width")?.phase).toBe("saved");
  });
});
