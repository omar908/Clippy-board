import type { ClipboardItem } from "../../types";

export function renderList(
  historyList: HTMLElement,
  filteredHistory: ClipboardItem[],
  selectedIndex: number,
  currentFilter: string,
  _deletedCount: number,
  actions: {
    onSelect: (id: string) => void;
    onHover: (id: string, x: number, y: number) => void;
    onTogglePin: (id: string) => void;
    onDelete: (id: string) => void;
    onRestore: (id: string) => void;
    onDeletePermanent: (id: string) => void;
  }
) {
  historyList.innerHTML = "";
  if (filteredHistory.length === 0) {
    return;
  }
  filteredHistory.forEach((item, idx) => {
    const card = document.createElement("div");
    card.className = "history-item" + (idx === selectedIndex ? " selected" : "");
    card.dataset.id = item.id;
    // Basic rendering - will be expanded
    const content = document.createElement("div");
    content.className = "item-content";
    card.appendChild(content);
    card.onclick = () => {
      if (currentFilter !== "deleted") {
        actions.onSelect(item.id);
      }
    };
    card.onmouseenter = (e) => {
      actions.onHover(item.id, e.clientX, e.clientY);
    };
    historyList.appendChild(card);
  });
}
