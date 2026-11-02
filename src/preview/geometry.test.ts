import { describe, expect, it } from "vitest";
import { resolveGeometryPlacement } from "./geometry";

describe("physical/logical preview geometry", () => {
  const displays = [1024, 1366, 1920, 2560, 3840].flatMap(width =>
    [1, 1.25, 1.5, 2, 2.25, 3].map(scale => ({ width, scale })));
  it.each(displays)("preserves size, bounds and separation at $width pixels, scale $scale", ({ width, scale }) => {
    for (const origin of [-3840, 0, 2560]) {
      for (const logicalWidth of [360, 460, 800]) {
        const mainWidth = Math.round(logicalWidth * scale);
        if (mainWidth > width) continue; // The main window itself must fit.
        for (const position of [0, 0.5, 1]) {
          const main = { x: origin + Math.floor((width - mainWidth) * position), y: 100, width: mainWidth, height: 580 * scale };
          const p = resolveGeometryPlacement({ main, scale, workArea: { x: origin, y: 0, width, height: 1600 } }, 480);
          expect(p.height).toBe(main.height);
          if (!p.docked) {
            expect(Number.isInteger(p.x)).toBe(true);
            expect(Number.isInteger(p.width)).toBe(true);
            expect(p.width).toBeGreaterThanOrEqual(Math.ceil(280 * scale));
            expect(p.width).toBeLessThanOrEqual(Math.round(480 * scale));
            expect(p.x).toBeGreaterThanOrEqual(origin);
            expect(p.x + p.width).toBeLessThanOrEqual(origin + width);
            const gap = Math.round(8 * scale);
            expect(p.x + p.width <= main.x - gap || p.x >= main.x + main.width + gap).toBe(true);
          } else if (p.compact) {
            expect(p.width).toBe(main.width);
            expect(main.width - Math.ceil(362 * scale)).toBeLessThan(Math.ceil(280 * scale));
          } else {
            expect(p.width).toBeGreaterThanOrEqual(Math.ceil(280 * scale));
            expect(main.width - p.width).toBeGreaterThanOrEqual(Math.ceil(362 * scale));
          }
        }
      }
    }
  });

  it.each([1, 1.25, 1.5])("keeps a centered default window separate at scale %s on 2560×1600", scale => {
    const width = Math.round(460 * scale);
    const placement = resolveGeometryPlacement({
      main: { x: (2560 - width) / 2, y: 100, width, height: 580 * scale },
      workArea: { x: 0, y: 0, width: 2560, height: 1560 }, scale,
    }, 480);
    expect(placement.docked).toBe(false);
    expect(placement.width).toBe(Math.round(480 * scale));
  });

  it.each([460, 360])("keeps a centered window separate at 225 percent with logical width %s", logicalWidth => {
    const width = Math.round(logicalWidth * 2.25);
    const geometry = {
      main: { x: (2560 - width) / 2, y: 100, width, height: 1000 },
      workArea: { x: 0, y: 0, width: 2560, height: 1560 }, scale: 2.25,
    };
    const placement = resolveGeometryPlacement(geometry, 480);
    expect(placement.docked).toBe(false);
    expect(placement.width).toBeGreaterThanOrEqual(630);
    expect(placement.width).toBeLessThan(1080);
    expect(placement.x + placement.width).toBeLessThanOrEqual(2560);
    expect(resolveGeometryPlacement({ ...geometry, main: { ...geometry.main, x: 0 } }, 480)).toMatchObject({ docked: false, x: width + 18 });
    expect(resolveGeometryPlacement({ ...geometry, main: { ...geometry.main, x: 2560 - width } }, 480)).toMatchObject({ docked: false, x: 2560 - width - 1080 - 18 });
  });

  it("does not scale physical monitor origins a second time", () => {
    expect(resolveGeometryPlacement({
      main: { x: -2000, y: 100, width: 600, height: 1000 },
      workArea: { x: -2560, y: 0, width: 2560, height: 1560 }, scale: 1.5,
    }, 480)).toMatchObject({ docked: false, x: -1388, width: 720 });
  });
});
