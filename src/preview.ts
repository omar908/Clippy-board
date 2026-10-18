// Full-content preview panel.
//
// Shows the complete text / image / file list for the item under the cursor
// or the keyboard highlight. The main window widens to the right while the
// panel is open, and the original geometry is restored when it closes.
//
// The module is split so the presentation can be swapped later without
// touching the experience-defining parts:
//   1. renderPreviewContent() — pure DOM renderer (item -> panel content)
//   2. trigger/lifetime below  — hover + keyboard highlight, grace delay
//   3. geometry adapter        — expand/restore the main window (see bottom)

import { getCurrentWindow, currentMonitor, LogicalSize, PhysicalPosition } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import type { ClipboardItem } from "./types";

const PANEL_W = 480;        // logical px added to the window width
const GRACE_MS = 350;       // close shortly after the cursor leaves the window
const TEXT_CHAR_CAP = 100_000; // render at most this much text (full fidelity beyond is noise anyway)

interface PreviewHost {
  /** Currently keyboard-highlighted item (may be null). */
  getSelected: () => ClipboardItem | null;
  /** Whether an item id is still shown in the list (filters deleted/filtered-out items). */
  hasItem: (id: string) => boolean;
}

let host: PreviewHost | null = null;
let popupEl: HTMLElement;
let panelEl: HTMLElement;
let headerEl: HTMLElement;
let bodyEl: HTMLElement;

let hovered: ClipboardItem | null = null; // sticky: survives moving onto the panel, cleared on nav/leave
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
    wrap.title = "Click to zoom to 100%";

    const img = document.createElement("img");
    img.className = "preview-image";
    img.src = p.data_url;
    img.alt = "Clipboard image";
    img.addEventListener("click", () => wrap.classList.toggle("zoomed"));

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
  if (hovered && !host!.hasItem(hovered.id)) hovered = null;
  return hovered ?? host!.getSelected();
}

/** shouldOpen: keyboard/nav interactions and cursor-in-window open the panel;
 *  background refreshes (search typing, new captures) only update it. */
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

/** Card hover. Null clears the sticky hover (kept across panel, cleared on window leave). */
export function previewHover(item: ClipboardItem | null): void {
  hovered = item;
  cancelGrace();
  update(true);
}

/** Keyboard highlight moved: follow the selection, drop sticky hover. */
export function previewNavigate(): void {
  hovered = null;
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

  popupEl.addEventListener("mouseenter", () => {
    cancelGrace();
    update(true);
  });
  popupEl.addEventListener("mouseleave", () => {
    hovered = null;
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
let shiftedX = 0;       // outer x after the edge-flip shift (physical)
let didShift = false;
let pendingRestoreW: number | null = null; // width to apply after leaving maximize

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

    // Shift left if widening would push the window off the right edge.
    didShift = false;
    const mon = await currentMonitor();
    if (mon) {
      const panelPx = Math.round(PANEL_W * scale);
      const waRight = mon.workArea.position.x + mon.workArea.size.width;
      if (outer.x + outerSz.width + panelPx > waRight) {
        const newX = Math.max(mon.workArea.position.x, waRight - outerSz.width - panelPx - 8);
        if (newX < outer.x) { didShift = true; shiftedX = newX; }
      }
    }

    await win.setSize(new LogicalSize(cachedInnerW + PANEL_W, innerLogical.height));
    if (didShift) await win.setPosition(new PhysicalPosition(shiftedX, outer.y));
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
      pendingRestoreW = cachedInnerW; // apply after the window leaves maximize
      return;
    }
    // If the width no longer matches what we set, the user has resized while
    // the panel was open — leave their geometry alone.
    if (Math.abs(curW - (cachedInnerW + PANEL_W)) > 2) return;

    await win.setSize(new LogicalSize(cachedInnerW, inner.toLogical(scale).height));
    if (didShift) {
      const pos = await win.outerPosition();
      if (Math.abs(pos.x - shiftedX) <= 2) await win.setPosition(new PhysicalPosition(cachedOuterX, pos.y));
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
      if (pendingRestoreW !== null) {
        const inner = await win.innerSize();
        await win.setSize(new LogicalSize(pendingRestoreW, inner.toLogical(await win.scaleFactor()).height));
        pendingRestoreW = null;
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
