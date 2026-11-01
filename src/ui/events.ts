export function bindTabEvents(
  tabHistory: HTMLElement,
  tabDeleted: HTMLElement,
  onHistory: () => void,
  onDeleted: () => void
) {
  tabHistory.onclick = onHistory;
  tabDeleted.onclick = onDeleted;
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
