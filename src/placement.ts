// Placement rules for the separate preview window.
//
// Pure geometry: no DOM, no Tauri calls. Keeping it here lets the rules be
// unit-tested directly (see placement.test.ts) instead of only through the UI.

/** Rectangle in physical pixels, matching Tauri's window/monitor geometry. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A resolved presentation for the preview: either a separate window rectangle
 *  (physical px), or "docked" — render the panel inside the main window. */
export interface Placement {
  docked: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PlacementInput {
  /** Outer rect of the main window. */
  main: Rect;
  /** Monitor work area, or `null` when no monitor information is available. */
  workArea: Rect | null;
  /** Width of the preview window. */
  previewWidth: number;
  /** Gap between the main and preview windows. */
  gap: number;
}

/** Resolve where the preview should go for the main window's current geometry.
 *
 *  Preference order: right of the window, then left of it, then docked inside
 *  it. "Fits" means the whole preview would land inside the monitor's work
 *  area — a clamped position that overlaps the main window is not a fit, since
 *  the preview would cover the list it is previewing. The preview always
 *  matches the main window's vertical position and height. */
export function resolvePreviewPlacement({
  main,
  workArea,
  previewWidth,
  gap,
}: PlacementInput): Placement {
  const rightX = main.x + main.width + gap;
  const leftX = main.x - previewWidth - gap;
  const aligned = { y: main.y, width: previewWidth, height: main.height };

  // No monitor information: assume there is room on the right.
  if (!workArea) {
    return { docked: false, x: rightX, ...aligned };
  }

  const workAreaRight = workArea.x + workArea.width;

  if (rightX + previewWidth <= workAreaRight) {
    return { docked: false, x: rightX, ...aligned };
  }

  if (leftX >= workArea.x) {
    return { docked: false, x: leftX, ...aligned };
  }

  // Neither side fits: the window is (near) as wide as the work area. Dock the
  // panel inside the main window instead of covering the list.
  return { docked: true, x: 0, y: 0, width: previewWidth, height: main.height };
}
