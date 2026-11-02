import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Store } from "../state/store";
import { renderClipboardStatus } from "../ui/render/clipboard-status";

const defaultPorts = {
  snapshot: () => invoke<unknown>("get_current_clipboard_item_id"),
  subscribe: (callback: (id: unknown) => void) => listen<unknown>("current-clipboard-changed", event => callback(event.payload)),
};

export function createCurrentClipboardController(store: Store, root: HTMLElement, ports = defaultPorts,
  render = renderClipboardStatus) {
  let disposed = false;
  let revision = 0;
  let unlisten: (() => void) | undefined;
  function apply(value: unknown) {
    // Unknown/invalid identity is never presented as a confirmed match.
    const id = typeof value === "string" ? value : null;
    store.set({ currentClipboardId: id });
    render(root, id);
  }
  return {
    async start() {
      const cleanup = await ports.subscribe(id => {
        if (disposed) return;
        revision++;
        apply(id);
      });
      if (disposed) { cleanup(); return; }
      unlisten = cleanup;
      const request = revision;
      const id = await ports.snapshot();
      if (!disposed && request === revision) apply(id);
    },
    dispose() { disposed = true; unlisten?.(); },
  };
}
