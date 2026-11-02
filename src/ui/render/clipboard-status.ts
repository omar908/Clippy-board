/** Update status in place so a clipboard notification cannot steal selection. */
export function renderClipboardStatus(root: HTMLElement, currentId: string | null) {
  for (const card of root.querySelectorAll<HTMLElement>(".history-item")) {
    const current = currentId !== null && card.dataset.id === currentId;
    card.classList.toggle("on-clipboard", current);
    let badge = card.querySelector<HTMLElement>(".item-clipboard-badge");
    if (!current) { badge?.remove(); continue; }
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "item-clipboard-badge";
      badge.textContent = "On clipboard";
      badge.title = "This entry matches the current clipboard contents";
      card.querySelector(".item-meta-left")?.appendChild(badge);
    }
  }
}
