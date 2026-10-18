import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface TextPayload {
  text: string;
  preview: string;
  char_count: number;
  line_count: number;
}

interface ImagePayload {
  data_url: string;
  thumbnail?: string | null;
  width: number;
  height: number;
  byte_size: number;
}

interface FilePayload {
  paths: string[];
  count: number;
  preview: string;
}

type ClipboardPayload =
  | { type: "text"; payload: TextPayload }
  | { type: "image"; payload: ImagePayload }
  | { type: "file"; payload: FilePayload };

type ClipboardItem = {
  id: string;
  timestamp: number;
} & ClipboardPayload;

let history: ClipboardItem[] = [];
let filteredHistory: ClipboardItem[] = [];
let selectedIndex = 0;
let currentFilter: "all" | "text" | "image" | "file" = "all";
let searchQuery = "";
let isPinned = false;

// DOM Elements
const searchInput = document.getElementById("search-input") as HTMLInputElement;
const searchClearBtn = document.getElementById("search-clear-btn") as HTMLButtonElement;
const historyList = document.getElementById("history-list") as HTMLDivElement;
const emptyState = document.getElementById("empty-state") as HTMLDivElement;
const filterTabs = document.querySelectorAll<HTMLButtonElement>(".filter-tab");
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

function updateCounts() {
  const total = history.length;
  const text = history.filter((i) => i.type === "text").length;
  const img = history.filter((i) => i.type === "image").length;
  const file = history.filter((i) => i.type === "file").length;

  if (countAll) countAll.textContent = total.toString();
  if (countText) countText.textContent = text.toString();
  if (countImage) countImage.textContent = img.toString();
  if (countFile) countFile.textContent = file.toString();
}

function filterAndRender() {
  const query = searchQuery.trim().toLowerCase();

  filteredHistory = history.filter((item) => {
    // Check type filter
    if (currentFilter !== "all" && item.type !== currentFilter) {
      return false;
    }

    // Check search query
    if (!query) return true;

    if (item.type === "text") {
      return item.payload.text.toLowerCase().includes(query);
    } else if (item.type === "file") {
      return item.payload.paths.some((p) => p.toLowerCase().includes(query));
    } else if (item.type === "image") {
      return "image".includes(query) || `${item.payload.width}x${item.payload.height}`.includes(query);
    }
    return true;
  });

  if (selectedIndex >= filteredHistory.length) {
    selectedIndex = Math.max(0, filteredHistory.length - 1);
  }

  renderList();
}

function renderList() {
  if (filteredHistory.length === 0) {
    historyList.innerHTML = "";
    emptyState.style.display = "flex";
    if (searchQuery) {
      emptyState.querySelector(".empty-title")!.textContent = "No matches found";
      emptyState.querySelector(".empty-desc")!.textContent = `No items found matching "${searchQuery}"`;
    } else {
      emptyState.querySelector(".empty-title")!.textContent = "Clipboard History is Empty";
      emptyState.querySelector(".empty-desc")!.innerHTML = "Copy text, images, or files anywhere in Windows.<br/>Clippy will automatically capture them!";
    }
    return;
  }

  emptyState.style.display = "none";
  historyList.innerHTML = "";

  filteredHistory.forEach((item, index) => {
    const card = document.createElement("div");
    card.className = `history-item ${index === selectedIndex ? "selected" : ""}`;
    card.setAttribute("data-id", item.id);

    // Meta row
    const headerRow = document.createElement("div");
    headerRow.className = "item-header";

    const metaLeft = document.createElement("div");
    metaLeft.className = "item-meta-left";

    const badge = document.createElement("span");
    badge.className = `item-badge badge-${item.type}`;
    badge.textContent = item.type;

    const time = document.createElement("span");
    time.className = "item-time";
    time.textContent = formatTime(item.timestamp);

    const details = document.createElement("span");
    details.className = "item-details";

    if (item.type === "text") {
      details.textContent = `${item.payload.char_count} chars • ${item.payload.line_count} line${item.payload.line_count > 1 ? "s" : ""}`;
    } else if (item.type === "image") {
      const kb = Math.round(item.payload.byte_size / 1024);
      details.textContent = `${item.payload.width}×${item.payload.height}px • ${kb} KB`;
    } else if (item.type === "file") {
      details.textContent = `${item.payload.count} file${item.payload.count > 1 ? "s" : ""}`;
    }

    metaLeft.appendChild(badge);
    metaLeft.appendChild(time);
    metaLeft.appendChild(details);

    const actions = document.createElement("div");
    actions.className = "item-actions";

    const copyBtn = document.createElement("button");
    copyBtn.className = "item-action-btn";
    copyBtn.textContent = "Copy";
    copyBtn.title = "Copy to clipboard (Enter)";
    copyBtn.onclick = (e) => {
      e.stopPropagation();
      selectItem(item.id);
    };

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "item-action-btn btn-delete";
    deleteBtn.textContent = "✕";
    deleteBtn.title = "Delete from history";
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      deleteItem(item.id);
    };

    actions.appendChild(copyBtn);
    actions.appendChild(deleteBtn);

    headerRow.appendChild(metaLeft);
    headerRow.appendChild(actions);
    card.appendChild(headerRow);

    // Content body
    if (item.type === "text") {
      const textPreview = document.createElement("div");
      textPreview.className = "item-content-text";
      textPreview.textContent = item.payload.preview || item.payload.text;
      card.appendChild(textPreview);
    } else if (item.type === "image") {
      const imgContainer = document.createElement("div");
      imgContainer.className = "item-content-image";
      const img = document.createElement("img");
      // Prefer the pre-rendered thumbnail; full data_url is the fallback
      // (and what restore uses — that path stays Rust-side).
      img.src = item.payload.thumbnail || item.payload.data_url;
      img.alt = "Clipboard image preview";
      img.loading = "lazy";
      imgContainer.appendChild(img);
      card.appendChild(imgContainer);
    } else if (item.type === "file") {
      const fileContainer = document.createElement("div");
      fileContainer.className = "item-content-file";

      item.payload.paths.slice(0, 3).forEach((p) => {
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

      if (item.payload.paths.length > 3) {
        const moreSpan = document.createElement("span");
        moreSpan.className = "file-path";
        moreSpan.textContent = `...and ${item.payload.paths.length - 3} more files`;
        fileContainer.appendChild(moreSpan);
      }
      card.appendChild(fileContainer);
    }

    card.onclick = () => {
      selectItem(item.id);
    };

    historyList.appendChild(card);
  });

  // Ensure selected item is scrolled into view
  const activeEl = historyList.querySelector(".history-item.selected") as HTMLElement | null;
  if (activeEl) {
    activeEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}

async function selectItem(id: string) {
  try {
    await invoke("select_item", { id });
  } catch (err) {
    console.error("Failed to select item:", err);
  }
}

async function deleteItem(id: string) {
  try {
    await invoke("delete_item", { id });
    history = history.filter((i) => i.id !== id);
    updateCounts();
    filterAndRender();
  } catch (err) {
    console.error("Failed to delete item:", err);
  }
}

async function clearAll() {
  try {
    await invoke("clear_history");
    history = [];
    updateCounts();
    filterAndRender();
  } catch (err) {
    console.error("Failed to clear history:", err);
  }
}

async function fetchInitialHistory() {
  try {
    history = await invoke<ClipboardItem[]>("get_history");
    updateCounts();
    filterAndRender();
  } catch (err) {
    console.error("Failed to load initial history:", err);
  }
}

// Keyboard Navigation
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    e.preventDefault();
    invoke("hide_window");
  } else if (e.key === "ArrowDown") {
    e.preventDefault();
    if (filteredHistory.length > 0) {
      selectedIndex = Math.min(selectedIndex + 1, filteredHistory.length - 1);
      renderList();
    }
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    if (filteredHistory.length > 0) {
      selectedIndex = Math.max(selectedIndex - 1, 0);
      renderList();
    }
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (filteredHistory.length > 0 && selectedIndex < filteredHistory.length) {
      selectItem(filteredHistory[selectedIndex].id);
    }
  }
});

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
  tab.addEventListener("click", () => {
    filterTabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    currentFilter = tab.getAttribute("data-filter") as "all" | "text" | "image" | "file";
    selectedIndex = 0;
    filterAndRender();
    searchInput.focus();
  });
});

// Header action buttons
pinBtn.addEventListener("click", async () => {
  isPinned = !isPinned;
  await invoke("set_pinned", { pinned: isPinned });
  pinBtn.classList.toggle("active", isPinned);
  pinBtn.title = isPinned ? "Pinned: Window stays open on blur" : "Unpinned: Window hides on blur";
});

clearBtn.addEventListener("click", () => {
  clearAll();
});

closeBtn.addEventListener("click", () => {
  invoke("hide_window");
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
  invoke("set_interacting", { interacting: true }).catch(() => {});
  op().finally(() => {
    // Small delay: focus events can arrive just after the modal loop ends
    setTimeout(() => invoke("set_interacting", { interacting: false }).catch(() => {}), 150);
  });
}

// Window dragging — data-tauri-drag-region doesn't fire for child elements
// (spans, buttons), so explicitly start dragging from the header area.
const headerEl = document.querySelector(".clippy-header") as HTMLElement;
headerEl.addEventListener("mousedown", (e) => {
  // Don't drag when interacting with the header action buttons
  if ((e.target as HTMLElement).closest("button")) return;
  e.preventDefault();
  runNativeDrag(() => getCurrentWindow().startDragging());
});

// Double-click the header toggles maximize/restore
headerEl.addEventListener("dblclick", (e) => {
  if ((e.target as HTMLElement).closest("button")) return;
  const win = getCurrentWindow();
  win.isMaximized().then((max) => {
    if (max) win.unmaximize();
    else win.maximize();
  });
});

// Window focus event
window.addEventListener("focus", () => {
  searchInput.focus();
  searchInput.select();
});

// Setup real-time clipboard listener
async function setupListener() {
  await listen<ClipboardItem>("clipboard-updated", (event) => {
    const newItem = event.payload;
    // Prepend new item
    history = [newItem, ...history.filter((i) => i.id !== newItem.id)];
    if (history.length > 100) history = history.slice(0, 100);
    updateCounts();
    filterAndRender();
  });
}

// Initialization
window.addEventListener("DOMContentLoaded", () => {
  searchInput.focus();
  fetchInitialHistory();
  setupListener();
});
