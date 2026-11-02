import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { AppCommands } from "../app/commands";
import type { Store } from "../state/store";
import type { AppElements } from "./elements";
import type { SelectionController } from "./selection";
import { getEl } from "./dom";
import { previewHandleResize, previewNativeDragStart, previewNativeDragEnd } from "../preview";

export function bindWindowControls(store: Store, elements: AppElements, selection: SelectionController, commands: AppCommands) {
  const { pauseBtn, pinBtn, clearBtn, closeBtn, settingsPage } = elements;
  const { releaseKeyboard, armHoverResizeGuard } = selection;
  let rendered: { isPaused: boolean; isPinned: boolean } | undefined;
  function renderState() {
    const { isPaused, isPinned } = store.get();
    if (rendered?.isPaused === isPaused && rendered.isPinned === isPinned) return;
    rendered = { isPaused, isPinned };
    pauseBtn.classList.toggle("active", isPaused);
    pauseBtn.innerHTML = isPaused ? "▶️" : "⏸️";
    pauseBtn.title = isPaused ? "Resume clipboard listening" : "Pause clipboard listening";
    document.body.classList.toggle("paused", isPaused);
    pinBtn.classList.toggle("active", isPinned);
    pinBtn.title = isPinned ? "Pinned: Window stays open on blur" : "Unpinned: Window hides on blur";
  }
  renderState();
  const unsubscribe = store.subscribe(renderState);
  pauseBtn.addEventListener("click", () => commands.execute("listening.toggle"));
  pinBtn.addEventListener("click", () => commands.execute("window.pin"));
  clearBtn.addEventListener("click", () => commands.execute("history.clear"));
  closeBtn.addEventListener("click", () => commands.execute("window.hide"));
  // Resize grip — borderless windows are hard to grab at the edges,
  // so provide an explicit grip in the bottom-right corner.
  const resizeGrip = getEl("resize-grip") as HTMLElement;
  resizeGrip.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    runNativeDrag(() => getCurrentWindow().startResizeDragging("SouthEast"));
  });
  // Native drag/resize enters a modal loop that reports a focus loss to the
  // window — tell the Rust side to suspend auto-hide until it finishes.
  // NOTE: the flag is set fire-and-forget and the drag op is started
  // synchronously — awaiting the invoke first delays the drag start past the
  // mousedown tick and Windows cancels it.
  function runNativeDrag(op: () => Promise<void>): void {
    previewNativeDragStart(); // keep the preview up — the loop takes the mouse from the webview
    invoke("set_interacting", { interacting: true }).catch(() => { });
    op().finally(() => {
      // Small delay: focus events can arrive just after the modal loop ends
      setTimeout(() => {
        invoke("set_interacting", { interacting: false }).catch(() => { });
        previewNativeDragEnd();
      }, 150);
    });
  }
  // Window dragging — data-tauri-drag-region doesn't fire for child elements
  // (spans, buttons), so explicitly start dragging from the header area.
  const headerEl = document.querySelector(".clippy-header") as HTMLElement;
  let lastClickTime = 0;
  headerEl.addEventListener("mousedown", (e) => {
    // Don't drag when interacting with the header action buttons
    if ((e.target as HTMLElement).closest("button"))
      return;
    if ((e.target as HTMLElement).closest(".header-actions"))
      return;
    const now = Date.now();
    if (now - lastClickTime < 300) {
      lastClickTime = 0;
      return;
    }
    lastClickTime = now;
    e.preventDefault();
    runNativeDrag(() => getCurrentWindow().startDragging());
  });
  // Double-click the header toggles maximize/restore
  headerEl.addEventListener("dblclick", async (e) => {
    const target = e.target as HTMLElement;
    if (target.closest("button") || target.closest(".icon-btn"))
      return;
    if (target.closest(".header-actions"))
      return;
    e.preventDefault();
    e.stopPropagation();
    const win = getCurrentWindow();
    try {
      await win.toggleMaximize();
    }
    catch (err) {
      console.error("Failed to toggle maximize:", err);
    }
  });
  // Window focus event
  window.addEventListener("focus", () => {
    // Don't steal focus to search if settings page is open
    if (settingsPage && settingsPage.style.display !== "none") {
      return;
    }
    // Don't steal focus if user is interacting with settings
    const activeEl = document.activeElement as HTMLElement | null;
    if (activeEl && activeEl.classList.contains("settings-input")) {
      return;
    }
    // Don't auto-focus search on window focus
  });
  // Leaving the window (focus loss) also ends the keyboard takeover.
  window.addEventListener("blur", () => releaseKeyboard());
  // Keep the preview geometry consistent across maximize/unmaximize and user
  // resizes. This is separate from the preview module's own tracking: it also
  // holds the grace close open during the OS sizing loop.
  getCurrentWindow()
    .onResized(() => {
      // Every resize is user/OS driven now: the preview no longer resizes the
      // main window (it is a separate window, or docks inside it). So always arm
      // the guard against layout-induced hover.
      armHoverResizeGuard();
      previewHandleResize();
    })
    .catch(() => { });
  return unsubscribe;
}
