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
import { listen } from "@tauri-apps/api/event";
import type { ClipboardItem } from "./types";

const PANEL_W = 480;        // logical px added to the window width
const GRACE_MS = 350;       // close shortly after the cursor leaves the window
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
  graceTimer = window.setTimeout(() => { graceTimer = null; previewDismiss(); }, GRACE_MS);
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
// ---------------------------------------------------------------------------

let geo: "normal" | "expanded" | "busy" = "normal";
let adjusting = false;
let cachedInnerW = 0;   // logical inner width before expanding
let cachedOuterX = 0;   // outer x before expanding
let flippedX = 0;       // outer x after flipping the panel to the left (physical)
let flippedLeft = false;
let pendingRestore: { w: number; x: number | null } | null = null; // applied after leaving maximize

async function expandGeometry(): Promise<void> {
  if (geo !== "normal" || adjusting) return;
  const win = getCurrentWindow();
  try {
    adjusting = true;
    if (await win.isMaximized()) return; // already wide enough; nothing to restore later

    const scale = await win.scaleFactor();
    const inner = await win.innerSize();       // physical
    const outer = await win.outerPosition();   // physical
    const outerSz = await win.outerSize();     // physical
    const innerLogical = inner.toLogical(scale);

    cachedInnerW = innerLogical.width;
    cachedOuterX = outer.x;

    // Widening grows the window to the right; if that would cross the work
    // area's right edge, the panel flips to the LEFT side instead: the window
    // grows leftward by exactly the panel width so the list column keeps its
    // exact screen position (like a menu opening leftward near an edge).
    flippedLeft = false;
    let newX = outer.x;
    const mon = await currentMonitor();
    if (mon) {
      const panelPx = Math.round(PANEL_W * scale);
      const waRight = mon.workArea.position.x + mon.workArea.size.width;
      if (outer.x + outerSz.width + panelPx > waRight) {
        newX = Math.max(mon.workArea.position.x, outer.x - panelPx);
        flippedLeft = newX < outer.x;
      }
    }
    if (flippedLeft) flippedX = newX;

    await win.setSize(new LogicalSize(cachedInnerW + PANEL_W, innerLogical.height));
    if (flippedLeft) await win.setPosition(new PhysicalPosition(flippedX, outer.y));
    panelEl.classList.toggle("panel-left", flippedLeft);
    geo = "expanded";
  } catch (e) {
    console.error("preview expand failed:", e);
  } finally {
    adjusting = false;
  }
}

async function restoreGeometry(): Promise<void> {
  if (geo !== "expanded" || adjusting) return;
  geo = "normal";
  const win = getCurrentWindow();
  try {
    adjusting = true;
    const scale = await win.scaleFactor();
    const inner = await win.innerSize();
    const curW = inner.toLogical(scale).width;

    if (await win.isMaximized()) {
      pendingRestore = { w: cachedInnerW, x: flippedLeft ? cachedOuterX : null };
      return;
    }
    // If the width no longer matches what we set, the user has resized while
    // the panel was open — leave their geometry alone.
    if (Math.abs(curW - (cachedInnerW + PANEL_W)) > 2) return;

    await win.setSize(new LogicalSize(cachedInnerW, inner.toLogical(scale).height));
    if (flippedLeft) {
      const pos = await win.outerPosition();
      if (Math.abs(pos.x - flippedX) <= 2) await win.setPosition(new PhysicalPosition(cachedOuterX, pos.y));
    }
  } catch (e) {
    console.error("preview restore failed:", e);
  } finally {
    adjusting = false;
  }
}

/** Self-healing for maximize/unmaximize and user resizes around panel state. */
export function previewHandleResize(): void {
  if (adjusting) return;
  void (async () => {
    const win = getCurrentWindow();
    try {
      if (await win.isMaximized()) return;
      if (pendingRestore !== null) {
        const scale = await win.scaleFactor();
        const inner = await win.innerSize();
        await win.setSize(new LogicalSize(pendingRestore.w, inner.toLogical(scale).height));
        if (pendingRestore.x !== null) {
          const pos = await win.outerPosition();
          await win.setPosition(new PhysicalPosition(pendingRestore.x, pos.y));
        }
        pendingRestore = null;
      } else if (open && geo === "normal") {
        void expandGeometry();
      } else if (!open && geo === "expanded") {
        void restoreGeometry();
      }
    } catch (e) {
      console.error("preview resize self-heal failed:", e);
    }
  })();
}
