import { resolvePreviewPlacement } from "../placement";
import type { PreviewGeometry } from "./types";

const MINIMUM_PREVIEW_WIDTH = 280;
// Retain the native main window's 360px minimum plus the app's 2px border.
const MINIMUM_LIST_WIDTH = 362;

export function resolveGeometryPlacement(geometry: PreviewGeometry, logicalWidth: number) {
  return resolvePreviewPlacement({
    main: geometry.main, workArea: geometry.workArea,
    previewWidth: Math.round(logicalWidth * geometry.scale),
    minimumPreviewWidth: Math.ceil(Math.min(logicalWidth, MINIMUM_PREVIEW_WIDTH) * geometry.scale),
    minimumListWidth: Math.ceil(MINIMUM_LIST_WIDTH * geometry.scale),
    gap: Math.round(8 * geometry.scale),
  });
}
