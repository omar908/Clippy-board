import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPreviewTracking } from "./tracking";
import { deferred, previewFixture, settlePreview } from "./test-support";

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("preview geometry tracking", () => {
  it("coalesces bursts but does not drop the final move during an in-flight read", async () => {
    const f = previewFixture();
    const pending = deferred<void>();
    const update = vi.fn(async () => {});
    update.mockReturnValueOnce(pending.promise);
    const resized = vi.fn();
    const tracking = createPreviewTracking(f.ports, f.clock, update, resized);
    tracking.start();
    f.move.callback(); f.move.callback(); f.resize.callback();
    await settlePreview();
    expect(update).toHaveBeenCalledOnce();
    expect(resized).toHaveBeenCalledOnce();
    f.move.callback(); f.move.callback();
    await settlePreview();
    expect(update).toHaveBeenCalledOnce();
    pending.resolve();
    await settlePreview();
    expect(update).toHaveBeenCalledTimes(2);
    tracking.stop();
  });

  it("cancels queued frames and detaches listeners on stop", async () => {
    const f = previewFixture();
    const update = vi.fn(async () => {});
    const tracking = createPreviewTracking(f.ports, f.clock, update, vi.fn());
    tracking.start();
    tracking.request();
    tracking.stop();
    await settlePreview();
    expect(update).not.toHaveBeenCalled();
    expect(f.unmove).toHaveBeenCalledOnce();
    expect(f.unresize).toHaveBeenCalledOnce();
    f.move.callback();
    await settlePreview();
    expect(update).not.toHaveBeenCalled();
  });
});
