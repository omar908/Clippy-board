import { describe, expect, it, vi } from "vitest";
import { Store } from "../state/store";
import { createCurrentClipboardController } from "./current-clipboard";

function setup(snapshot = vi.fn<() => Promise<unknown>>(async () => null)) {
  const store = new Store();
  let notify: (id: unknown) => void = () => {};
  const cleanup = vi.fn();
  const render = vi.fn();
  const controller = createCurrentClipboardController(store, {} as HTMLElement, {
    snapshot,
    subscribe: async callback => { notify = callback; return cleanup; },
  }, render);
  return { store, controller, render, cleanup, notify: (id: unknown) => notify(id) };
}

describe("current clipboard identity", () => {
  it("loads a startup match, follows external changes while paused, and clears unknown contents", async () => {
    const app = setup(vi.fn(async () => "first"));
    app.store.set({ isPaused: true, selectedIndex: 4 });
    await app.controller.start();
    expect(app.store.get().currentClipboardId).toBe("first");
    app.notify("second");
    expect(app.store.get().currentClipboardId).toBe("second");
    expect(app.store.get().selectedIndex).toBe(4);
    app.notify(null);
    expect(app.store.get().currentClipboardId).toBeNull();
    app.notify({ id: "malformed" });
    expect(app.store.get().currentClipboardId).toBeNull();
  });

  it("does not let a slow startup snapshot overwrite a newer clipboard notification", async () => {
    let resolve!: (id: unknown) => void;
    const app = setup(vi.fn(() => new Promise(value => { resolve = value; })));
    const ready = app.controller.start();
    await Promise.resolve();
    app.notify("newer");
    resolve("older");
    await ready;
    expect(app.store.get().currentClipboardId).toBe("newer");
  });

  it("cleans up and ignores notifications and late snapshots after disposal", async () => {
    let resolve!: (id: unknown) => void;
    const app = setup(vi.fn(() => new Promise(value => { resolve = value; })));
    const ready = app.controller.start();
    await Promise.resolve();
    app.controller.dispose();
    app.notify("late");
    resolve("older");
    await ready;
    expect(app.cleanup).toHaveBeenCalledOnce();
    expect(app.render).not.toHaveBeenCalled();
  });
});
