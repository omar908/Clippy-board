import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPreviewGrace } from "./grace";
import { deferred, previewFixture } from "./test-support";

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function setup() {
  const f = previewFixture();
  const close = vi.fn();
  const active = vi.fn(() => true);
  const grace = createPreviewGrace({ scheduler: f.clock, active, hovered: f.view.hovered, pointerHeld: f.ports.pointerHeld, close });
  return { ...f, grace, close, active };
}
describe("preview grace timing", () => {
  it("invalidates an outstanding pointer query when the pointer re-enters", async () => {
    const f = setup();
    const held = deferred<boolean>();
    f.ports.pointerHeld.mockReturnValueOnce(held.promise);
    f.grace.start();
    await vi.advanceTimersByTimeAsync(350);
    f.grace.cancel();
    held.resolve(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.close).not.toHaveBeenCalled();
  });

  it("holds through native drag and rearms only after the quiet period", async () => {
    const f = setup();
    f.view.hovered.mockReturnValue(false);
    f.grace.dragStart(); f.grace.start();
    await vi.advanceTimersByTimeAsync(500);
    expect(f.close).not.toHaveBeenCalled();
    f.grace.dragEnd();
    await vi.advanceTimersByTimeAsync(509);
    expect(f.close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(f.close).toHaveBeenCalledOnce();
  });

  it("does not rearm after disposal or for an inactive session", async () => {
    const f = setup();
    f.view.hovered.mockReturnValue(false);
    f.grace.refreshHold();
    f.grace.dispose();
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.close).not.toHaveBeenCalled();
    f.grace.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.close).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
