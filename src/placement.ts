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
  /** In-app preview replaces the list when two usable columns cannot fit. */
  compact?: true;
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
  /** Minimum readable preview width, in the same physical units. */
  minimumPreviewWidth: number;
  /** Space to retain for the list (including the app border) when docking. */
  minimumListWidth: number;
  /** Gap between the main and preview windows. */
  gap: number;
}

/** Resolve where the preview should go for the main window's current geometry.
 *
 *  Prefer the full width on the right, then left. Otherwise shrink to the
 *  larger side if it meets the minimum, then dock or use a compact in-app view.
 *  Separate previews never overlap the main window and remain horizontally
 *  inside the work area. Vertical position and height follow the main window. */
export function resolvePreviewPlacement({
  main,
  workArea,
  previewWidth,
  minimumPreviewWidth,
  minimumListWidth,
  gap,
}: PlacementInput): Placement {
  const rightX = Math.ceil(main.x + main.width + gap);
  const leftEdge = Math.floor(main.x - gap);
  const aligned = { y: main.y, width: previewWidth, height: main.height };

  // No monitor information: assume there is room on the right.
  if (!workArea) {
    return { docked: false, x: rightX, ...aligned };
  }

  const workAreaRight = workArea.x + workArea.width;
  const rightStart = Math.max(rightX, Math.ceil(workArea.x));
  const leftEnd = Math.min(leftEdge, Math.floor(workAreaRight));
  const rightSpace = Math.max(0, Math.floor(workAreaRight - rightStart));
  const leftSpace = Math.max(0, Math.floor(leftEnd - workArea.x));
  if (rightSpace >= previewWidth) return { docked: false, x: rightStart, ...aligned };
  if (leftSpace >= previewWidth) return { docked: false, x: leftEnd - previewWidth, ...aligned };

  const width = Math.min(previewWidth, Math.max(leftSpace, rightSpace));
  if (width >= minimumPreviewWidth) {
    return { docked: false, x: rightSpace >= leftSpace ? rightStart : leftEnd - width, ...aligned, width };
  }
  const dockedWidth = Math.min(previewWidth, Math.floor(main.width - minimumListWidth));
  if (dockedWidth >= minimumPreviewWidth) {
    return { docked: true, x: 0, y: 0, width: dockedWidth, height: main.height };
  }
  return { docked: true, compact: true, x: 0, y: 0, width: main.width, height: main.height };
}
