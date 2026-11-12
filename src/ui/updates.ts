import { openUrl } from "@tauri-apps/plugin-opener";
import { createUpdateChecker, type Release } from "../app/updates";
import { getEl } from "./dom";

export function bindUpdateControls(settingsButton: HTMLButtonElement) {
  const checkButton = getEl("check-for-updates") as HTMLButtonElement;
  const releaseButton = getEl("open-update-release") as HTMLButtonElement;
  const installButton = getEl("install-update") as HTMLButtonElement;
  const status = getEl("update-status");
  let release: Release | undefined;

  const checker = createUpdateChecker(result => {
    release = "release" in result ? result.release : undefined;
    releaseButton.hidden = !release;
    installButton.hidden = !release?.installable;
    installButton.disabled = result.phase === "installing";
    checkButton.disabled = result.phase === "checking" || result.phase === "installing";
    settingsButton.classList.toggle("update-available", Boolean(release));
    settingsButton.title = release ? "Settings · Update available" : "Settings";

    switch (result.phase) {
      case "checking": status.textContent = "Checking for updates…"; break;
      case "current": status.textContent = "You’re up to date."; break;
      case "available": status.textContent = `Clippy-board ${result.release.version} is available.`; break;
      case "installing": status.textContent = "Downloading and verifying the update. Clippy-board will restart after installation."; break;
      case "install-error": status.textContent = "Couldn’t install the signed update. Try again or open the release page."; break;
      case "error": status.textContent = "Couldn’t check for updates. Try again later."; break;
    }
  });

  checkButton.addEventListener("click", () => { void checker.check(); });
  installButton.addEventListener("click", () => {
    if (release) void checker.install(release);
  });
  releaseButton.addEventListener("click", async () => {
    if (!release) return;
    try {
      await openUrl(release.url);
    } catch {
      status.textContent = "Couldn’t open the release page. Try again.";
    }
  });
  return checker;
}
