import { formatTime, formatTTL } from "../../utils/format";

export function createItemCard(item: any, index: number, selectedIndex: number) {
  const card = document.createElement("div");
  card.className = "history-item" + (index === selectedIndex ? " selected" : "");
  card.dataset.id = item.id;
  return card;
}

export function renderItemMeta(item: any, metaEl: HTMLElement) {
  try {
    const type = item.type;
    if (type === "text") {
      metaEl.textContent = item.char_count ? `${item.char_count} chars` : "";
    } else if (type === "image") {
      metaEl.textContent = "Image";
    } else if (type === "file") {
      metaEl.textContent = item.file_name || "File";
    }
  } catch {}
}

export function renderTime(item: any, timeEl: HTMLElement) {
  try {
    if (item.ttl_seconds !== undefined && item.ttl_seconds !== null && item.ttl_seconds > 0) {
      timeEl.textContent = formatTTL(item.ttl_seconds);
      timeEl.title = "Expires in";
      return;
    }
    timeEl.textContent = formatTime(item.timestamp || item.created_at);
  } catch {
    timeEl.textContent = "";
  }
}

export function renderPinButton(item: any, pinBtn: HTMLButtonElement, onToggle: () => void) {
  pinBtn.className = "pin-btn" + (item.pinned ? " pinned" : "");
  pinBtn.title = item.pinned ? "Unpin" : "Pin";
  pinBtn.onclick = (e) => {
    e.stopPropagation();
    onToggle();
  };
}

export function renderActions(item: any, actionsEl: HTMLElement, onDelete: () => void, onRestore?: () => void, onDeletePermanent?: () => void) {
  actionsEl.innerHTML = "";
  if (item._deleted || item.deleted) {
    if (onRestore) {
      const restoreBtn = document.createElement("button");
      restoreBtn.className = "restore-btn";
      restoreBtn.textContent = "Restore";
      restoreBtn.onclick = (e) => { e.stopPropagation(); onRestore(); };
      actionsEl.appendChild(restoreBtn);
    }
    if (onDeletePermanent) {
      const delBtn = document.createElement("button");
      delBtn.className = "delete-perm-btn";
      delBtn.textContent = "Delete Forever";
      delBtn.onclick = (e) => { e.stopPropagation(); onDeletePermanent(); };
      actionsEl.appendChild(delBtn);
    }
    return;
  }
  const deleteBtn = document.createElement("button");
  deleteBtn.className = "delete-btn";
  deleteBtn.textContent = "Delete";
  deleteBtn.onclick = (e) => { e.stopPropagation(); onDelete(); };
  actionsEl.appendChild(deleteBtn);
}

