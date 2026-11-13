/** Shared feedback and reset behavior for Settings controls. */
export function bindSettingStatus(input: HTMLInputElement | HTMLSelectElement, label: string, defaultValue: string | boolean, onReset = () => {}, onRetry = () => {}) {
  const row = input.closest<HTMLElement>(".settings-row");
  if (!row) return { refresh() {}, feedback(_phase: string, _message?: string, _retryable?: boolean) {}, setEnabled(_enabled: boolean) {} };
  row.classList.add("settings-row-customizable");
  const status = document.createElement("div");
  status.id = `default-${input.id}`;
  status.className = "settings-field-default";
  const feedback = document.createElement("div");
  feedback.id = `save-${input.id}`;
  feedback.className = "settings-field-feedback";
  feedback.setAttribute("role", "status");
  const message = document.createElement("span");
  const retry = document.createElement("button");
  retry.type = "button";
  retry.className = "settings-feedback-button";
  retry.textContent = "Retry";
  retry.setAttribute("aria-label", `Retry saving ${label}`);
  retry.hidden = true;
  retry.addEventListener("click", onRetry);
  feedback.append(message, retry);
  input.setAttribute("aria-describedby", `${status.id} ${feedback.id}`);
  let enabled = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastFeedback = "";
  const reset = document.createElement("button");
  reset.type = "button";
  reset.className = "settings-field-reset";
  reset.textContent = "Reset";
  reset.setAttribute("aria-label", `Reset ${label} to default`);
  const refresh = () => {
    const value = "checked" in input && typeof defaultValue === "boolean" ? input.checked : input.value;
    const customized = value !== defaultValue;
    const display = typeof defaultValue === "boolean" ? (defaultValue ? "On" : "Off")
      : ("options" in input ? Array.from(input.options).find(option => option.value === defaultValue)?.text : undefined) ?? defaultValue;
    status.textContent = `Default: ${display}${customized ? " · Customized" : ""}`;
    row.classList.toggle("settings-customized", customized);
    reset.disabled = !enabled || !customized;
  };
  reset.addEventListener("click", () => {
    if (typeof defaultValue === "boolean") {
      if ("checked" in input) input.checked = defaultValue;
    } else input.value = defaultValue;
    refresh();
    onReset();
  });
  input.addEventListener("input", refresh);
  input.addEventListener("change", refresh);
  row.append(reset, status, feedback);
  refresh();
  return { refresh,
    setEnabled(value: boolean) { enabled = value; input.disabled = !value; refresh(); },
    feedback(phase: string, detail?: string, retryable = true) {
      const signature = `${phase}:${detail ?? ""}`;
      if (lastFeedback === signature) return;
      lastFeedback = signature;
      clearTimeout(timer);
      message.textContent = detail ?? ({ saving: "Saving…", saved: "Saved", pending: "Waiting to save…" }[phase] ?? "");
      retry.hidden = phase !== "error" || !retryable;
      feedback.dataset.state = phase;
      input.setAttribute("aria-invalid", String(phase === "error"));
      if (phase === "saved") timer = setTimeout(() => { message.textContent = ""; }, 2500);
    },
  };
}
