import type { PreviewView, Dispose } from "./types";
import { renderPreviewContent } from "./render";

export function createDomPreviewView(): PreviewView {
  const header = document.getElementById("preview-header")!;
  const body = document.getElementById("preview-body")!;
  const panel = document.getElementById("preview-panel");
  const surface = document.querySelector<HTMLElement>(".clippy-popup");
  const back = document.getElementById("preview-back");
  let disposeContent: Dispose = () => {};
  function on(element: HTMLElement | null, name: string, callback: () => void): Dispose {
    element?.addEventListener(name, callback);
    return () => element?.removeEventListener(name, callback);
  }
  return {
    width() {
      const width = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--preview-width"));
      return Number.isFinite(width) && width > 0 ? width : 480;
    },
    render(item) {
      disposeContent();
      disposeContent = renderPreviewContent(header, body, item);
    },
    clear() { disposeContent(); disposeContent = () => {}; body.replaceChildren(); },
    setDocked(docked) {
      if (docked) panel?.classList.add("open");
      else panel?.classList.remove("open");
      panel?.setAttribute("aria-hidden", String(!docked));
      if (!docked) {
        surface?.classList.remove("preview-compact");
        panel?.style.removeProperty("--resolved-preview-width");
      }
    },
    setLayout({ width, compact }) {
      panel?.style.setProperty("--resolved-preview-width", `${width}px`);
      if (compact) surface?.classList.add("preview-compact");
      else surface?.classList.remove("preview-compact");
    },
    onBack: callback => on(back, "click", callback),
    setPreviewWindow() {
      document.body.classList.add("preview-window");
      panel?.setAttribute("aria-hidden", "false");
    },
    hovered: () => Boolean(surface?.matches(":hover")),
    onSurface: (name, callback) => on(surface, name, callback),
    onPanel: (name, callback) => on(panel, name, callback),
  };
}
