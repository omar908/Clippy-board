export function bindTabEvents(
  tabs: Iterable<HTMLElement>,
  onSelect: (filter: string) => void | Promise<void>
) {
  for (const tab of tabs) {
    tab.onclick = () => {
      const filter = tab.getAttribute("data-filter");
      if (filter !== null) return onSelect(filter);
    };
  }
}

export function bindSettingsToggle(
  settingsBtn: HTMLElement,
  onToggle: () => void
) {
  settingsBtn.onclick = (e) => {
    e.stopPropagation();
    onToggle();
  };
}
