import type { AppSettings, CustomTheme } from "../api/settings";
import { setInteracting } from "../api/window";
import { applyPalette, colorKeys, contrastWarnings, validColor } from "./theme-palette";

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

  function open(next: typeof mode) {
    const current = selected();
    if (next !== "create" && !current) return;
    mode = next;
    id = next === "create" ? crypto.randomUUID() : current!.id;
    error.textContent = "";
    fields.hidden = next === "delete";
    sample.hidden = next === "delete";
    deleteMessage.hidden = next !== "delete";
    title.textContent = next === "create" ? "Create theme" : next === "edit" ? "Edit theme" : "Delete theme?";
    submit.textContent = next === "delete" ? "Delete theme" : "Save and apply";
    if (next === "delete") {
      deleteMessage.textContent = `Delete “${current!.name}”? Clippy-board will return to Follow Windows.`;
    } else {
      const activeBase = current?.base ?? document.documentElement.dataset.theme;
      base.value = activeBase === "light" || activeBase === "oled" ? activeBase : "dark";
      name.value = next === "edit" ? current!.name : "";
      setColors(current ?? presets[base.value as CustomTheme["base"]]);
      fields.scrollTop = 0;
    }
    dialog.showModal();
    void setInteracting(true).catch(() => {});
    if (next === "delete") cancel.focus();
  }

  create.addEventListener("click", () => open("create"));
  edit.addEventListener("click", () => open("edit"));
  remove.addEventListener("click", () => open("delete"));
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
        if (!theme.name || others.some(entry => entry.name.toLowerCase() === theme.name.toLowerCase())) {
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
    refresh(enabled: boolean) {
      create.disabled = !enabled;
      edit.hidden = remove.hidden = !selected();
      edit.disabled = remove.disabled = !enabled;
    },
  };
}
