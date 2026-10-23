import { describe, expect, it } from "vitest";
import { resolvePreviewPlacement } from "./placement";
import type { PlacementInput } from "./placement";

const WORK_AREA = { x: 0, y: 0, width: 1920, height: 1080 };
const PREVIEW_WIDTH = 480;
const GAP = 8;

/** Main window defaults to one with room on the right. */
function place(overrides: Partial<PlacementInput> = {}) {
  return resolvePreviewPlacement({
    main: { x: 100, y: 100, width: 800, height: 600 },
    workArea: WORK_AREA,
    previewWidth: PREVIEW_WIDTH,
    gap: GAP,
    ...overrides,
  });
}

describe("resolvePreviewPlacement", () => {
  it("places the preview to the right when it fits", () => {
    expect(place()).toEqual({ docked: false, x: 908, y: 100, width: 480, height: 600 });
  });

  it("includes the gap in the horizontal offset", () => {
    expect(place({ gap: 24 })).toMatchObject({ x: 100 + 800 + 24 });
  });

  it("flips to the left when the right side would overflow", () => {
    const p = place({ main: { x: 1000, y: 100, width: 800, height: 600 } });
    expect(p).toEqual({ docked: false, x: 512, y: 100, width: 480, height: 600 });
  });

  it("treats an exact right-edge fit as fitting", () => {
    // rightX = 100 + 1332 + 8 = 1440; 1440 + 480 = 1920, the work area edge.
    const p = place({ main: { x: 100, y: 50, width: 1332, height: 700 } });
    expect(p).toMatchObject({ docked: false, x: 1440 });
  });

  it("treats an exact left-edge fit as fitting", () => {
    // right side overflows; leftX = 488 - 480 - 8 = 0, the work area edge.
    const p = place({ main: { x: 488, y: 50, width: 1000, height: 700 } });
    expect(p).toMatchObject({ docked: false, x: 0 });
  });

  it("docks when neither side has room (maximized window)", () => {
    const p = place({ main: { x: 0, y: 0, width: 1920, height: 1080 } });
    expect(p.docked).toBe(true);
    expect(p.width).toBe(PREVIEW_WIDTH);
    expect(p.height).toBe(1080);
  });

  it("docks when the window is wider than the work area", () => {
    const p = place({ main: { x: -100, y: 0, width: 2200, height: 900 } });
    expect(p.docked).toBe(true);
  });

  it("falls back to the right side when monitor information is missing", () => {
    expect(place({ workArea: null })).toEqual({
      docked: false,
      x: 908,
      y: 100,
      width: 480,
      height: 600,
    });
  });

  it("mirrors the main window's vertical position and height", () => {
    const mains = [
      { x: 100, y: 100, width: 800, height: 600 },
      { x: 1000, y: 40, width: 800, height: 900 }, // flips to the left
      { x: 100, y: 300, width: 800, height: 500 },
    ];
    for (const main of mains) {
      expect(place({ main })).toMatchObject({ y: main.y, height: main.height });
    }
  });

  it("only constrains horizontal placement", () => {
    // The preview tracks the main window even if the main window extends past
    // the bottom of the work area; docking is a horizontal-space decision.
    const p = place({ main: { x: 100, y: 900, width: 800, height: 400 } });
    expect(p).toMatchObject({ docked: false, y: 900, height: 400 });
  });

  it("uses absolute coordinates on a monitor left of the primary", () => {
    // Right of the window would extend past x=0 (the primary's left edge), so
    // the preview flips left: -1000 - 480 - 8 = -1488.
    const p = place({
      main: { x: -1000, y: 100, width: 800, height: 600 },
      workArea: { x: -1920, y: 0, width: 1920, height: 1080 },
    });
    expect(p).toMatchObject({ docked: false, x: -1488 });
  });

  it("docks on a monitor that has no room on either side", () => {
    const workArea = { x: -1920, y: 0, width: 1920, height: 1080 };
    const p = place({
      main: { x: -1920, y: 0, width: 1920, height: 1080 },
      workArea,
    });
    expect(p.docked).toBe(true);
  });
});
