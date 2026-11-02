// Stable application-facing API; preview modules own their own lifetimes.
import { createNativePreviewPorts } from "./preview/native";
import { createDomPreviewView } from "./preview/dom";
import { createPreviewController } from "./preview/controller";
import { createPreviewViewer } from "./preview/viewer";
import { browserScheduler, type PreviewHost } from "./preview/types";

let preview: ReturnType<typeof createPreviewController> | null = null;

export function initPreview(host: PreviewHost): void {
  preview?.dispose();
  const ports = createNativePreviewPorts();
  const view = createDomPreviewView();
  preview = ports.label === "preview"
    ? createPreviewViewer(ports, view, browserScheduler)
    : createPreviewController(host, ports, view, browserScheduler);
}

export function previewSelectionChanged(): void { preview?.selectionChanged(); }
export function previewRefresh(): void { preview?.refresh(); }
export function previewDismiss(): void { preview?.dismiss(); }
export function previewHandleResize(): void { preview?.handleResize(); }
export function previewNativeDragStart(): void { preview?.dragStart(); }
export function previewNativeDragEnd(): void { preview?.dragEnd(); }
export function disposePreview(): void { preview?.dispose(); preview = null; }
