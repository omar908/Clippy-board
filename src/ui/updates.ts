import { openUrl } from "@tauri-apps/plugin-opener";
import { createUpdateChecker } from "../app/updates";
import { getEl } from "./dom";

export function bindUpdateControls(settingsButton: HTMLButtonElement) {
  const checkButton = getEl("check-for-updates") as HTMLButtonElement;
  const releaseButton = getEl("open-update-release") as HTMLButtonElement;
  const status = getEl("update-status");
  let releaseUrl: string | undefined;

  const checker = createUpdateChecker(result => {
    releaseUrl = result.phase === "available" ? result.release.url : undefined;
    releaseButton.hidden = !releaseUrl;
    checkButton.disabled = result.phase === "checking";
    settingsButton.classList.toggle("update-available", Boolean(releaseUrl));
    settingsButton.title = releaseUrl ? "Settings · Update available" : "Settings";

    switch (result.phase) {
      case "checking": status.textContent = "Checking for updates…"; break;
      case "current": status.textContent = "You’re up to date."; break;
      case "available": status.textContent = `Clippy-board ${result.release.version} is available.`; break;
      case "error": status.textContent = "Couldn’t check for updates. Try again later."; break;
    }
  });

  checkButton.addEventListener("click", () => { void checker.check(); });
  releaseButton.addEventListener("click", async () => {
    if (!releaseUrl) return;
    try {
      await openUrl(releaseUrl);
    } catch {
      status.textContent = "Couldn’t open the release page. Try again.";
    }
  });
  return checker;
}
