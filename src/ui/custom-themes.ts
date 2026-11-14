import { invoke } from "@tauri-apps/api/core";
import type { AppSettings, CustomTheme } from "../api/settings";
import { setInteracting } from "../api/window";
import { applyPalette, colorKeys, contrastWarnings, validColor } from "./theme-palette";
import { availableThemeName, exportTheme, importTheme, type ThemeDraft } from "./theme-file";

const presets = {
  dark: { window: "#181a20", card: "#252934", text: "#f3f4f6", accent: "#93c5fd" },
  light: { window: "#f8fafc", card: "#ffffff", text: "#172033", accent: "#17429b" },
  oled: { window: "#000000", card: "#000000", text: "#f3f4f6", accent: "#93c5fd" },
};

export function bindCustomThemes(
  select: HTMLSelectElement,
  getSettings: () => AppSettings | undefined,
  save: (apply: (settings: AppSettings) => AppSettings) => Promise<void>,
) {
  const editor = document.querySelector<HTMLDialogElement>("dialog#theme-editor");
  if (!editor || editor.tagName !== "DIALOG") return;
  const dialog = editor;
  const get = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
  const form = get<HTMLFormElement>("theme-form");
  const name = get<HTMLInputElement>("theme-name");
  const base = get<HTMLSelectElement>("theme-base");
  const sample = get("theme-sample");
  const warnings = get("theme-warnings");
  const error = get("theme-error");
  const fields = get("theme-fields");
  const title = get("theme-editor-title");
  const deleteMessage = get("theme-delete-message");
  const submit = get<HTMLButtonElement>("save-theme");
  const cancel = get<HTMLButtonElement>("cancel-theme");
  const create = get<HTMLButtonElement>("create-theme");
  const edit = get<HTMLButtonElement>("edit-theme");
  const remove = get<HTMLButtonElement>("delete-theme");
  const importButton = get<HTMLButtonElement>("import-theme");
  const exportButton = get<HTMLButtonElement>("export-theme");
  const fileInput = get<HTMLInputElement>("theme-file");
  const fileStatus = get("theme-file-status");
  const importNote = get("theme-import-note");
  const inputs = colorKeys.map(key => {
    const label = document.createElement("label");
    const picker = document.createElement("input");
    const hex = document.createElement("input");
    const caption = key[0].toUpperCase() + key.slice(1);
    label.textContent = caption;
    label.htmlFor = hex.id = `theme-color-${key}`;
    picker.type = "color";
    picker.setAttribute("aria-label", `${caption} color picker`);
    hex.className = "settings-input";
    hex.required = true;
    hex.pattern = "#[0-9a-fA-F]{6}";
    hex.maxLength = 7;
    hex.spellcheck = false;
    picker.addEventListener("input", () => { hex.value = picker.value; preview(); });
    hex.addEventListener("input", () => {
      if (validColor(hex.value)) picker.value = hex.value;
      preview();
    });
    const row = document.createElement("div");
    row.className = "theme-color-row";
    row.append(label, picker, hex);
    get("theme-colors").append(row);
    return { key, picker, hex };
  });

  let mode: "create" | "edit" | "delete" = "create";
  let id = "";
  let clearSample: (() => void) | undefined;
  let saving = false;
  let exporting = false;
  let pickingImport = false;
  let enabled = false;
  const selected = () => getSettings()?.custom_themes.find(theme => select.value === `custom:${theme.id}`);

  function draft(): CustomTheme {
    const palette = { ...presets[base.value as CustomTheme["base"]] };
    for (const { key, hex } of inputs) palette[key] = hex.value;
    return { id, name: name.value.trim(), base: base.value as CustomTheme["base"], ...palette };
  }

  function preview() {
    const theme = draft();
    if (!colorKeys.every(key => validColor(theme[key]))) return;
    clearSample?.();
    clearSample = applyPalette(sample, theme);
    warnings.replaceChildren(...contrastWarnings(theme).map(message => {
      const item = document.createElement("li");
      item.textContent = message;
      return item;
    }));
  }

  function setColors(colors: typeof presets.dark) {
    for (const { key, picker, hex } of inputs) picker.value = hex.value = colors[key];
    preview();
  }

  function open(next: typeof mode, imported?: ThemeDraft) {
    const current = selected();
    if (next !== "create" && !current) return;
    mode = next;
    id = next === "create" ? crypto.randomUUID() : current!.id;
    error.textContent = "";
    fields.hidden = next === "delete";
    sample.hidden = next === "delete";
    deleteMessage.hidden = next !== "delete";
    title.textContent = imported ? "Import theme" : next === "create" ? "Create theme" : next === "edit" ? "Edit theme" : "Delete theme?";
    importNote.hidden = true;
    submit.textContent = next === "delete" ? "Delete theme" : "Save and apply";
    if (next === "delete") {
      deleteMessage.textContent = `Delete “${current!.name}”? Clippy-board will return to Follow Windows.`;
    } else {
      const activeBase = imported?.base ?? current?.base ?? document.documentElement.dataset.theme;
      base.value = activeBase === "light" || activeBase === "oled" ? activeBase : "dark";
      name.value = imported ? availableThemeName(imported.name, getSettings()?.custom_themes ?? [])
        : next === "edit" ? current!.name : "";
      if (imported && name.value !== imported.name) {
        importNote.textContent = "That name is already in use. You can keep the suggested name or enter another.";
        importNote.hidden = false;
      }
      setColors(imported ?? current ?? presets[base.value as CustomTheme["base"]]);
      fields.scrollTop = 0;
    }
    dialog.showModal();
    void setInteracting(true).catch(() => {});
    if (next === "delete") cancel.focus();
  }

  create.addEventListener("click", () => open("create"));
  edit.addEventListener("click", () => open("edit"));
  remove.addEventListener("click", () => open("delete"));
  importButton.addEventListener("click", async () => {
    if (pickingImport) return;
    fileStatus.hidden = true;
    pickingImport = true;
    try {
      await setInteracting(true);
      fileInput.showPicker();
    } catch {
      await finishImport();
      fileStatus.textContent = "Couldn’t open the theme file picker.";
      fileStatus.hidden = false;
    }
  });
  async function finishImport() {
    if (!pickingImport) return;
    pickingImport = false;
    if (!dialog.open) await setInteracting(false).catch(() => {});
  }
  fileInput.addEventListener("cancel", () => { void finishImport(); });
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file) { await finishImport(); return; }
    fileStatus.hidden = true;
    try {
      const imported = await importTheme(file);
      if (getSettings() && !importButton.disabled && !dialog.open) open("create", imported);
    } catch (failure) {
      if (!getSettings() || importButton.disabled) return;
      fileStatus.textContent = failure instanceof Error ? failure.message : String(failure);
      fileStatus.hidden = false;
    } finally {
      await finishImport();
    }
  });
  exportButton.addEventListener("click", async () => {
    const theme = selected();
    if (!theme || exporting) return;
    const name = theme.name.replace(/[<>:"/\\|?*\u0000-\u001f\u007f-\u009f]/g, "-").trim().replace(/[. ]+$/, "") || "theme";
    const filename = /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(name) ? `_${name}` : name;
    exporting = exportButton.disabled = true;
    fileStatus.textContent = "Choose where to save your theme…";
    fileStatus.hidden = false;
    try {
      await setInteracting(true);
      const path = await invoke<string | null>("save_theme_file", {
        filename: `${filename}.clippy-theme.json`, contents: exportTheme(theme),
      });
      fileStatus.textContent = path ? `Theme saved to ${path}` : "Export canceled.";
    } catch (failure) {
      fileStatus.textContent = `Couldn’t save the theme. ${failure instanceof Error ? failure.message : String(failure)}`;
    } finally {
      await setInteracting(false).catch(() => {});
      exporting = false;
      exportButton.disabled = !enabled;
    }
  });
  base.addEventListener("change", () => setColors(presets[base.value as CustomTheme["base"]]));
  cancel.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => { void setInteracting(false).catch(() => {}); });
  dialog.addEventListener("cancel", event => { if (saving) event.preventDefault(); });
  form.noValidate = true;
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (saving || (mode !== "delete" && !form.reportValidity())) return;
    const theme = draft();
    const deleting = mode === "delete";
    const creating = mode === "create";
    saving = submit.disabled = cancel.disabled = true;
    error.textContent = "";
    try {
      await save(settings => {
        const others = settings.custom_themes.filter(entry => entry.id !== theme.id);
        if (deleting) return { ...settings, theme: "system", custom_theme_id: null, custom_themes: others };
        if (!theme.name || others.some(entry => entry.name.trim().toLowerCase() === theme.name.toLowerCase())) {
          throw new Error("Enter a unique theme name.");
        }
        const custom_themes = creating ? [...others, theme]
          : settings.custom_themes.map(entry => entry.id === theme.id ? theme : entry);
        return { ...settings, theme: "custom", custom_theme_id: theme.id, custom_themes };
      });
      dialog.close();
      if (deleting) select.focus();
    } catch (failure) {
      error.textContent = failure instanceof Error ? failure.message : String(failure);
      error.scrollIntoView({ block: "nearest" });
    } finally {
      saving = submit.disabled = cancel.disabled = false;
    }
  });

  return {
    isOpen: () => dialog.open,
    render(settings: AppSettings) {
      const value = select.value;
      for (const option of Array.from(select.options)) if (option.value.startsWith("custom:")) option.remove();
      for (const theme of settings.custom_themes) select.add(new Option(theme.name, `custom:${theme.id}`));
      select.value = value;
    },
    refresh(canEdit: boolean) {
      enabled = canEdit;
      create.disabled = importButton.disabled = !enabled;
      edit.hidden = remove.hidden = exportButton.hidden = !selected();
      edit.disabled = remove.disabled = !enabled;
      exportButton.disabled = !enabled || exporting;
    },
  };
}
