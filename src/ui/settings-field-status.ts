/** Shared feedback and reset behavior for shortcuts, numeric fields and toggles. */
export function bindSettingStatus(input: HTMLInputElement, label: string, defaultValue: string | boolean) {
  const row = input.closest<HTMLElement>(".settings-row");
  if (!row) return { refresh() {} };
  row.classList.add("settings-row-customizable");
  const status = document.createElement("div");
  status.id = `default-${input.id}`;
  status.className = "settings-field-default";
  input.setAttribute("aria-describedby", status.id);
  const reset = document.createElement("button");
  reset.type = "button";
  reset.className = "settings-field-reset";
  reset.textContent = "Reset";
  reset.setAttribute("aria-label", `Reset ${label} to default`);
  const refresh = () => {
    const value = typeof defaultValue === "boolean" ? input.checked : input.value;
    const customized = value !== defaultValue;
    const display = typeof defaultValue === "boolean" ? (defaultValue ? "On" : "Off") : defaultValue;
    status.textContent = `Default: ${display}${customized ? " · Customized" : ""}`;
    row.classList.toggle("settings-customized", customized);
    reset.disabled = !customized;
  };
  reset.addEventListener("click", () => {
    if (typeof defaultValue === "boolean") input.checked = defaultValue;
    else input.value = defaultValue;
    refresh();
  });
  input.addEventListener("input", refresh);
  input.addEventListener("change", refresh);
  row.append(reset, status);
  refresh();
  return { refresh };
}
