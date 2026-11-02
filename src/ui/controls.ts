import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Store } from "../state/store";
import type { AppElements } from "./elements";
import type { SelectionController } from "./selection";
import { getEl } from "./dom";
import { previewDismiss, previewHandleResize, previewNativeDragStart, previewNativeDragEnd } from "../preview";

export function bindWindowControls(store: Store, elements: AppElements, selection: SelectionController, clearView: () => void) {
  const { pauseBtn, pinBtn, clearBtn, closeBtn, settingsPage } = elements;
  const { releaseKeyboard, armHoverResizeGuard } = selection;
  // Header action buttons
  pauseBtn.addEventListener("click", async () => {
    store.set({ isPaused: !store.get().isPaused });
    await invoke("set_listening_paused", { paused: store.get().isPaused });
    if (store.get().isPaused) {
      pauseBtn.classList.add("active");
      pauseBtn.innerHTML = "▶️";
      pauseBtn.title = "Resume clipboard listening";
      document.body.classList.add("paused");
    }
    else {
      pauseBtn.classList.remove("active");
      pauseBtn.innerHTML = "⏸️";
      pauseBtn.title = "Pause clipboard listening";
      document.body.classList.remove("paused");
    }
  });
  pinBtn.addEventListener("click", async () => {
    store.set({ isPinned: !store.get().isPinned });
    await invoke("set_pinned", { pinned: store.get().isPinned });
    pinBtn.classList.toggle("active", store.get().isPinned);
    pinBtn.title = store.get().isPinned ? "Pinned: Window stays open on blur" : "Unpinned: Window hides on blur";
  });
  clearBtn.addEventListener("click", () => {
    clearView();
  });
  closeBtn.addEventListener("click", () => {
    invoke("hide_window").then(() => previewDismiss()).catch(() => { });
  });
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
      if (typeof (win as any).toggleMaximize === "function") {
        await (win as any).toggleMaximize();
        return;
      }
      const isMax = await win.isMaximized();
      if (isMax) {
        await win.unmaximize();
      }
      else {
        await win.maximize();
      }
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

}
