export function renderTabs(
  tabHistory: HTMLElement,
  tabDeleted: HTMLElement,
  currentFilter: string
) {
  if (currentFilter === "deleted") {
    tabDeleted.classList.add("active");
    tabHistory.classList.remove("active");
  } else {
    tabHistory.classList.add("active");
    tabDeleted.classList.remove("active");
  }
}
