import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPreviewViewer } from "./viewer";
import { deferred, previewFixture, settlePreview, textItem } from "./test-support";

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("separate preview webview", () => {
  it("waits for the content listener before announcing readiness", async () => {
    const f = previewFixture();
    const registered = deferred<() => void>();
    f.ports.listen.mockReturnValueOnce(registered.promise);
    const viewer = createPreviewViewer(f.ports, f.view, f.clock);
    expect(f.ports.emit).not.toHaveBeenCalled();
    registered.resolve(f.unlisten);
    await settlePreview();
    expect(f.ports.emit).toHaveBeenCalledWith("main", "preview-ready", {});
    viewer.dispose();
  });

  it("renders validated content and asks main to close instead of hiding itself", async () => {
    const f = previewFixture();
    const viewer = createPreviewViewer(f.ports, f.view, f.clock);
    f.events.get("preview-content")!(textItem("preview"));
    expect(f.view.render).toHaveBeenCalledWith(textItem("preview"));
    f.domEvents.get("panel.mouseenter")!();
    expect(f.ports.setInteractive).toHaveBeenCalledWith(true);
    expect(f.ports.emit).toHaveBeenCalledWith("main", "preview-cancel-close", {});
    f.domEvents.get("panel.mouseleave")!();
    expect(f.ports.setInteractive).toHaveBeenCalledWith(false);
    await vi.advanceTimersByTimeAsync(350);
    expect(f.ports.emit).toHaveBeenCalledWith("main", "preview-request-close", {});
    expect(f.ports.hide).not.toHaveBeenCalled();
    viewer.dispose();
  });

  it("ignores malformed content and cancels pending close requests when main hides it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const f = previewFixture();
    const viewer = createPreviewViewer(f.ports, f.view, f.clock);
    f.events.get("preview-content")!(textItem("valid"));
    f.events.get("preview-content")!({ type: "file", paths: [false] });
    expect(f.view.render).toHaveBeenCalledTimes(1);
    f.domEvents.get("panel.mouseleave")!();
    f.events.get("preview-hidden")!({});
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.ports.emit).not.toHaveBeenCalledWith("main", "preview-request-close", {});
    expect(f.view.clear).toHaveBeenCalled();
    viewer.dispose();
    expect(f.domEvents.size).toBe(0);
  });
});
