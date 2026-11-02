import { describe, expect, it } from "vitest";
import { resolveGeometryPlacement } from "./geometry";

describe("physical/logical preview geometry", () => {
  it.each([1, 1.25, 1.5])("keeps a centered default window separate at scale %s on 2560×1600", scale => {
    const width = Math.round(460 * scale);
    const placement = resolveGeometryPlacement({
      main: { x: (2560 - width) / 2, y: 100, width, height: 580 * scale },
      workArea: { x: 0, y: 0, width: 2560, height: 1560 }, scale,
    }, 480);
    expect(placement.docked).toBe(false);
    expect(placement.width).toBe(Math.round(480 * scale));
  });

  it.each([460, 360])("reproduces the reported centered docking at 225%% with logical main width %s", logicalWidth => {
    const width = Math.round(logicalWidth * 2.25);
    const geometry = {
      main: { x: (2560 - width) / 2, y: 100, width, height: 1000 },
      workArea: { x: 0, y: 0, width: 2560, height: 1560 }, scale: 2.25,
    };
    expect(resolveGeometryPlacement(geometry, 480)).toMatchObject({ docked: true, width: 1080 });
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
