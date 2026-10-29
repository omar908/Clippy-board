import { invoke } from "@tauri-apps/api/core";
import { listen, emitTo } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { ClipboardItem, DeletedItem } from "./types";
import {
  initPreview,
  previewSelectionChanged,
  previewRefresh,
  previewDismiss,
  previewHandleResize,
  previewNativeDragStart,
  previewNativeDragEnd,
} from "./preview";

let history: ClipboardItem[] = [];
let filteredHistory: ClipboardItem[] = [];
let deletedItems: DeletedItem[] = [];
let currentFilter: "all" | "pinned" | "text" | "image" | "file" | "deleted" = "all";
const countPinned = document.getElementById("count-pinned") as HTMLSpanElement;
const countDeleted = document.getElementById("count-deleted") as HTMLSpanElement;
let selectedIndex = 0;
let searchQuery = "";
let isPinned = false;
let isPaused = false;
const isPreviewWindow = getCurrentWindow().label === "preview";

// DOM Elements
const searchInput = document.getElementById("search-input") as HTMLInputElement;
const searchClearBtn = document.getElementById("search-clear-btn") as HTMLButtonElement;
const historyList = document.getElementById("history-list") as HTMLDivElement;
const emptyState = document.getElementById("empty-state") as HTMLDivElement;
const emptyTitle = emptyState.querySelector(".empty-title") as HTMLElement;
const emptyDesc = emptyState.querySelector(".empty-desc") as HTMLElement;
// The default copy lives in index.html; capture it once so a search can be
// cleared without duplicating the markup in TypeScript.
const emptyTitleDefault = emptyTitle.textContent ?? "";
const emptyDescDefault = emptyDesc.innerHTML;
const filterTabs = document.querySelectorAll<HTMLButtonElement>(".filter-tab");
const pauseBtn = document.getElementById("pause-btn") as HTMLButtonElement;
const pinBtn = document.getElementById("pin-btn") as HTMLButtonElement;
const clearBtn = document.getElementById("clear-btn") as HTMLButtonElement;
const closeBtn = document.getElementById("close-btn") as HTMLButtonElement;
const countAll = document.getElementById("count-all") as HTMLSpanElement;
const countText = document.getElementById("count-text") as HTMLSpanElement;
const countImage = document.getElementById("count-image") as HTMLSpanElement;
const countFile = document.getElementById("count-file") as HTMLSpanElement;

function formatTime(timestamp: number): string {
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return new Date(timestamp).toLocaleDateString();
}

function formatTTL(deletedAt: number): string {
  const remaining = Math.max(0, Math.floor((deletedAt - Date.now()) / 1000));
  if (remaining < 60) return `${remaining}s left`;
  const min = Math.floor(remaining / 60);
  const sec = remaining % 60;
  return `${min}m ${sec}s left`;
}

function updateCounts() {
  const total = history.length;
  const pinned = history.filter((i: any) => i.pinned).length;
  const text = history.filter((i) => i.type === "text").length;
  const img = history.filter((i) => i.type === "image").length;
  const file = history.filter((i) => i.type === "file").length;

  if (countAll) countAll.textContent = total.toString();
  if (countPinned) countPinned.textContent = pinned.toString();
  if (countText) countText.textContent = text.toString();
  if (countImage) countImage.textContent = img.toString();
  if (countFile) countFile.textContent = file.toString();
  if (countDeleted) countDeleted.textContent = deletedItems.length.toString();
}

function filterAndRender() {
  if (currentFilter === "deleted") {
    console.log("Filtering deleted, items:", JSON.stringify(deletedItems));
    const query = searchQuery.trim().toLowerCase();
    let items: any[] = [...deletedItems];

    if (query) {
      items = items.filter((item: any) => {
        let payload = item.payload;
        if (payload === undefined) {
          if (item.text !== undefined) payload = { text: item.text, preview: item.preview };
          else if (item.data_url !== undefined) payload = { data_url: item.data_url };
          else if (item.paths !== undefined) payload = { paths: item.paths, preview: item.preview };
        }
        const type = item.type;
        if (type === "text") {
          const text = payload?.text || payload?.preview || "";
          return text.toLowerCase().includes(query);
        } else if (type === "file") {
          return (
            payload?.preview?.toLowerCase().includes(query) ||
            payload?.paths?.some((p: string) => p.toLowerCase().includes(query))
          );
        } else if (type === "image") {
          return "image".includes(query);
        }
        return true;
      });
    }

    filteredHistory = items.sort((a: any, b: any) => ((b.deleted_at || 0) - (a.deleted_at || 0))) as any;

    if (selectedIndex >= filteredHistory.length) {
      selectedIndex = Math.max(0, filteredHistory.length - 1);
    }

    renderList();
    updateClearButtonState();
    previewRefresh();
    return;
  }

  const query = searchQuery.trim().toLowerCase();

  filteredHistory = history.filter((item: any) => {
    // Check pinned filter
    if (currentFilter === "pinned" && !item.pinned) {
      return false;
    }
    // Check type filter
    if (currentFilter !== "all" && currentFilter !== "pinned" && item.type !== currentFilter) {
      return false;
    }

    // Check search query
    if (!query) return true;

    if (item.type === "text") {
      return item.payload.text.toLowerCase().includes(query);
    } else if (item.type === "file") {
      return item.payload.paths.some((p: string) => p.toLowerCase().includes(query));
    } else if (item.type === "image") {
      return "image".includes(query) || `${item.payload.width}x${item.payload.height}`.includes(query);
    }
    return true;
  });

  // Sort: pinned items first, then by timestamp (newest first)
  filteredHistory.sort((a: any, b: any) => {
    if ((a.pinned ? 1 : 0) !== (b.pinned ? 1 : 0)) {
      return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
    }
    return ((b.timestamp || 0) - (a.timestamp || 0));
  });

  if (selectedIndex >= filteredHistory.length) {
    selectedIndex = Math.max(0, filteredHistory.length - 1);
  }

  renderList();
  updateClearButtonState();
  previewRefresh();
}

function renderList() {
  console.log("Rendering list, currentFilter:", currentFilter, "filteredHistory length:", filteredHistory.length);
  if (filteredHistory.length === 0) {
    historyList.innerHTML = "";
    emptyState.style.display = "flex";
    if (searchQuery) {
      emptyTitle.textContent = "No matches found";
      emptyDesc.textContent = `No items found matching "${searchQuery}"`;
    } else if (currentFilter === "deleted") {
      emptyTitle.textContent = "No deleted items";
      emptyDesc.textContent = "Items you delete will appear here temporarily until they expire.";
    } else {
      emptyTitle.textContent = emptyTitleDefault;
      emptyDesc.innerHTML = emptyDescDefault;
    }
    return;
  }

  emptyState.style.display = "none";
  historyList.innerHTML = "";

  filteredHistory.forEach((item: any, index) => {
    try {
    const actualItem = item;
    // Handle flattened structure from backend - DeletedItem has type at top level
    const type = actualItem.type;
    let payload: any = {};
    if (actualItem.payload !== undefined) {
      payload = actualItem.payload;
    } else {
      if (type === "text") {
        payload = { text: actualItem.text, preview: actualItem.preview, char_count: actualItem.char_count, line_count: actualItem.line_count };
      } else if (type === "image") {
        payload = { data_url: actualItem.data_url, thumbnail: actualItem.thumbnail, width: actualItem.width, height: actualItem.height, byte_size: actualItem.byte_size };
      } else if (type === "file") {
        payload = { paths: actualItem.paths, count: actualItem.count, preview: actualItem.preview };
      }
    }
    const card = document.createElement("div");
    card.className = `history-item ${index === selectedIndex ? "selected" : ""} ${actualItem.pinned ? "pinned" : ""}`;
    card.setAttribute("data-id", actualItem.id);

    // Meta row
    const headerRow = document.createElement("div");
    headerRow.className = "item-header";

    const metaLeft = document.createElement("div");
    metaLeft.className = "item-meta-left";

    const badge = document.createElement("span");
    badge.className = `item-badge badge-${type}`;
    badge.textContent = type;

    const time = document.createElement("span");
    time.className = "item-time";
    if (currentFilter === "deleted") {
      time.textContent = formatTTL(actualItem.deleted_at || Date.now() + 60000);
    } else {
      time.textContent = formatTime(actualItem.timestamp);
    }

    if (actualItem.pinned) {
      const pinBadge = document.createElement("span");
      pinBadge.className = "item-pin-badge";
      pinBadge.textContent = "📌";
      pinBadge.title = "Pinned (locked)";
      metaLeft.appendChild(pinBadge);
    }

    const details = document.createElement("span");
    details.className = "item-details";

    if (type === "text") {
      details.textContent = `${payload.char_count} chars • ${payload.line_count} line${payload.line_count > 1 ? "s" : ""}`;
    } else if (type === "image") {
      const kb = Math.round(payload.byte_size / 1024);
      details.textContent = `${payload.width}×${payload.height}px • ${kb} KB`;
    } else if (type === "file") {
      details.textContent = `${payload.count} file${payload.count > 1 ? "s" : ""}`;
    }

    metaLeft.appendChild(badge);
    metaLeft.appendChild(time);
    if (type === "text" || type === "image" || type === "file") {
      metaLeft.appendChild(details);
    }

    const actions = document.createElement("div");
    actions.className = "item-actions";

    if (currentFilter === "deleted") {
      // Undo button
      const undoBtn = document.createElement("button");
      undoBtn.className = "item-action-btn btn-undo";
      undoBtn.title = "Undo - restore to history";
      undoBtn.setAttribute("aria-label", "Undo restore");
      undoBtn.innerHTML = "↶";
      undoBtn.onclick = (e) => {
        e.stopPropagation();
        restoreFromDeleted(actualItem.id);
      };
      // Permanent delete button
      const permDeleteBtn = document.createElement("button");
      permDeleteBtn.className = "item-action-btn btn-delete";
      permDeleteBtn.title = "Delete permanently";
      permDeleteBtn.setAttribute("aria-label", "Delete permanently");
      permDeleteBtn.innerHTML = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor"
        stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M2.5 4.5h11" />
        <path d="M6 4.5V3.25h4V4.5" />
        <path d="M3.75 4.5l.55 8.1A1.4 1.4 0 0 0 5.7 13.9h4.6a1.4 1.4 0 0 0 1.4-1.3l.55-8.1" />
        <path d="M6.6 7.25v4M9.4 7.25v4" />
      </svg>`;
      permDeleteBtn.onclick = (e) => {
        e.stopPropagation();
        deletePermanentlyFromDeleted(actualItem.id);
      };
      actions.appendChild(undoBtn);
      actions.appendChild(permDeleteBtn);
    } else {
      // Pin/Unpin button
      const pinBtnItem = document.createElement("button");
      pinBtnItem.className = "item-action-btn btn-pin";
      pinBtnItem.title = (item as any).pinned ? "Unpin (unlock)" : "Pin (lock)";
      pinBtnItem.setAttribute("aria-label", (item as any).pinned ? "Unpin" : "Pin");
      pinBtnItem.innerHTML = (item as any).pinned ? "📌" : "📍";
      pinBtnItem.onclick = (e) => {
        e.stopPropagation();
        togglePin(item.id);
      };

      // Delete button (disabled for pinned items)
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "item-action-btn btn-delete";
      if ((item as any).pinned) {
        deleteBtn.disabled = true;
        deleteBtn.title = "Unpin to delete";
        deleteBtn.setAttribute("aria-label", "Pinned - unpin to delete");
      } else {
        deleteBtn.title = "Delete from history";
        deleteBtn.setAttribute("aria-label", "Delete from history");
      }
      deleteBtn.innerHTML = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor"
        stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M2.5 4.5h11" />
        <path d="M6 4.5V3.25h4V4.5" />
        <path d="M3.75 4.5l.55 8.1A1.4 1.4 0 0 0 5.7 13.9h4.6a1.4 1.4 0 0 0 1.4-1.3l.55-8.1" />
        <path d="M6.6 7.25v4M9.4 7.25v4" />
      </svg>`;
      deleteBtn.onclick = (e) => {
        e.stopPropagation();
        if ((item as any).pinned) return;
        deleteItem(item.id);
      };

      actions.appendChild(pinBtnItem);
      actions.appendChild(deleteBtn);
    }

    headerRow.appendChild(metaLeft);
    headerRow.appendChild(actions);
    card.appendChild(headerRow);

    // Content body
    if (type === "text") {
      const textPreview = document.createElement("div");
      textPreview.className = "item-content-text";
      textPreview.textContent = payload.preview || payload.text || "";
      card.appendChild(textPreview);
    } else if (type === "image") {
      const imgContainer = document.createElement("div");
      imgContainer.className = "item-content-image";
      const img = document.createElement("img");
      // Prefer the pre-rendered thumbnail; full data_url is the fallback
      // (and what restore uses — that path stays Rust-side).
      img.src = payload.thumbnail || payload.data_url || "";
      img.alt = "Clipboard image preview";
      img.loading = "lazy";
      imgContainer.appendChild(img);
      card.appendChild(imgContainer);
    } else if (type === "file") {
      const fileContainer = document.createElement("div");
      fileContainer.className = "item-content-file";

      (payload.paths || []).slice(0, 3).forEach((p: string) => {
        const fileRow = document.createElement("div");
        fileRow.className = "file-row";
        const icon = document.createElement("span");
        icon.className = "file-icon";
        icon.textContent = "📄";
        const pathSpan = document.createElement("span");
        pathSpan.className = "file-path";
        pathSpan.textContent = p;
        fileRow.appendChild(icon);
        fileRow.appendChild(pathSpan);
        fileContainer.appendChild(fileRow);
      });

      if ((payload.paths || []).length > 3) {
        const moreSpan = document.createElement("span");
        moreSpan.className = "file-path";
        moreSpan.textContent = `...and ${(payload.paths || []).length - 3} more files`;
        fileContainer.appendChild(moreSpan);
      }
      card.appendChild(fileContainer);
    }

    card.onclick = () => {
      if (currentFilter === "deleted") {
        return;
      }
      selectItem(actualItem.id);
    };

    // Hover is one of the two traversals of the same flow: it moves the
    // selection to the card under the cursor. While an anchor is set
    // (keyboard takeover, or right after a copy re-rendered the list under
    // a parked cursor), only a pointer that actually moved re-engages hover.
    card.addEventListener("mouseenter", (e) => {
      if (hoverResizeGuard) return;
      hoverCard(actualItem.id, e.clientX, e.clientY);
    });

    historyList.appendChild(card);
    } catch (e) {
      console.error("Error rendering item:", e, item);
    }
  });

  // Jump instantly: a smooth animation restarts on every arrow key (and
  // key-repeat), so the list perpetually trails the highlight.
  const activeEl = historyList.querySelector(".history-item.selected") as HTMLElement | null;
  if (activeEl) {
    activeEl.scrollIntoView({ block: "nearest", behavior: "instant" });
  }
}

async function selectItem(id: string) {
  try {
    await invoke("select_item", { id });
    // The copy bumped this entry to the top of history — follow it there:
    // highlight index 0 and scroll to top (persisting across hide/show,
    // since the DOM survives), and ignore hover at the parked cursor so
    // the re-render can't stomp the selection back.
    selectedIndex = 0;
    hoverAnchor = lastPointer;
    filterAndRender();
    // Unpinned: Rust hid the window — restore the pre-preview geometry
    // while it's invisible. Pinned: the window stays open, so the panel
    // (and geometry) follow their normal lifetime instead.
    if (!isPinned) previewDismiss();
  } catch (err) {
    console.error("Failed to select item:", err);
  }
}

async function deleteItem(id: string) {
  try {
    const item = history.find((i) => i.id === id);
    if (item?.pinned) {
      console.warn("Cannot delete pinned item");
      return;
    }
    await invoke("delete_item", { id, ttlSeconds: 60 });
    history = history.filter((i) => i.id !== id);
    await loadDeleted();
    updateCounts();
    filterAndRender();
  } catch (err) {
    console.error("Failed to delete item:", err);
  }
}

async function restoreFromDeleted(id: string) {
  try {
    const restored = await invoke<ClipboardItem>("restore_from_deleted", { id });
    deletedItems = deletedItems.filter((i) => i.id !== id);
    // Add to history
    history = [restored, ...history.filter((i) => i.id !== restored.id)];
    updateCounts();
    filterAndRender();
  } catch (err) {
    console.error("Failed to restore from deleted:", err);
  }
}

async function deletePermanentlyFromDeleted(id: string) {
  try {
    await invoke("delete_permanently_from_deleted", { id });
    deletedItems = deletedItems.filter((i) => i.id !== id);
    updateCounts();
    filterAndRender();
  } catch (err) {
    console.error("Failed to permanently delete:", err);
  }
}

async function loadDeleted() {
  try {
    const res = await invoke<any[]>("get_deleted");
    console.log("Loaded deleted items raw:", res);
    deletedItems = res;
    console.log("Loaded deleted items:", deletedItems.length, deletedItems);
    updateCounts();
  } catch (err) {
    console.error("Failed to load deleted items:", err);
  }
}

async function togglePin(id: string) {
  try {
    const item = history.find((i) => i.id === id);
    if (!item) return;
    item.pinned = !item.pinned;
    await invoke("toggle_pin", { id, pinned: item.pinned });
    updateCounts();
    filterAndRender();
  } catch (err) {
    console.error("Failed to toggle pin:", err);
  }
}

async function clearView() {
  // Clear only what the user is currently looking at (active tab + search),
  // and never pinned entries — those must be unlocked first.
  if (currentFilter === "deleted") {
    try {
      for (const item of filteredHistory as any[]) {
        await invoke("delete_permanently_from_deleted", { id: item.id });
      }
      await loadDeleted();
      updateCounts();
      filterAndRender();
    } catch (err) {
      console.error("Failed to clear deleted items:", err);
    }
    return;
  }
  const ids = (filteredHistory as any[]).filter((i: any) => !i.pinned).map((i: any) => i.id);
  if (ids.length === 0) return;
  try {
    const removed = await invoke<string[]>("clear_history", { ids, ttlSeconds: 60 });
    const gone = new Set(removed);
    history = history.filter((i) => !gone.has(i.id));
    await loadDeleted();
    updateCounts();
    filterAndRender();
  } catch (err) {
    console.error("Failed to clear history:", err);
  }
}

/** Keep the trash button's tooltip honest about its scope. */
function updateClearButtonState() {
  if (currentFilter === "deleted") {
    const clearable = filteredHistory.length;
    clearBtn.disabled = clearable === 0;
    clearBtn.title = clearable === 0 ? "Nothing to delete permanently" : "Delete permanently from Deleted tab";
    return;
  }
  const clearable = (filteredHistory as any[]).filter((i: any) => !i.pinned).length;
  const scope = searchQuery.trim()
    ? "matching items"
    : currentFilter === "all"
      ? "all unpinned items"
      : `${currentFilter} items`;
  clearBtn.disabled = clearable === 0;
  clearBtn.title =
    clearable === 0
      ? "Nothing to clear here (pinned entries are kept)"
      : `Move ${scope} to Deleted (pinned entries are kept)`;
}

async function fetchInitialHistory() {
  try {
    history = await invoke<ClipboardItem[]>("get_history");
    await loadDeleted();
    updateCounts();
    filterAndRender();
  } catch (err) {
    console.error("Failed to load initial history:", err);
  }
}

updateClearButtonState();

// --- Stationary-cursor guard ------------------------------------------------
// Hover and arrows move the same selection (hover IS selection). But a
// stationary cursor re-fires hover after every re-render, which would pin
// the selection next to the mouse — you couldn't arrow more than one card
// away, and a copy's bump re-render would steal the selection back from
// the top. So hover re-engages only when the pointer physically moves:
// same-coordinate re-dispatches are discarded via an anchor set at
// keyboard takeover and after a copy. The first arrow key additionally
// hides the cursor (CSS) until the pointer moves.
let keyboardOwns = false;
let hoverAnchor: { x: number; y: number } | null = null;
let lastPointer = { x: 0, y: 0 };

// A native resize can slide list content under a parked cursor: Chrome then
// re-hit-tests the layout and fires mousemove/mouseenter at the new position
// even though the pointer never traveled there. Hover must not act on those
// events, or shrinking the window pops the preview open mid-drag (user-
// reported). Arm this on every user resize and keep it until the pointer has
// produced two distinct positions - proof of real movement, which synthetic
// re-hit-tests never do.
let hoverResizeGuard = false;
let hoverGuardPos: { x: number; y: number } | null = null;

function armHoverResizeGuard(): void {
  hoverResizeGuard = true;
  hoverGuardPos = null;
}

/** Move the selection/preview to a card as a direct result of hovering it. */
function hoverCard(id: string, x: number, y: number): void {
  if (hoverAnchor && x === hoverAnchor.x && y === hoverAnchor.y) return;
  hoverAnchor = null;
  if (keyboardOwns) releaseKeyboard();
  const idx = filteredHistory.findIndex((i) => i.id === id);
  if (idx === -1) return;
  if (idx !== selectedIndex) {
    selectedIndex = idx;
    renderList();
  }
  previewSelectionChanged(); // hovering the already-selected card still opens the panel
}

function takeOverForKeyboard(): void {
  hoverAnchor = lastPointer;
  if (!keyboardOwns) {
    keyboardOwns = true;
    document.body.classList.add("keyboard-nav");
  }
}

function releaseKeyboard(): void {
  hoverAnchor = null;
  if (!keyboardOwns) return;
  keyboardOwns = false;
  document.body.classList.remove("keyboard-nav");
}

window.addEventListener("mousemove", (e) => {
  lastPointer = { x: e.clientX, y: e.clientY };
  if (hoverResizeGuard) {
    if (!hoverGuardPos) {
      hoverGuardPos = { x: e.clientX, y: e.clientY };
    } else if (e.clientX !== hoverGuardPos.x || e.clientY !== hoverGuardPos.y) {
      // Real movement: the user owns the pointer again. Re-evaluate whatever
      // is under it - the blocked mouseenter will not fire a second time when
      // the pointer already sits on that card.
      hoverResizeGuard = false;
      const el = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)
        ?.closest(".history-item") as HTMLElement | null;
      const id = el?.dataset.id;
      if (id) hoverCard(id, e.clientX, e.clientY);
    }
  }
  if (keyboardOwns && hoverAnchor && (e.clientX !== hoverAnchor.x || e.clientY !== hoverAnchor.y)) {
    releaseKeyboard();
  }
});

/** Apply an arrow/enter key to the list selection. Shared by the main
 *  window's own key handling and by keys forwarded from the preview window. */
function cycleFilterTab(delta: number): void {
  const tabs = Array.from(filterTabs);
  const idx = tabs.findIndex((t) => t.classList.contains("active"));
  if (idx === -1 || tabs.length === 0) return;
  const next = (idx + delta + tabs.length) % tabs.length;
  tabs[next].click();
  setTimeout(() => {
    tabs[next].scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
  }, 10);
}

function handleListKey(key: string): void {
  if (key === "ArrowDown") {
    if (filteredHistory.length > 0) {
      takeOverForKeyboard();
      selectedIndex = Math.min(selectedIndex + 1, filteredHistory.length - 1);
      renderList();
      previewSelectionChanged();
    }
  } else if (key === "ArrowUp") {
    if (filteredHistory.length > 0) {
      takeOverForKeyboard();
      selectedIndex = Math.max(selectedIndex - 1, 0);
      renderList();
      previewSelectionChanged();
    }
  } else if (key === "Home") {
    if (filteredHistory.length > 0) {
      takeOverForKeyboard();
      selectedIndex = 0;
      renderList();
      previewSelectionChanged();
    }
  } else if (key === "End") {
    if (filteredHistory.length > 0) {
      takeOverForKeyboard();
      selectedIndex = filteredHistory.length - 1;
      renderList();
      previewSelectionChanged();
    }
  } else if (key === "PageDown") {
    if (filteredHistory.length > 0) {
      takeOverForKeyboard();
      selectedIndex = Math.min(selectedIndex + 10, filteredHistory.length - 1);
      renderList();
      previewSelectionChanged();
    }
  } else if (key === "PageUp") {
    if (filteredHistory.length > 0) {
      takeOverForKeyboard();
      selectedIndex = Math.max(selectedIndex - 10, 0);
      renderList();
      previewSelectionChanged();
    }
  } else if (key === "Enter") {
    // One flow: Enter always copies the highlighted item — whichever input
    // (hover or arrows) last moved the highlight.
    const target = filteredHistory[selectedIndex];
    if (target) {
      selectItem(target.id);
    }
  }
}

// Keyboard Navigation
window.addEventListener("keydown", (e) => {
  const navKey =
    e.key === "ArrowDown" ||
    e.key === "ArrowUp" ||
    e.key === "Enter" ||
    e.key === "Home" ||
    e.key === "End" ||
    e.key === "PageUp" ||
    e.key === "PageDown";
  // Modifier+arrow means "extend the text selection in the preview", not
  // "move the list selection" — leave those to the browser.
  const modified = e.shiftKey || e.ctrlKey || e.metaKey || e.altKey;

  // In the preview window the keys belong to the main window's list: forward
  // them so arrow traversal keeps working while the pointer is in the preview
  // (the preview has focus so the user can select text).
  if (isPreviewWindow) {
    if (navKey && !modified) {
      e.preventDefault();
      void emitTo("main", "preview-forward-key", { key: e.key }).catch(() => {});
    } else if (e.key === "Escape") {
      // Escape closes the app from the preview window too.
      e.preventDefault();
      void emitTo("main", "preview-forward-key", { key: "Escape" }).catch(() => {});
    } else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && !modified) {
      e.preventDefault();
      void emitTo("main", "preview-forward-key", { key: e.key }).catch(() => {});
    }
    return;
  }
  if (e.key === "Escape") {
    e.preventDefault();
    // Hide first, then restore the pre-preview geometry while invisible.
    invoke("hide_window").then(() => previewDismiss()).catch(() => {});
  } else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && !modified) {
    e.preventDefault();
    cycleFilterTab(e.key === "ArrowRight" ? 1 : -1);
  } else if (navKey && !modified) {
    e.preventDefault();
    handleListKey(e.key);
  }
});

// Keys pressed while the preview window has focus (the user is selecting text
// there) still drive the main list.
void listen<{ key: string }>("preview-forward-key", (event) => {
  if (isPreviewWindow) return;
  if (event.payload.key === "Escape") {
    invoke("hide_window").then(() => previewDismiss()).catch(() => {});
    return;
  }
  if (event.payload.key === "ArrowLeft" || event.payload.key === "ArrowRight") {
    cycleFilterTab(event.payload.key === "ArrowRight" ? 1 : -1);
    return;
  }
  handleListKey(event.payload.key);
}).catch(() => {});

// Search input events
searchInput.addEventListener("input", () => {
  searchQuery = searchInput.value;
  searchClearBtn.style.display = searchQuery ? "flex" : "none";
  selectedIndex = 0;
  filterAndRender();
});

searchClearBtn.addEventListener("click", () => {
  searchInput.value = "";
  searchQuery = "";
  searchClearBtn.style.display = "none";
  selectedIndex = 0;
  filterAndRender();
  searchInput.focus();
});

// Filter Tabs
filterTabs.forEach((tab) => {
  tab.addEventListener("click", async () => {
    filterTabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    currentFilter = tab.getAttribute("data-filter") as "all" | "pinned" | "text" | "image" | "file" | "deleted";
    selectedIndex = 0;
    if (currentFilter === "deleted") {
      await loadDeleted();
    }
    filterAndRender();
    searchInput.focus();
  });
});

// Header action buttons
pauseBtn.addEventListener("click", async () => {
  isPaused = !isPaused;
  await invoke("set_listening_paused", { paused: isPaused });
  if (isPaused) {
    pauseBtn.classList.add("active");
    pauseBtn.innerHTML = "▶️";
    pauseBtn.title = "Resume clipboard listening";
    document.body.classList.add("paused");
  } else {
    pauseBtn.classList.remove("active");
    pauseBtn.innerHTML = "⏸️";
    pauseBtn.title = "Pause clipboard listening";
    document.body.classList.remove("paused");
  }
});

pinBtn.addEventListener("click", async () => {
  isPinned = !isPinned;
  await invoke("set_pinned", { pinned: isPinned });
  pinBtn.classList.toggle("active", isPinned);
  pinBtn.title = isPinned ? "Pinned: Window stays open on blur" : "Unpinned: Window hides on blur";
});

clearBtn.addEventListener("click", () => {
  clearView();
});

closeBtn.addEventListener("click", () => {
  invoke("hide_window").then(() => previewDismiss()).catch(() => {});
});

// Resize grip — borderless windows are hard to grab at the edges,
// so provide an explicit grip in the bottom-right corner.
const resizeGrip = document.getElementById("resize-grip") as HTMLElement;
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
  invoke("set_interacting", { interacting: true }).catch(() => {});
  op().finally(() => {
    // Small delay: focus events can arrive just after the modal loop ends
    setTimeout(() => {
      invoke("set_interacting", { interacting: false }).catch(() => {});
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
  if ((e.target as HTMLElement).closest("button")) return;
  if ((e.target as HTMLElement).closest(".header-actions")) return;
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
  if (target.closest("button") || target.closest(".icon-btn")) return;
  if (target.closest(".header-actions")) return;
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
    } else {
      await win.maximize();
    }
  } catch (err) {
    console.error("Failed to toggle maximize:", err);
  }
});

// Window focus event
window.addEventListener("focus", () => {
  searchInput.focus();
  searchInput.select();
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
  .catch(() => {});

// Setup real-time clipboard listener
async function setupListener() {
  await listen<ClipboardItem>("clipboard-updated", (event) => {
    const newItem = event.payload;
    // If item was in deleted, remove it from deleted
    deletedItems = deletedItems.filter((i) => i.id !== newItem.id);
    // Prepend new item
    history = [newItem, ...history.filter((i) => i.id !== newItem.id)];
    if (history.length > 100) history = history.slice(0, 100);
    updateCounts();
    filterAndRender();
  });
  // Each window session starts mouse-ready: keyboard takeover ends on hide.
  await listen("window-hidden", () => releaseKeyboard());
}

// Periodically refresh deleted items and purge expired
setInterval(async () => {
  try {
    await invoke("purge_expired_deleted");
    await loadDeleted();
    filterAndRender();
  } catch (err) {
    // ignore
  }
}, 5000);

// Initialization
window.addEventListener("DOMContentLoaded", () => {
  const label = getCurrentWindow().label;

  // The preview window loads the same bundle but renders only the preview
  // panel; initPreview() branches on the window label internally.
  initPreview({
    getSelected: () => filteredHistory[selectedIndex] ?? null,
  });

  if (label === "preview") return;

  searchInput.focus();
  fetchInitialHistory();
  setupListener();
});
