export function updateCountsUI(
  historyCountEl: HTMLElement,
  deletedCountEl: HTMLElement,
  historyCount: number,
  deletedCount: number
) {
  historyCountEl.textContent = String(historyCount);
  deletedCountEl.textContent = String(deletedCount);
}
