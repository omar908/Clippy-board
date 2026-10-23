// Full-content preview — separate window.
//
// Shows the complete text / image / file list for the currently selected
// item in a dedicated window that positions itself beside the main window.
// The main window never resizes; the preview window appears/disappears.

import { getCurrentWindow, currentMonitor } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { listen, emitTo } from "@tauri-apps/api/event";
import type { ClipboardItem } from "./types";
import { resolvePreviewPlacement } from "./placement";
import type { Placement } from "./placement";

/** Logical width of the preview column. Read from the stylesheet token so the
 *  docked panel (styles.css) and the separate window (here) share one value. */
let cachedPreviewWidth: number | null = null;
function previewColumnWidth(): number {
  if (cachedPreviewWidth === null) {
    const raw = getComputedStyle(document.documentElement).getPropertyValue("--preview-width");
    const parsed = Number.parseFloat(raw);
    cachedPreviewWidth = Number.isFinite(parsed) ? parsed : 480;
  }
  return cachedPreviewWidth;
}

const PREVIEW_GAP = 8;         // logical px — gap between main and preview
const GRACE_MS = 350;          // close shortly after the cursor leaves the window
const HOLD_QUIET_MS = 150;     // grace stays held this long after the last drag/resize event
const RELEASE_POLL_MS = 150;   // re-check the mouse button this often while it is held
const RELEASE_MAX_MS = 30_000; // safety cap: a stuck check can't hold the panel forever
const TEXT_CHAR_CAP = 100_000; // render at most this much text (full fidelity beyond is noise anyway)

interface PreviewHost {
  /** Currently selected item (the single state hover + arrows move). */
  getSelected: () => ClipboardItem | null;
}

let host: PreviewHost | null = null;
let headerEl: HTMLElement;
let bodyEl: HTMLElement;
let panelEl: HTMLElement | null = null;

/** How the preview is presented. "window" is the separate always-on-top
 *  window used whenever there is room beside the main window; "docked" is the
 *  in-window panel, used when the main window leaves no room on either side
 *  (maximized, or resized wider than the work area allows). "none" means
 *  nothing is showing. */
type PreviewMode = "none" | "window" | "docked";

let open = false;
let mode: PreviewMode = "none";
let renderedId: string | null = null;
let graceTimer: number | null = null;
let holdUntil = 0;            // epoch ms — no grace dismissal before this (resize stream)
let holdCheckTimer: number | null = null;
let nativeDragActive = false; // JS-initiated native drag/resize loop in progress
let mainMoveHandler: (() => void) | null = null;
let mainResizeHandler: (() => void) | null = null;
let isPreviewWindow = false;    // true in the separate preview window's module instance
let unlistenMove: (() => void) | null = null;
let unlistenResize: (() => void) | null = null;
let repositionQueued = false;   // coalesces a burst of move/resize events into one
let repositionRunning = false;  // guards against overlapping async reposition runs

// ---------------------------------------------------------------------------
// Content renderer (shape-agnostic: works in any container element)
// ---------------------------------------------------------------------------

function renderPreviewContent(header: HTMLElement, body: HTMLElement, item: ClipboardItem): void {
  header.replaceChildren();
  body.replaceChildren();

  const badge = document.createElement("span");
  badge.className = `item-badge badge-${item.type}`;
  badge.textContent = item.type;

  const time = document.createElement("span");
  time.textContent = new Date(item.timestamp).toLocaleString();

  const details = document.createElement("span");
  details.className = "preview-details";

  header.append(badge, time, details);

  if (item.type === "text") {
    details.textContent = `${item.payload.char_count.toLocaleString()} chars · ${item.payload.line_count.toLocaleString()} lines`;

    const textEl = document.createElement("div");
    textEl.className = "preview-text";
    const full = item.payload.text;
    textEl.textContent =
      full.length > TEXT_CHAR_CAP
        ? full.slice(0, TEXT_CHAR_CAP)
        : full;
    body.append(textEl);

    if (full.length > TEXT_CHAR_CAP) {
      const notice = document.createElement("div");
      notice.className = "preview-notice";
      notice.textContent = `Truncated — showing first ${TEXT_CHAR_CAP.toLocaleString()} of ${full.length.toLocaleString()} characters`;
      body.append(notice);
    }
  } else if (item.type === "image") {
    const p = item.payload;
    details.textContent = `${p.width}×${p.height} · ${formatBytes(p.byte_size)}`;

    const wrap = document.createElement("div");
    wrap.className = "preview-image-wrap";
    wrap.title = "Click to zoom to 100% · drag to pan";

    const img = document.createElement("img");
    img.className = "preview-image";
    img.src = p.data_url;
    img.alt = "Clipboard image";

    let suppressClick = false; // set after a drag, so release doesn't toggle zoom

    // Zoom toggle anchored on the click point: the clicked spot stays under
    // the cursor in both directions (fit <-> 100%).
    img.addEventListener("click", (e) => {
      if (suppressClick) { suppressClick = false; return; }
      const r = img.getBoundingClientRect();
      const wr = wrap.getBoundingClientRect();
      // Click point in natural image coordinates
      const nx = (e.clientX - r.left) * (img.naturalWidth / r.width);
      const ny = (e.clientY - r.top) * (img.naturalHeight / r.height);
      wrap.classList.toggle("zoomed");
      // Scroll so the same image point lands back under the cursor
      const r2 = img.getBoundingClientRect();
      const s2 = r2.width / img.naturalWidth;
      wrap.scrollLeft = (r2.left - wr.left) + nx * s2 - (e.clientX - wr.left);
      wrap.scrollTop = (r2.top - wr.top) + ny * s2 - (e.clientY - wr.top);
    });

    // Drag (left or middle button) pans the zoomed image.
    wrap.addEventListener("mousedown", (e) => {
      if (e.button !== 0 && e.button !== 1) return;
      e.preventDefault(); // no selection drag, no middle-click auto-scroll
      suppressClick = false;
      const sx = e.clientX, sy = e.clientY;
      const sl = wrap.scrollLeft, st = wrap.scrollTop;
      let moved = false;
      wrap.classList.add("grabbing");
      const onMove = (ev: MouseEvent) => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return; // click vs. drag
        moved = true;
        wrap.scrollLeft = sl - dx;
        wrap.scrollTop = st - dy;
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        wrap.classList.remove("grabbing");
        if (moved) suppressClick = true; // a drag must not toggle zoom on release
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    });

    wrap.append(img);
    body.append(wrap);
  } else {
    const p = item.payload;
    details.textContent = `${p.count.toLocaleString()} files`;

    const list = document.createElement("div");
    list.className = "preview-file-list";
    for (const path of p.paths) {
      const row = document.createElement("div");
      row.className = "preview-file-row";

      const icon = document.createElement("span");
      icon.className = "preview-file-icon";
      icon.textContent = "\u{1F4C4}"; // page facing up

      const text = document.createElement("span");
      text.textContent = path;

      row.append(icon, text);
      list.append(row);
    }
    body.append(list);
  }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Trigger + lifetime
// ---------------------------------------------------------------------------

function sourceItem(): ClipboardItem | null {
  return host!.getSelected();
}

/** shouldOpen: hover/arrow interactions open the panel; background refreshes
 *  (search typing, new captures) only update it. */
function update(shouldOpen: boolean): void {
  const item = sourceItem();
  if (!item) { previewDismiss(); return; }
  if (!open) {
    if (shouldOpen) void openPanel(item);
    return;
  }
  if (renderedId === item.id) return;
  renderedId = item.id;
  if (mode === "docked") {
    // Docked preview shares this window's DOM, so render in place.
    renderPreviewContent(headerEl, bodyEl, item);
  } else {
    // The preview is a separate window: push the new content through Rust so
    // the pre-rendered item reaches the preview window's DOM.
    void invoke("preview_update", { item }).catch(() => {});
  }
}

async function openPanel(item: ClipboardItem): Promise<void> {
  renderedId = item.id;
  open = true;
  startTracking();
  const p = await computePreviewPlacement(getCurrentWindow());
  await applyPlacement(p, item);
}

/** Close the preview. Idempotent. Handles both presentations. */
export function previewDismiss(): void {
  if (graceTimer !== null) { clearTimeout(graceTimer); graceTimer = null; }
  const wasOpen = open;
  open = false;
  renderedId = null;
  if (wasOpen) {
    bodyEl.replaceChildren(); // drop the full-size image for GC
    if (panelEl) {
      panelEl.classList.remove("open");
      panelEl.setAttribute("aria-hidden", "true");
    }
    // Also hides the separate window (a no-op while docked) and clears
    // PREVIEW_OPEN so the main window resumes its normal auto-hide.
    void invoke("preview_hide").catch(() => {});
    stopTracking();
    // Tell the preview window to reset its mirrored state.
    void emitTo("preview", "preview-hidden", {}).catch(() => {});
  }
  // A fresh open re-resolves the presentation from scratch.
  mode = "none";
}

function startGrace(): void {
  if (graceTimer !== null) clearTimeout(graceTimer);
  graceTimer = window.setTimeout(() => {
    graceTimer = null;
    void graceFire();
  }, GRACE_MS);
}

/** True while the left button is held anywhere on the machine. Rust reads
 *  GetAsyncKeyState — authoritative even while a native modal loop owns the
 *  mouse and the webview sees neither moves nor the button state. */
function pointerHeld(): Promise<boolean> {
  return invoke<boolean>("is_pointer_held").catch(() => false);
}

/** Poll until the button comes up (bounded by a safety cap). */
async function waitPointerRelease(): Promise<void> {
  const t0 = Date.now();
  while ((await pointerHeld()) && Date.now() - t0 < RELEASE_MAX_MS) {
    await new Promise((r) => window.setTimeout(r, RELEASE_POLL_MS));
  }
}

/** Fire the grace close, but never while a drag owns the pointer. */
async function graceFire(): Promise<void> {
  if (nativeDragActive || Date.now() < holdUntil) return;
  // A native edge resize has no JS hook: the modal sizing loop freezes the
  // webview's hover and swallows resize events, so the hold above can lapse
  // mid-drag (any pause while the button is held). Dismissing then would run
  // the restore geometry against a transient width the OS sizing loop is
  // about to override — the drag finishes at the dragged width *including*
  // the panel, and the state has already flipped to "closed", so nothing
  // ever subtracts it (user-reported 2026-10-19). Ask Rust whether the
  // button is actually down and hold until release — the frontend mirror of
  // defer_hide_until_mouse_up (ADR-0002).
  if (await pointerHeld()) {
    await waitPointerRelease();
    refreshHold(); // quiet window, then :hover decides whether to re-arm
    return;
  }
  // State can change while the invoke was in flight.
  if (nativeDragActive || Date.now() < holdUntil) return;
  // In the preview window, ask main to close us: main owns the open/close
  // state (it knows whether the cursor is still over the list), so a
  // self-dismiss here would desync the two windows.
  if (isPreviewWindow) {
    void emitTo("main", "preview-request-close", {}).catch(() => {});
    return;
  }
  previewDismiss();
}

/** Refresh the hold used while the OS sizing loop streams resize events
 *  (native edge resize — no JS hook there). Once events go quiet, re-check
 *  whether the pointer is still over THIS window before letting the grace run. */
function refreshHold(): void {
  holdUntil = Date.now() + HOLD_QUIET_MS;
  if (holdCheckTimer !== null) clearTimeout(holdCheckTimer);
  holdCheckTimer = window.setTimeout(() => {
    holdCheckTimer = null;
    holdUntil = 0;
    // Only arm the grace close if the pointer is not over this window. In the
    // main window that means "over the list/panel area"; in the preview window
    // it means "over the preview panel".
    const surface = document.querySelector(".clippy-popup") as HTMLElement | null;
    if (surface && surface.matches(":hover")) return;
    startGrace();
  }, HOLD_QUIET_MS + 10);
}

/** Called by runNativeDrag for a JS-initiated native loop (header move, grip
 *  resize). The drag op resolves as soon as the loop starts, so this flag only
 *  covers the beginning; the pointer-state check in graceFire covers the rest. */
export function previewNativeDragStart(): void {
  nativeDragActive = true;
  if (graceTimer !== null) { clearTimeout(graceTimer); graceTimer = null; }
}

export function previewNativeDragEnd(): void {
  nativeDragActive = false;
  refreshHold(); // quiet window, then :hover decides whether to re-arm
}

function cancelGrace(): void {
  if (graceTimer !== null) { clearTimeout(graceTimer); graceTimer = null; }
}

/** The selection moved (hover or arrow key — same state): follow it. */
export function previewSelectionChanged(): void {
  cancelGrace();
  update(true);
}

/** Background refresh: re-render if open, close if the item is gone. Never opens. */
export function previewRefresh(): void {
  if (!open) return;
  update(false);
}

export function initPreview(hostApi: PreviewHost): void {
  const label = getCurrentWindow().label;

  if (label === "preview") {
    initPreviewWindow();
    return;
  }

  // ---- Main window ----
  host = hostApi;
  headerEl = document.getElementById("preview-header")!;
  bodyEl = document.getElementById("preview-body")!;
  panelEl = document.getElementById("preview-panel");

  // Leaving the main window arms the grace close; entering cancels it. Moving
  // the cursor across to the preview window recomposes inside the grace window
  // (the preview's own mouseenter cancels the close).
  const surface = document.querySelector(".clippy-popup") as HTMLElement | null;
  if (surface) {
    surface.addEventListener("mouseenter", cancelGrace);
    surface.addEventListener("mouseleave", () => { if (open) startGrace(); });
  }

  // The preview window's JS attaches its listeners asynchronously; when it is
  // up it announces itself and we (re)send the current item. This "pull"
  // handshake removes any race where an early emit would be dropped.
  void listen("preview-ready", () => {
    const item = sourceItem();
    if (item && open) void emitTo("preview", "preview-content", item).catch(() => {});
  }).catch(() => {});

  // The preview window asks us to close when the cursor has left it. We are
  // the sole owner of open/close: honour the request only if the cursor is not
  // back over our own surface (e.g. the user moved from the preview back onto
  // a list card).
  void listen("preview-request-close", () => {
    if (surface && surface.matches(":hover")) return;
    previewDismiss();
  }).catch(() => {});

  // The cursor crossed into the preview window: cancel our grace close so the
  // preview survives the trip across the gap between the two windows.
  void listen("preview-cancel-close", () => cancelGrace()).catch(() => {});

  // Rust hides the main window on focus loss / Esc / copy; the preview follows.
  void listen("window-hidden", () => previewDismiss()).catch(() => {});
}

/** Preview-window side: render incoming content and announce readiness. */
function initPreviewWindow(): void {
  isPreviewWindow = true;
  document.body.classList.add("preview-window");
  headerEl = document.getElementById("preview-header")!;
  bodyEl = document.getElementById("preview-body")!;

  void listen("preview-content", (event: { payload: ClipboardItem }) => {
    if (event.payload) {
      renderPreviewContent(headerEl, bodyEl, event.payload);
      renderedId = event.payload.id;
      open = true;
    }
  }).catch(() => {});

  // Main owns the open/close state; when it hides the preview, reset ours so a
  // later re-show starts clean.
  void listen("preview-hidden", () => {
    open = false;
    renderedId = null;
    bodyEl.replaceChildren();
  }).catch(() => {});

  // Announce readiness so the main window can (re)send the selected item.
  void emitTo("main", "preview-ready", {}).catch(() => {});

  // Moving the pointer inside the preview makes it focusable so the user can
  // select and copy text; moving out returns focus to the main window so
  // keyboard traversal keeps working. Leaving also (after the grace period)
  // asks the main window to close the preview — main is the sole owner of the
  // open/close state, which keeps the two windows from desyncing.
  const pvPanel = document.getElementById("preview-panel");
  if (pvPanel) {
    pvPanel.addEventListener("mouseenter", () => {
      cancelGrace();
      // Tell main to cancel its own grace too: the cursor left main's area to
      // get here, which armed main's grace, and nothing else would clear it.
      void emitTo("main", "preview-cancel-close", {}).catch(() => {});
      void invoke("preview_set_interactive", { interactive: true }).catch(() => {});
    });
    pvPanel.addEventListener("mouseleave", () => {
      void invoke("preview_set_interactive", { interactive: false }).catch(() => {});
      if (open) startGrace();
    });
  }
}

// ---------------------------------------------------------------------------
// Geometry — the preview window is a separate always-on-top window aligned to
// the right (or, near a screen edge, the left) of the main window. It tracks
// the main window's move/resize. The main window itself never changes size.
// ---------------------------------------------------------------------------

/** Resolve where the preview should go for the main window's current geometry.
 *
 *  Reads the geometry from Tauri, then defers the actual rules to
 *  `resolvePreviewPlacement` (pure and unit-tested). */
async function computePreviewPlacement(win: ReturnType<typeof getCurrentWindow>): Promise<Placement> {
  const scale = await win.scaleFactor();
  const pos = await win.outerPosition();     // physical
  const size = await win.outerSize();        // physical
  const mon = await currentMonitor();

  return resolvePreviewPlacement({
    main: { x: pos.x, y: pos.y, width: size.width, height: size.height },
    workArea: mon
      ? {
          x: mon.workArea.position.x,
          y: mon.workArea.position.y,
          width: mon.workArea.size.width,
          height: mon.workArea.size.height,
        }
      : null,
    previewWidth: Math.round(previewColumnWidth() * scale),
    gap: Math.round(PREVIEW_GAP * scale),
  });
}

/**
 * Coalesce a burst of move/resize events into a single reposition. During a
 * native window drag the OS streams these events at high frequency; running
 * the async placement (several IPCs) per event makes the drag crawl. One
 * in-flight run plus rAF coalescing keeps the preview glued without the lag.
 */
function scheduleReposition(): void {
  if (!open || repositionQueued || repositionRunning) return;
  repositionQueued = true;
  requestAnimationFrame(() => {
    repositionQueued = false;
    if (!open || repositionRunning) return;
    repositionRunning = true;
    void positionPreview().finally(() => { repositionRunning = false; });
  });
}

/** Frame the separate preview window at `p` (physical px). */
async function movePreviewWindow(p: Placement): Promise<void> {
  await invoke("preview_position", { x: p.x, y: p.y });
  await invoke("preview_set_size", { width: p.width, height: p.height });
}

/** Adopt `p` as the presentation for `item`, switching mode if needed.
 *  Called both when opening and on every reposition, so it must be cheap when
 *  the mode has not changed. */
async function applyPlacement(p: Placement, item: ClipboardItem): Promise<void> {
  if (p.docked) {
    if (mode === "docked") return; // already docked; content handled by update()
    mode = "docked";
    // Remove the separate window: this also clears PREVIEW_OPEN in Rust, so
    // the main window's normal auto-hide-on-blur behaviour resumes.
    await invoke("preview_hide").catch(() => {});
    void emitTo("preview", "preview-hidden", {}).catch(() => {});
    if (panelEl) {
      panelEl.classList.add("open");
      panelEl.setAttribute("aria-hidden", "false");
    }
    renderPreviewContent(headerEl, bodyEl, item);
    renderedId = item.id;
    return;
  }

  if (mode !== "window") {
    // No separate window is up yet (either nothing is showing, or the preview
    // was docked): show the window and move the content out of this DOM.
    mode = "window";
    if (panelEl) {
      panelEl.classList.remove("open");
      panelEl.setAttribute("aria-hidden", "true");
    }
    bodyEl.replaceChildren(); // drop any docked copy
    await invoke("preview_show", { x: p.x, y: p.y, width: p.width, height: p.height, item });
    renderedId = item.id;
    return;
  }

  await movePreviewWindow(p);
}

/** Position/resolve the preview for the main window's current geometry. */
async function positionPreview(): Promise<void> {
  if (!open) return;
  const item = sourceItem();
  if (!item) { previewDismiss(); return; }
  try {
    const p = await computePreviewPlacement(getCurrentWindow());
    await applyPlacement(p, item);
  } catch {
    /* window may be mid-teardown; ignore */
  }
}

/** Start tracking the main window's geometry (idempotent). */
function startTracking(): void {
  if (mainMoveHandler || mainResizeHandler) return;
  const win = getCurrentWindow();
  mainMoveHandler = () => { scheduleReposition(); };
  mainResizeHandler = () => { refreshHold(); scheduleReposition(); };
  win.onMoved(mainMoveHandler).then((un) => { unlistenMove = un; }).catch(() => {});
  win.onResized(mainResizeHandler).then((un) => { unlistenResize = un; }).catch(() => {});
}

/** Stop tracking main-window geometry and detach the listeners. */
function stopTracking(): void {
  mainMoveHandler = null;
  mainResizeHandler = null;
  if (unlistenMove) { unlistenMove(); unlistenMove = null; }
  if (unlistenResize) { unlistenResize(); unlistenResize = null; }
  repositionQueued = false;
}

/** Called from the main window on every resize: hold the grace close during
 *  the OS sizing loop and keep the preview aligned. */
export function previewHandleResize(): void {
  refreshHold();
  scheduleReposition();
}
