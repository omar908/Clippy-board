import { getCurrentWindow, currentMonitor } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import type { PreviewPorts } from "./types";

/** Tauri uses physical pixels; logical preview dimensions are scaled elsewhere. */
export function createNativePreviewPorts(): PreviewPorts {
  const win = getCurrentWindow();
  return {
    label: win.label,
    async geometry() {
      const [scale, position, size, monitor] = await Promise.all([
        win.scaleFactor(), win.outerPosition(), win.outerSize(), currentMonitor(),
      ]);
      return {
        scale,
        main: { x: position.x, y: position.y, width: size.width, height: size.height },
        workArea: monitor ? {
          x: monitor.workArea.position.x, y: monitor.workArea.position.y,
          width: monitor.workArea.size.width, height: monitor.workArea.size.height,
        } : null,
      };
    },
    show: (p, item) => invoke("preview_show", { x: p.x, y: p.y, width: p.width, height: p.height, item }),
    hide: () => invoke("preview_hide"),
    async move(p) {
      await invoke("preview_position", { x: p.x, y: p.y });
      await invoke("preview_set_size", { width: p.width, height: p.height });
    },
    update: item => invoke("preview_update", { item }),
    pointerHeld: () => invoke<boolean>("is_pointer_held").catch(() => false),
    setInteractive: interactive => invoke("preview_set_interactive", { interactive }),
    onMoved: callback => win.onMoved(callback),
    onResized: callback => win.onResized(callback),
    listen: (name, callback) => listen(name, event => callback(event.payload)),
    emit: (target, name, payload) => emitTo(target, name, payload),
  };
}
