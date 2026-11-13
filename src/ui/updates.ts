import { openUrl } from "@tauri-apps/plugin-opener";
import { createUpdateChecker, type Release } from "../app/updates";
import { getEl } from "./dom";

export function bindUpdateControls(settingsButton: HTMLButtonElement) {
  const checkButton = getEl("check-for-updates") as HTMLButtonElement;
  const releaseButton = getEl("open-update-release") as HTMLButtonElement;
  const installButton = getEl("install-update") as HTMLButtonElement;
  const status = getEl("update-status");
  const actions = getEl("update-actions");
  const availableButton = getEl("update-available-btn") as HTMLButtonElement;
  const dialog = getEl("update-dialog") as HTMLDialogElement;
  const dialogTitle = getEl("update-dialog-title");
  const dialogStatus = getEl("update-dialog-status");
  const cancelButton = getEl("cancel-update") as HTMLButtonElement;
  const confirmButton = getEl("confirm-update") as HTMLButtonElement;
  const dialogReleaseButton = getEl("update-dialog-release") as HTMLButtonElement;
  let release: Release | undefined;
  let requested: Release | undefined;

  const checker = createUpdateChecker(result => {
    release = "release" in result ? result.release : undefined;
    actions.hidden = !release;
    installButton.hidden = !release?.installable;
    installButton.disabled = result.phase === "installing";
    installButton.textContent = result.phase === "install-error" ? "Retry" : "Install and restart";
    checkButton.disabled = result.phase === "checking" || result.phase === "installing";
    settingsButton.classList.toggle("update-available", Boolean(release));
    settingsButton.title = release ? "Settings · Update available" : "Settings";
    availableButton.hidden = !release;
    availableButton.disabled = result.phase === "installing";

    switch (result.phase) {
      case "checking": status.textContent = "Checking for updates…"; break;
      case "current": status.textContent = "You’re up to date."; break;
      case "available": status.textContent = `Clippy-board ${result.release.version} is available.`; break;
      case "installing": status.textContent = "Downloading and verifying the update. Clippy-board will restart after installation."; break;
      case "install-error": status.textContent = "Couldn’t install the signed update. Try again or open the release page."; break;
      case "error": status.textContent = "Couldn’t check for updates. Try again later."; break;
    }
    if (!dialog.open) return;
    if (result.phase === "installing" || result.phase === "install-error") {
      const installing = result.phase === "installing";
      dialogTitle.textContent = installing ? "Installing update" : "Update failed";
      dialogStatus.textContent = status.textContent;
      confirmButton.disabled = installing;
      confirmButton.textContent = installing ? "Install and restart" : "Retry";
      cancelButton.disabled = installing;
      dialogReleaseButton.hidden = installing;
      cancelButton.textContent = "Close";
    } else if (requested?.version !== release?.version) {
      dialog.close();
    }
  });

  function requestInstall() {
    if (!release || dialog.open) return;
    requested = release;
    dialogTitle.textContent = release.installable ? "Install update?" : "Update available";
    dialogStatus.textContent = release.installable
      ? `Install Clippy-board ${release.version} and restart the app?`
      : `Clippy-board ${release.version} is available on GitHub.`;
    confirmButton.textContent = release.installable ? "Install and restart" : "Open release page";
    cancelButton.disabled = confirmButton.disabled = false;
    cancelButton.textContent = "Cancel";
    dialogReleaseButton.hidden = true;
    dialog.showModal();
  }

  async function openRelease(url: string, feedback: HTMLElement) {
    try {
      await openUrl(url);
    } catch {
      feedback.textContent = "Couldn’t open the release page. Try again.";
    }
  }

  checkButton.addEventListener("click", () => { void checker.check(); });
  availableButton.addEventListener("click", requestInstall);
  installButton.addEventListener("click", requestInstall);
  cancelButton.addEventListener("click", () => dialog.close());
  dialog.addEventListener("cancel", event => {
    if (cancelButton.disabled) event.preventDefault();
  });
  confirmButton.addEventListener("click", () => {
    if (!requested) return;
    if (requested.installable) void checker.install(requested);
    else void openRelease(requested.url, dialogStatus);
  });
  releaseButton.addEventListener("click", () => {
    if (release) void openRelease(release.url, status);
  });
  dialogReleaseButton.addEventListener("click", () => {
    if (requested) void openRelease(requested.url, dialogStatus);
  });
  return checker;
}
