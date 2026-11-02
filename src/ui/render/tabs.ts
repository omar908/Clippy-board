export function renderTabs(
  tabs: Iterable<HTMLElement>,
  currentFilter: string
) {
  for (const tab of tabs) {
    tab.classList.toggle("active", tab.getAttribute("data-filter") === currentFilter);
  }
}
