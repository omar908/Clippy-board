import { resolvePreviewPlacement } from "../placement";
import type { PreviewGeometry } from "./types";

export function resolveGeometryPlacement(geometry: PreviewGeometry, logicalWidth: number) {
  return resolvePreviewPlacement({
    main: geometry.main, workArea: geometry.workArea,
    previewWidth: Math.round(logicalWidth * geometry.scale),
    gap: Math.round(8 * geometry.scale),
  });
}
