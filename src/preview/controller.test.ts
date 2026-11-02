import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPreviewController } from "./controller";
import { deferred, previewFixture, settlePreview, textItem } from "./test-support";

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function setup() {
  const fixture = previewFixture();
  const controller = createPreviewController(fixture.host, fixture.ports, fixture.view, fixture.clock);
  return { ...fixture, controller };
}

describe("main preview controller", () => {
  it("uses the latest selection when opening geometry finishes", async () => {
    const f = setup();
    const geometry = deferred<typeof f.geometry>();
    f.ports.geometry.mockReturnValueOnce(geometry.promise);
    f.controller.selectionChanged();
    await settlePreview();
    f.host.getSelected.mockReturnValue(textItem("latest"));
    f.controller.selectionChanged();
    geometry.resolve(f.geometry);
    await settlePreview();
    expect(f.ports.show).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ docked: false }), textItem("latest"));
    f.controller.dispose();
  });

  it("serializes a late show, dismissal, and a fresh session", async () => {
    const f = setup();
    const showing = deferred<void>();
    f.ports.show.mockReturnValueOnce(showing.promise);
    f.controller.selectionChanged();
    await settlePreview();
    f.controller.dismiss();
    f.host.getSelected.mockReturnValue(textItem("new-session"));
    f.controller.selectionChanged();
    await settlePreview();
    expect(f.ports.show).toHaveBeenCalledTimes(1);
    showing.resolve();
    await settlePreview();
    expect(f.ports.hide).toHaveBeenCalledOnce();
    expect(f.ports.show).toHaveBeenCalledTimes(2);
    expect(f.ports.show).toHaveBeenLastCalledWith(expect.anything(), textItem("new-session"));
    expect(f.ports.hide.mock.invocationCallOrder[0]).toBeLessThan(f.ports.show.mock.invocationCallOrder[1]);
    f.controller.dispose();
  });

  it("does not dock after dismissal while the hide transition is pending", async () => {
    const f = setup();
    f.geometry.main = { x: 0, y: 0, width: 2560, height: 1560 };
    const hiding = deferred<void>();
    f.ports.hide.mockReturnValueOnce(hiding.promise);
    f.controller.selectionChanged();
    await settlePreview();
    f.controller.dismiss();
    hiding.resolve();
    await settlePreview();
    expect(f.view.setDocked).not.toHaveBeenCalledWith(true);
    expect(f.view.render).not.toHaveBeenCalled();
  });

  it("detaches subscriptions that finish registering after the preview closes", async () => {
    const f = setup();
    const moved = deferred<() => void>(), resized = deferred<() => void>();
    f.ports.onMoved.mockReturnValueOnce(moved.promise);
    f.ports.onResized.mockReturnValueOnce(resized.promise);
    f.controller.selectionChanged();
    f.controller.dismiss();
    moved.resolve(f.unmove); resized.resolve(f.unresize);
    await settlePreview();
    expect(f.unmove).toHaveBeenCalledOnce();
    expect(f.unresize).toHaveBeenCalledOnce();
    expect(f.ports.show).not.toHaveBeenCalled();
    f.controller.dispose();
    expect(f.unlisten).toHaveBeenCalledTimes(4);
    expect(f.domEvents.size).toBe(0);
  });

  it("catches native failure and allows a later selection to retry", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const f = setup();
    f.ports.show.mockRejectedValueOnce(new Error("window unavailable"));
    f.controller.selectionChanged();
    await settlePreview();
    f.controller.selectionChanged();
    await settlePreview();
    expect(f.ports.show).toHaveBeenCalledTimes(2);
    f.controller.dispose();
  });

  it("dismisses when the selected item disappears", async () => {
    const f = setup();
    f.controller.selectionChanged();
    await settlePreview();
    f.host.getSelected.mockReturnValue(null);
    f.controller.refresh();
    await settlePreview();
    expect(f.ports.hide).toHaveBeenCalledOnce();
    expect(f.view.clear).toHaveBeenCalled();
    f.controller.dispose();
  });
});
