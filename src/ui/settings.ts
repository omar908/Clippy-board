import * as api from "../api";
import { type AppSettings } from "../api/settings";
import type { AppElements } from "./elements";
import { bindSettingsToggle } from "./events";
import { validateShortcutSettings } from "../app/shortcut-definitions";
import { normalizeShortcut } from "../shortcut-combo";
import { SettingsAutosave, errorMessage } from "./settings-autosave";
import { createSettingsFields, fieldValue, renderField, numberValue, type SettingField } from "./settings-fields";

export function bindSettingsEvents(elements: AppElements,
  onShortcutsSaved: (shortcuts: Record<string, string>) => void = () => {},
  closeSettings = () => {
    elements.settingsPage.style.display = "none";
    Object.assign(elements.mainContent.style, { display: "flex", flexDirection: "column", flex: "1", minHeight: "0" });
  },
  onSettingsSaved: (settings: AppSettings) => void = () => {},
  onOpen: () => Promise<void> = async () => {},
) {
  const { settingsBtn, settingsPage, mainContent, settingsBackBtn, shortcutsReset,
    settingsStatus, settingsRetry, settingsLeave, settingsReview, settingsDiscard, settingsAttention } = elements;
  let queue: SettingsAutosave<AppSettings> | undefined;
  let loaded = false;
  let revision = 0;
  let closing = false;
  let previousFocus: HTMLElement | null = null;
  let leaveAction: (() => void | Promise<void>) | undefined;
  const changedFields = new Set<SettingField>();
  const fields = createSettingsFields(elements, edit);

  function refresh() {
    const attention = fields.filter(field => changedFields.has(field) && queue?.state(field.key)?.phase === "error");
    const pending = queue?.unresolved;
    if (loaded) settingsStatus.textContent = attention.length ? `${attention.length} setting${attention.length === 1 ? " needs" : "s need"} attention.`
      : pending ? (queue?.busy ? "Saving changes…" : "Changes waiting to save.") : "All changes saved.";
    settingsRetry.hidden = loaded;
    settingsAttention.hidden = attention.length === 0 || !settingsLeave.hidden;
    settingsDiscard.disabled = queue?.busy ?? false;
    for (const field of fields) {
      field.status.setEnabled(loaded);
      if (!changedFields.has(field)) continue;
      const state = queue?.state(field.key);
      field.status.feedback(state?.phase ?? "idle", state?.message, state?.retryable);
    }
    shortcutsReset.disabled = !loaded;
  }
  function syncConfirmed(settings: AppSettings) {
    for (const field of fields) {
      const phase = queue?.state(field.key)?.phase;
      if (!phase || phase === "idle" || phase === "saved") renderField(field, settings);
    }
    onShortcutsSaved(settings.shortcuts);
    onSettingsSaved(settings);
  }
  function edit(field: SettingField, ready: boolean) {
    if (!loaded || !queue || settingsPage.style.display === "none") return;
    if (field.shortcutKey) {
      for (const shortcut of fields.filter(f => f.shortcutKey)) {
        if (fieldValue(shortcut) !== shortcut.read(queue.confirmed)) changedFields.add(shortcut);
        else { changedFields.delete(shortcut); shortcut.status.feedback("idle"); }
      }
    }
    changedFields.add(field);
    settingsLeave.hidden = true;
    const value = fieldValue(field);
    // Shortcut drafts are validated and saved together, allowing swaps and an
    // atomic Reset all without ever persisting duplicate bindings.
    const shortcutDraft = Object.fromEntries(fields.filter(f => f.shortcutKey).map(f => [f.shortcutKey!, String(fieldValue(f))]));
    queue.edit(field.key, saved => {
      if (field.key === "shortcuts") {
        const shortcuts = { ...saved.shortcuts, ...Object.fromEntries(Object.entries(shortcutDraft).map(([key, value]) => [key, normalizeShortcut(value)])) };
        validateShortcutSettings(shortcuts);
        return { ...saved, shortcuts };
      }
      if (field.key === "max_history") return { ...saved, max_history: numberValue(String(value), field.label, 1, 10000) };
      if (field.key === "delete_ttl_seconds") {
        const ttl = numberValue(String(value), field.label, 0, 86400);
        return { ...saved, delete_ttl_seconds: ttl, delete_immediately: ttl === 0 };
      }
      return { ...saved, [field.key]: value };
    }, ready);
  }
  function commitNumbers() {
    for (const field of fields.filter(f => f.key === "max_history" || f.key === "delete_ttl_seconds")) {
      const state = queue?.state(field.key);
      if (state?.phase === "pending" && state.message) edit(field, true);
    }
  }
  function finishClose(action: () => void | Promise<void>) {
    revision++;
    settingsLeave.hidden = true;
    closeSettings();
    (previousFocus && previousFocus !== document.body ? previousFocus : settingsBtn).focus();
    return action();
  }
  async function leave(action: () => void | Promise<void> = () => {}) {
    if (settingsPage.style.display === "none") return action();
    if (closing) return;
    closing = true;
    leaveAction = action;
    try {
      commitNumbers();
      await queue?.flush();
      if (queue?.unresolved) {
        settingsLeave.hidden = false;
        settingsAttention.hidden = true;
        settingsReview.focus();
      } else await finishClose(action);
    } finally { closing = false; }
  }
  async function close() { await leave(); }
  async function open() {
    const request = ++revision;
    if (settingsPage.style.display === "none") previousFocus = document.activeElement as HTMLElement | null;
    mainContent.style.display = "none";
    settingsPage.style.display = "flex";
    loaded = false; queue = undefined; changedFields.clear();
    settingsLeave.hidden = true;
    for (const field of fields) field.status.feedback("idle");
    settingsStatus.textContent = "Loading settings…";
    refresh(); settingsRetry.hidden = true;
    settingsBackBtn.focus();
    try {
      await onOpen();
      if (request !== revision) return;
      const settings = await api.getSettings();
      if (request !== revision) return;
      queue = new SettingsAutosave(settings, {
        save: async (candidate, key) => {
          await api.setInteracting(true);
          try { return await api.saveSettings(candidate, key === "start_on_login"); }
          finally { await api.setInteracting(false).catch(() => {}); }
        },
        changed: refresh,
        saved: syncConfirmed,
      });
      fields.forEach(field => renderField(field, settings));
      loaded = true; refresh();
    } catch (error) {
      if (request !== revision) return;
      settingsStatus.textContent = `Could not load settings: ${errorMessage(error)}`;
      refresh();
    }
  }
  async function toggle() {
    if (settingsPage.style.display !== "none") await close();
    else await open();
  }
  bindSettingsToggle(settingsBtn, () => { void toggle(); });
  settingsBackBtn.addEventListener("click", () => { void close(); });
  settingsRetry.addEventListener("click", () => { void open(); });
  function review() {
    settingsLeave.hidden = true;
    refresh();
    const field = fields.find(f => changedFields.has(f) && queue?.state(f.key)?.phase === "error");
    field?.input.focus();
  }
  settingsReview.addEventListener("click", review);
  settingsAttention.addEventListener("click", review);
  settingsDiscard.addEventListener("click", () => {
    if (queue?.busy) return;
    queue?.discard();
    if (queue) fields.forEach(field => renderField(field, queue!.confirmed));
    changedFields.clear();
    void finishClose(leaveAction ?? (() => {}));
  });
  shortcutsReset.addEventListener("click", () => {
    if (!loaded) return;
    const shortcuts = fields.filter(f => f.shortcutKey);
    for (const field of shortcuts) {
      field.input.value = String(field.defaultValue); field.status.refresh(); changedFields.add(field);
    }
    edit(shortcuts[0], true);
  });
  refresh();
  return { open, close, toggle, leave };
}
