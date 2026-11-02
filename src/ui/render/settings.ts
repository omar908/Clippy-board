export function renderSettingsView(container: HTMLElement, visible: boolean) {
  if (visible) {
    container.style.display = "flex";
  } else {
    container.style.display = "none";
  }
}

export function populateSettingsForm(settings: any, form: Record<string, HTMLElement>) {
  try {
    if (form.ttlInput && settings.ttl_hours !== undefined) {
      (form.ttlInput as HTMLInputElement).value = String(settings.ttl_hours);
    }
    if (form.autoDeleteCheckbox && settings.auto_delete_expired !== undefined) {
      (form.autoDeleteCheckbox as HTMLInputElement).checked = !!settings.auto_delete_expired;
    }
    if (form.historyLimitInput && settings.history_limit !== undefined) {
      (form.historyLimitInput as HTMLInputElement).value = String(settings.history_limit);
    }
    if (form.startupCheckbox && settings.launch_at_startup !== undefined) {
      (form.startupCheckbox as HTMLInputElement).checked = !!settings.launch_at_startup;
    }
  } catch {}
}
