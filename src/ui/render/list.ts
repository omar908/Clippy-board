import type { AppState } from "../../state/store";
import type { AppElements } from "../elements";
import { createItemCard, renderItemMeta, renderTime, renderActions } from "./item";
import { renderTextContent, renderImageContent, renderFileContent } from "./content";
import { renderEmptyState } from "./empty";
import { renderClipboardStatus } from "./clipboard-status";

export type ListActions = {
  selectItem: (id: string) => void;
  togglePin: (id: string) => void;
  deleteItem: (id: string) => void;
  restoreFromDeleted: (id: string) => void;
  deletePermanentlyFromDeleted: (id: string) => void;
  hoverCard: (id: string, x: number, y: number) => void;
  isHoverBlocked: () => boolean;
};

export function renderList(elements: AppElements, getState: () => Readonly<AppState>, actions: ListActions) {
  const state = getState();
  const { historyList, emptyState, emptyTitle, emptyDesc, emptyTitleDefault, emptyDescDefault } = elements;
  console.log("Rendering list, currentFilter:", state.currentFilter, "filteredHistory length:", state.filteredHistory.length);
  if (state.filteredHistory.length === 0) {
    historyList.innerHTML = "";
    renderEmptyState(emptyState, emptyTitle, emptyDesc, {
      hasSearch: Boolean(state.searchQuery),
      searchQuery: state.searchQuery,
      currentFilter: state.currentFilter,
      pinnedHidden: !state.showPinnedInAll && state.history.some(item => item.pinned),
      emptyTitleDefault, emptyDescDefault,
    });
    return;
  }
  emptyState.style.display = "none";
  historyList.innerHTML = "";
  state.filteredHistory.forEach((item, index) => {
    try {
      const actualItem = item;
      const type = actualItem.type;
      const card = createItemCard(actualItem, index, state.selectedIndex);
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
      renderTime(actualItem, time);
      if (actualItem.pinned) {
        const pinBadge = document.createElement("span");
        pinBadge.className = "item-pin-badge";
        pinBadge.textContent = "📌";
        pinBadge.title = "Pinned (locked)";
        metaLeft.appendChild(pinBadge);
      }
      const details = document.createElement("span");
      details.className = "item-details";
      renderItemMeta(actualItem, details);
      metaLeft.appendChild(badge);
      metaLeft.appendChild(time);
      if (type === "text" || type === "image" || type === "file") {
        metaLeft.appendChild(details);
      }
      const actionsEl = document.createElement("div");
      actionsEl.className = "item-actions";
      renderActions(actualItem, actionsEl, state.currentFilter, () => actions.togglePin(actualItem.id), () => actions.deleteItem(actualItem.id), () => actions.restoreFromDeleted(actualItem.id), () => actions.deletePermanentlyFromDeleted(actualItem.id));
      headerRow.appendChild(metaLeft);
      headerRow.appendChild(actionsEl);
      card.appendChild(headerRow);
      // Content body
      if (type === "text" || type === "image" || type === "file") {
        const content = document.createElement("div");
        content.className = `item-content-${type}`;
        if (type === "text")
          renderTextContent(actualItem.payload, content);
        else if (type === "image")
          renderImageContent(actualItem.payload, content);
        else
          renderFileContent(actualItem.payload, content);
        card.appendChild(content);
      }
      card.onclick = () => {
        actions.selectItem(actualItem.id);
      };
      // Hover is one of the two traversals of the same flow: it moves the
      // selection to the card under the cursor. While an anchor is set
      // (keyboard takeover, or right after a copy re-rendered the list under
      // a parked cursor), only a pointer that actually moved re-engages hover.
      card.addEventListener("mouseenter", (e) => {
        if (actions.isHoverBlocked())
          return;
        actions.hoverCard(actualItem.id, e.clientX, e.clientY);
      });
      historyList.appendChild(card);
    }
    catch {
      console.error("Error rendering clipboard item.");
    }
  });
  renderClipboardStatus(historyList, state.currentClipboardId);
  // Jump instantly: a smooth animation restarts on every arrow key (and
  // key-repeat), so the list perpetually trails the highlight.
  const activeEl = historyList.querySelector(".history-item.selected") as HTMLElement | null;
  if (activeEl) {
    activeEl.scrollIntoView({ block: "nearest", behavior: "instant" });
  }
}
