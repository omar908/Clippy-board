import type { ClipboardPayload } from "../../types";
import type { AppFilter, DisplayItem } from "../../state/store";
import { formatTime, formatTTL } from "../../utils/format";

export function createItemCard(item: Pick<DisplayItem, "id" | "pinned">, index: number, selectedIndex: number) {
  const card = document.createElement("div");
  card.className = `history-item ${index === selectedIndex ? "selected" : ""} ${item.pinned ? "pinned" : ""}`;
  card.setAttribute("data-id", item.id);

  return card;
}

export function renderItemMeta(item: ClipboardPayload, metaEl: HTMLElement) {
  const { type, payload } = item;
  if (type === "text") {
    metaEl.textContent = `${payload.char_count} chars • ${payload.line_count} line${payload.line_count > 1 ? "s" : ""}`;
  } else if (type === "image") {
    const kb = Math.round(payload.byte_size / 1024);
    metaEl.textContent = `${payload.width}×${payload.height}px • ${kb} KB`;
  } else if (type === "file") {
    metaEl.textContent = `${payload.count} file${payload.count > 1 ? "s" : ""}`;
  }
}

export function renderTime(item: DisplayItem, timeEl: HTMLElement) {
  if ("deleted_at" in item) {
    timeEl.textContent = formatTTL(item.deleted_at || Date.now() + 60000);
  } else {
    timeEl.textContent = formatTime(item.timestamp);
  }
}

export function renderPinButton(item: { pinned?: boolean }, pinBtn: HTMLButtonElement, onToggle: () => void) {
  pinBtn.className = "item-action-btn btn-pin";
  pinBtn.title = item.pinned ? "Unpin (unlock)" : "Pin (lock)";
  pinBtn.setAttribute("aria-label", item.pinned ? "Unpin" : "Pin");
  pinBtn.innerHTML = item.pinned ? "📌" : "📍";
  pinBtn.onclick = (e) => {
    e.stopPropagation();
    onToggle();
  };
}

export function renderActions(
  item: { pinned?: boolean },
  actionsEl: HTMLElement,
  currentFilter: AppFilter,
  onToggle: () => void,
  onDelete: () => void,
  onRestore: () => void,
  onDeletePermanent: () => void
) {
  actionsEl.innerHTML = "";
  if (currentFilter === "deleted") {
    // Undo button
    const undoBtn = document.createElement("button");
    undoBtn.className = "item-action-btn btn-undo";
    undoBtn.title = "Restore to original position without copying";
    undoBtn.setAttribute("aria-label", "Undo restore");
    undoBtn.innerHTML = "↶";
    undoBtn.onclick = (e) => {
      e.stopPropagation();
      onRestore();
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
      onDeletePermanent();
    };
    actionsEl.appendChild(undoBtn);
    actionsEl.appendChild(permDeleteBtn);
  } else {
    const pinBtnItem = document.createElement("button");
    renderPinButton(item, pinBtnItem, onToggle);

    // Delete button (disabled for pinned items)
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "item-action-btn btn-delete";
    if (item.pinned) {
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
      if (item.pinned) return;
      onDelete();
    };

    actionsEl.appendChild(pinBtnItem);
    actionsEl.appendChild(deleteBtn);
  }
}
