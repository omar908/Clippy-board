import { invoke } from "@tauri-apps/api/core";
import type { AppSettings, CustomTheme } from "../api/settings";
import { setInteracting } from "../api/window";
import { applyPalette, colorKeys, contrastWarnings, validColor } from "./theme-palette";
import { availableThemeName, exportTheme, importTheme, type ThemeDraft } from "./theme-file";
import { applyIcons, contentIcons, customEmoji, customEmojiPrefix, defaultIcons, icon, iconChoices, iconRoles, type IconRole } from "./theme-icons";

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
  const iconSample = document.createElement("div");
  iconSample.className = "theme-icon-sample";
  sample.append(iconSample);
  const iconStyle = get<HTMLSelectElement>("theme-icon-style");
  const picker = get("theme-icon-picker");
  const gallery = document.createElement("div");
  gallery.className = "theme-icon-gallery";
  gallery.hidden = true;
  gallery.setAttribute("role", "group");
  let closeGallery = () => {};
  const roleRows = Object.entries(iconRoles).map(([key, label]) => {
    const role = key as IconRole;
    const row = document.createElement("div");
    row.className = "theme-icon-row";
    const caption = document.createElement("span");
    caption.textContent = label;
    const control = document.createElement("button");
    control.type = "button";
    control.className = "settings-btn theme-icon-choice";
    control.id = `theme-icon-role-${role}`;
    control.setAttribute("aria-expanded", "false");
    control.setAttribute("aria-controls", "theme-icon-gallery");
    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "settings-btn";
    reset.textContent = "Reset";
    reset.setAttribute("aria-label", `Reset ${label} icon`);
    reset.onclick = () => {
      if (control.getAttribute("aria-expanded") === "true") closeGallery();
      control.value = "";
      const legacy = iconOverrides.find(entry => entry.type === role);
      if (legacy) legacy.checkbox.checked = false;
      preview();
    };
    control.onclick = () => {
      const wasOpen = control.getAttribute("aria-expanded") === "true";
      closeGallery();
      if (wasOpen) return;
      control.setAttribute("aria-expanded", "true");
      gallery.id = "theme-icon-gallery";
      gallery.setAttribute("aria-label", `Choose ${label} icon`);
      gallery.replaceChildren(...iconChoices.map(choice => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "settings-btn";
        button.title = choice.label;
        button.setAttribute("aria-label", choice.label);
        button.setAttribute("aria-pressed", String(control.value === choice.id));
        button.append(iconSwatch(choice.id));
        button.onclick = () => {
          control.value = choice.id;
          closeGallery();
          preview();
          control.focus();
        };
        return button;
      }));
      const emojiField = document.createElement("input");
      emojiField.type = "text";
      emojiField.className = "settings-input";
      emojiField.maxLength = 64;
      emojiField.id = "theme-custom-emoji";
      emojiField.value = customEmoji(control.value) ?? "";
      const emojiLabel = document.createElement("label");
      emojiLabel.htmlFor = emojiField.id;
      emojiLabel.textContent = "Custom emoji";
      const hint = document.createElement("p");
      hint.className = "settings-row-desc";
      hint.setAttribute("role", "status");
      hint.textContent = "Paste one emoji or press Win + .";
      const windowsPicker = document.createElement("button");
      windowsPicker.type = "button";
      windowsPicker.className = "settings-btn";
      windowsPicker.textContent = "Open emoji picker";
      windowsPicker.onclick = () => {
        emojiField.focus();
        emojiField.select();
        void invoke("open_emoji_picker").catch(() => {
          hint.textContent = "Press Win + . to open the Windows emoji picker.";
        });
      };
      emojiField.oninput = () => {
        const choice = customEmojiPrefix + emojiField.value.trim();
        const valid = !!customEmoji(choice);
        hint.textContent = valid ? "" : "Enter one emoji, or press Win + .";
        if (valid || (!emojiField.value && customEmoji(control.value))) {
          control.value = valid ? choice : "";
          preview();
        }
      };
      const customField = document.createElement("div");
      customField.className = "theme-custom-emoji";
      customField.append(emojiLabel, emojiField, windowsPicker, hint);
      gallery.append(customField);
      row.after(gallery);
      gallery.hidden = false;
      closeGallery = () => {
        gallery.hidden = true;
        control.setAttribute("aria-expanded", "false");
      };
    };
    row.append(caption, control, reset);
    picker.append(row);
    const example = document.createElement("span");
    example.title = label;
    example.append(icon(role));
    if (!contentIcons.some(type => type === role)) iconSample.append(example);
    return { role, control, reset };
  });
  function iconSwatch(choice: string) {
    const [style, glyph] = choice.split(":");
    const swatch = document.createElement("span");
    swatch.setAttribute("aria-hidden", "true");
    const emoji = customEmoji(choice);
    if (emoji) {
      swatch.className = "theme-icon-swatch";
      swatch.textContent = emoji;
      return swatch;
    }
    swatch.className = `theme-icon-swatch ${style}`;
    swatch.style.setProperty("--swatch-emoji", `var(--glyph-${glyph}-emoji)`);
    swatch.style.setProperty("--swatch-outline", `var(--glyph-${glyph}-outline)`);
    return swatch;
  }
  const iconOverrides = contentIcons.map((type, index) => {
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    const caption = ["Text", "Image", "Files"][index];
    checkbox.type = "checkbox";
    label.append(checkbox, ` Alternate ${caption} icon`);
    get("theme-icon-overrides").append(label);
    const example = document.createElement("span");
    example.append(icon(type), ` ${caption}`);
    iconSample.append(example);
    checkbox.addEventListener("change", preview);
    return { type, checkbox };
  });
  iconStyle.addEventListener("change", preview);
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
    const icons = { ...defaultIcons, style: iconStyle.value === "outline" ? "outline" as const : "emoji" as const };
    for (const { type, checkbox } of iconOverrides) icons[type] = checkbox.checked;
    const overrides = Object.fromEntries(roleRows.filter(({ control }) => control.value)
      .map(({ role, control }) => [role, control.value]));
    return { id, name: name.value.trim(), base: base.value as CustomTheme["base"], ...palette,
      icons: Object.keys(overrides).length ? { ...icons, overrides } : icons };
  }

  function preview() {
    const theme = draft();
    applyIcons(sample, theme.icons);
    for (const { role, control, reset } of roleRows) {
      const alternate = iconOverrides.some(entry => entry.type === role && entry.checkbox.checked);
      const choice = iconChoices.find(entry => entry.id === control.value);
      control.setAttribute("aria-label", `Choose ${iconRoles[role]} icon`);
      const emoji = customEmoji(control.value);
      const description = emoji ? "Custom emoji" : choice?.label ?? (alternate ? "Alternate" : "Preset default");
      control.title = description;
      control.replaceChildren(iconSwatch(emoji ? control.value : choice?.id ??
        `${theme.icons?.style}:${role}${alternate ? "-alt" : ""}`), description);
      reset.disabled = !control.value && !alternate;
    }
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
    closeGallery();
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
      const icons = (imported ?? current)?.icons ?? defaultIcons;
      iconStyle.value = icons.style;
      for (const { role, control } of roleRows) control.value = icons.overrides?.[role] ?? "";
      for (const { type, checkbox } of iconOverrides) checkbox.checked = icons[type];
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
