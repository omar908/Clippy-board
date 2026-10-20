// Full-content preview panel.
//
// Shows the complete text / image / file list for the currently selected
// item — a pure view of the one selection state that both the mouse (hover)
// and the keyboard (arrows) move. The main window widens to the right while
// the panel is open, and the original geometry is restored when it closes.
//
// The module is split so the presentation can be swapped later without
// touching the experience-defining parts:
//   1. renderPreviewContent() — pure DOM renderer (item -> panel content)
//   2. trigger/lifetime below  — selection-following + grace delay
//   3. geometry adapter        — expand/restore the main window (see bottom)

import { getCurrentWindow, currentMonitor, LogicalSize, PhysicalPosition } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ClipboardItem } from "./types";

const PANEL_W = 480;        // logical px added to the window width
const MIN_WIN_W = 360;      // width restores floor — mirrors min_inner_size in src-tauri/src/lib.rs
const GRACE_MS = 350;       // close shortly after the cursor leaves the window
const HOLD_QUIET_MS = 150;  // grace stays held this long after the last drag/resize event
const RELEASE_POLL_MS = 150; // re-check the mouse button this often while it is held
const RELEASE_MAX_MS = 30_000; // safety cap: a stuck check can't hold the panel forever
const TEXT_CHAR_CAP = 100_000; // render at most this much text (full fidelity beyond is noise anyway)

interface PreviewHost {
  /** Currently selected item (the single state hover + arrows move). */
  getSelected: () => ClipboardItem | null;
}

let host: PreviewHost | null = null;
let popupEl: HTMLElement;
let panelEl: HTMLElement;
let headerEl: HTMLElement;
let bodyEl: HTMLElement;

let open = false;
let renderedId: string | null = null;
let graceTimer: number | null = null;
let holdUntil = 0;            // epoch ms — no grace dismissal before this (resize stream)
let holdCheckTimer: number | null = null;
let nativeDragActive = false; // JS-initiated native drag/resize loop in progress

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
    if (shouldOpen) openPanel(item);
    return;
  }
  if (renderedId !== item.id) renderPreviewContent(headerEl, bodyEl, item);
  renderedId = item.id;
}

function openPanel(item: ClipboardItem): void {
  renderPreviewContent(headerEl, bodyEl, item);
  renderedId = item.id;
  open = true;
  panelEl.classList.add("open");
  panelEl.setAttribute("aria-hidden", "false");
  void expandGeometry();
}

/** Close the panel and restore the window geometry. Idempotent. */
export function previewDismiss(): void {
  if (graceTimer !== null) { clearTimeout(graceTimer); graceTimer = null; }
  const wasOpen = open;
  open = false;
  renderedId = null;
  if (wasOpen) {
    panelEl.classList.remove("open");
    panelEl.classList.remove("panel-left");
    panelEl.setAttribute("aria-hidden", "true");
    bodyEl.replaceChildren(); // drop the full-size image for GC
  }
  void restoreGeometry();
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
  previewDismiss();
}

/** Refresh the hold used while the OS sizing loop streams resize events
 *  (native edge resize — no JS hook there). Once events go quiet, re-check
 *  the real cursor position before letting the grace run again. */
function refreshHold(): void {
  holdUntil = Date.now() + HOLD_QUIET_MS;
  if (holdCheckTimer !== null) clearTimeout(holdCheckTimer);
  holdCheckTimer = window.setTimeout(() => {
    holdCheckTimer = null;
    holdUntil = 0;
    if (popupEl && !popupEl.matches(":hover")) startGrace();
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
  host = hostApi;
  popupEl = document.querySelector(".clippy-popup")!;
  panelEl = document.getElementById("preview-panel")!;
  headerEl = document.getElementById("preview-header")!;
  bodyEl = document.getElementById("preview-body")!;

  // The panel opens from card hover or arrow keys only — hovering window
  // chrome (header, footer, search) must not open it. Leaving the window
  // closes it after a short grace period.
  popupEl.addEventListener("mouseleave", () => {
    startGrace();
  });

  // Rust hides the window on focus loss / Esc / copy (ADR-0002), and the
  // webview can't observe a native hide on its own (WebView2 keeps
  // document.visibilityState "visible" for a hidden parent window), so every
  // hide path emits `window-hidden` — the geometry is restored while the
  // window is invisible, keeping position/size retention intact.
  void listen("window-hidden", () => previewDismiss()).catch(() => {});
}

// ---------------------------------------------------------------------------
// Geometry adapter — widens the main window for the panel.
// Swap this section (not the rest) if the preview moves to its own window.
//
// Every operation is RELATIVE and exactly ± the panel — nothing pre-expand
// is cached for restore:
//   - width: open = current + PANEL_W, close = current - PANEL_W (floored at
//     the app min width). The panel is a fixed 480 px CSS column, so user
//     resizes while open are list-column resizes and closing keeps exactly
//     the list width the user created.
//   - x:     a flip shifts left by PANEL_W; closing a flipped panel shifts
//     right by PANEL_W from the current position, so the list keeps its
//     screen position after any drag.
// Restoring absolute pre-expand coordinates instead (gated on "hasn't
// moved/resized since") skipped the compensation after any user change,
// teleporting the list by a full panel width (user-reported 2026-10-18).
// All ops run through one queue, so interleaved expand/restore pairs can
// never apply deltas computed from stale state.
// ---------------------------------------------------------------------------

let geo: "normal" | "expanded" = "normal";
let flippedLeft = false;
let pendingRestore: { flipped: boolean } | null = null; // applied after leaving maximize
let geoQueue: Promise<void> = Promise.resolve();

function queueGeoOp(op: () => Promise<void>): Promise<void> {
  geoQueue = geoQueue.then(op).catch((e) => console.error("preview geometry failed:", e));
  return geoQueue;
}

// Our own geometry writes also emit resize events. The hover guard that
// protects against layout-induced mouseenter must not arm for those: the
// panel opening/closing does not move the list under the cursor, and a
// guard here would swallow the user's next real hover.
let lastSelfResizeAt = 0;

function markSelfResize(): void {
  lastSelfResizeAt = Date.now();
}

export function previewOwnResizeRecently(): boolean {
  return Date.now() - lastSelfResizeAt <= 300;
}

function panelPx(scale: number): number {
  return Math.round(PANEL_W * scale);
}

function expandGeometry(): Promise<void> {
  return queueGeoOp(async () => {
    if (geo !== "normal") return;
    const win = getCurrentWindow();
    try {
      if (await win.isMaximized()) return; // already wide enough; nothing to restore later

      const scale = await win.scaleFactor();
      const inner = await win.innerSize();       // physical
      const outer = await win.outerPosition();   // physical
      const outerSz = await win.outerSize();     // physical
      const innerLogical = inner.toLogical(scale);

      // Widening grows the window to the right; if that would cross the work
      // area's right edge, the panel flips to the LEFT side instead: the window
      // grows leftward by exactly the panel width so the list column keeps its
      // exact screen position (like a menu opening leftward near an edge).
      flippedLeft = false;
      let newX = outer.x;
      const mon = await currentMonitor();
      if (mon) {
        const px = panelPx(scale);
        const waRight = mon.workArea.position.x + mon.workArea.size.width;
        if (outer.x + outerSz.width + px > waRight) {
          newX = Math.max(mon.workArea.position.x, outer.x - px);
          flippedLeft = newX < outer.x;
        }
      }

      markSelfResize();
      await win.setSize(new LogicalSize(innerLogical.width + PANEL_W, innerLogical.height));
      if (flippedLeft) await win.setPosition(new PhysicalPosition(newX, outer.y));
      panelEl.classList.toggle("panel-left", flippedLeft);
      geo = "expanded";
    } catch (e) {
      console.error("preview expand failed:", e);
    }
  });
}

function restoreGeometry(): Promise<void> {
  return queueGeoOp(async () => {
    if (geo !== "expanded") return;
    geo = "normal";
    const win = getCurrentWindow();
    try {
      const scale = await win.scaleFactor();
      const inner = await win.innerSize();
      const innerLogical = inner.toLogical(scale);

      if (await win.isMaximized()) {
        pendingRestore = { flipped: flippedLeft };
        return;
      }
      // A flipped panel occupies the window's LEFT edge: closing it must
      // shift the window right by exactly the panel width so the list keeps
      // its screen position — from wherever the window is now, the user's
      // own drags included. (An unflipped panel widens rightward, so the
      // shrink is invisible on screen and no shift is needed.)
      if (flippedLeft) {
        markSelfResize();
        const pos = await win.outerPosition();
        await win.setPosition(new PhysicalPosition(pos.x + panelPx(scale), pos.y));
      }
      // Closing removes exactly the panel column: subtract its width from
      // wherever the window is now. The panel is a fixed 480 px CSS column,
      // so any resize while open was a list-column resize — this keeps the
      // list width the user created instead of a pre-expand cache (whose
      // mismatch check skipped restoration entirely after any user resize).
      const targetW = Math.max(MIN_WIN_W, innerLogical.width - PANEL_W);
      markSelfResize();
      await win.setSize(new LogicalSize(targetW, innerLogical.height));
    } catch (e) {
      console.error("preview restore failed:", e);
    }
  });
}

/** Self-healing for maximize/unmaximize and user resizes around panel state.
 *  Every resize event also holds the grace close: the OS sizing loop takes
 *  the mouse from the webview, which sees a synthetic leave and would close
 *  the preview mid-drag (native edge resize has no JS hook to catch). */
export function previewHandleResize(): void {
  refreshHold();
  void queueGeoOp(async () => {
    const win = getCurrentWindow();
    try {
      if (await win.isMaximized()) return;
      if (pendingRestore !== null) {
        const scale = await win.scaleFactor();
        const inner = await win.innerSize();
        const innerLogical = inner.toLogical(scale);
        if (pendingRestore.flipped) {
          const pos = await win.outerPosition();
          markSelfResize();
          await win.setPosition(new PhysicalPosition(pos.x + panelPx(scale), pos.y));
        }
        markSelfResize();
        await win.setSize(new LogicalSize(Math.max(MIN_WIN_W, innerLogical.width - PANEL_W), innerLogical.height));
        pendingRestore = null;
      } else if (open && geo === "normal") {
        void expandGeometry(); // queued — runs after this self-heal
      } else if (!open && geo === "expanded") {
        void restoreGeometry();
      }
    } catch (e) {
      console.error("preview resize self-heal failed:", e);
    }
  });
}
