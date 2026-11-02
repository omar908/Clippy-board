import type { Store } from "../state/store";
import type { AppElements } from "./elements";
import { previewSelectionChanged } from "../preview";

export function createSelectionController(store: Store, elements: AppElements, callbacks: { renderList: () => void; selectItem: (id: string) => void }) {
  const { filterTabs } = elements;
  const { renderList, selectItem } = callbacks;
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
  let hoverAnchor: {
    x: number;
    y: number;
  } | null = null;
  let lastPointer = { x: 0, y: 0 };
  // A native resize can slide list content under a parked cursor: Chrome then
  // re-hit-tests the layout and fires mousemove/mouseenter at the new position
  // even though the pointer never traveled there. Hover must not act on those
  // events, or shrinking the window pops the preview open mid-drag (user-
  // reported). Arm this on every user resize and keep it until the pointer has
  // produced two distinct positions - proof of real movement, which synthetic
  // re-hit-tests never do.
  let hoverResizeGuard = false;
  let hoverGuardPos: {
    x: number;
    y: number;
  } | null = null;
  function armHoverResizeGuard(): void {
    hoverResizeGuard = true;
    hoverGuardPos = null;
  }
  /** Move the selection/preview to a card as a direct result of hovering it. */
  function hoverCard(id: string, x: number, y: number): void {
    if (hoverAnchor && x === hoverAnchor.x && y === hoverAnchor.y)
      return;
    hoverAnchor = null;
    if (keyboardOwns)
      releaseKeyboard();
    const idx = store.get().filteredHistory.findIndex((i) => i.id === id);
    if (idx === -1)
      return;
    if (idx !== store.get().selectedIndex) {
      store.set({ selectedIndex: idx });
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
    if (!keyboardOwns)
      return;
    keyboardOwns = false;
    document.body.classList.remove("keyboard-nav");
  }
  window.addEventListener("mousemove", (e) => {
    lastPointer = { x: e.clientX, y: e.clientY };
    if (hoverResizeGuard) {
      if (!hoverGuardPos) {
        hoverGuardPos = { x: e.clientX, y: e.clientY };
      }
      else if (e.clientX !== hoverGuardPos.x || e.clientY !== hoverGuardPos.y) {
        // Real movement: the user owns the pointer again. Re-evaluate whatever
        // is under it - the blocked mouseenter will not fire a second time when
        // the pointer already sits on that card.
        hoverResizeGuard = false;
        const el = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)
          ?.closest(".history-item") as HTMLElement | null;
        const id = el?.dataset.id;
        if (id)
          hoverCard(id, e.clientX, e.clientY);
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
    if (idx === -1 || tabs.length === 0)
      return;
    const next = (idx + delta + tabs.length) % tabs.length;
    tabs[next].click();
    setTimeout(() => {
      tabs[next].scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
    }, 10);
  }
  function handleListKey(key: string): void {
    if (key === "ArrowDown") {
      if (store.get().filteredHistory.length > 0) {
        takeOverForKeyboard();
        store.set({ selectedIndex: Math.min(store.get().selectedIndex + 1, store.get().filteredHistory.length - 1) });
        renderList();
        previewSelectionChanged();
      }
    }
    else if (key === "ArrowUp") {
      if (store.get().filteredHistory.length > 0) {
        takeOverForKeyboard();
        store.set({ selectedIndex: Math.max(store.get().selectedIndex - 1, 0) });
        renderList();
        previewSelectionChanged();
      }
    }
    else if (key === "Home") {
      if (store.get().filteredHistory.length > 0) {
        takeOverForKeyboard();
        store.set({ selectedIndex: 0 });
        renderList();
        previewSelectionChanged();
      }
    }
    else if (key === "End") {
      if (store.get().filteredHistory.length > 0) {
        takeOverForKeyboard();
        store.set({ selectedIndex: store.get().filteredHistory.length - 1 });
        renderList();
        previewSelectionChanged();
      }
    }
    else if (key === "PageDown") {
      if (store.get().filteredHistory.length > 0) {
        takeOverForKeyboard();
        store.set({ selectedIndex: Math.min(store.get().selectedIndex + 10, store.get().filteredHistory.length - 1) });
        renderList();
        previewSelectionChanged();
      }
    }
    else if (key === "PageUp") {
      if (store.get().filteredHistory.length > 0) {
        takeOverForKeyboard();
        store.set({ selectedIndex: Math.max(store.get().selectedIndex - 10, 0) });
        renderList();
        previewSelectionChanged();
      }
    }
    else if (key === "Enter") {
      // One flow: Enter always copies the highlighted item — whichever input
      // (hover or arrows) last moved the highlight.
      const target = store.get().filteredHistory[store.get().selectedIndex];
      if (target) {
        selectItem(target.id);
      }
    }
  }

  function anchorAfterCopy() { hoverAnchor = lastPointer; }
  function isHoverBlocked() { return hoverResizeGuard; }

  return { hoverCard, releaseKeyboard, armHoverResizeGuard, cycleFilterTab, handleListKey, anchorAfterCopy, isHoverBlocked };
}

export type SelectionController = ReturnType<typeof createSelectionController>;
