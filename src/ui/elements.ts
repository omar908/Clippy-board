import { getEl } from "./dom";

export function getAppElements() {
  const countPinned = getEl("count-pinned") as HTMLSpanElement;
  const countDeleted = getEl("count-deleted") as HTMLSpanElement;
  // DOM Elements
  const searchInput = getEl("search-input") as HTMLInputElement;
  const searchClearBtn = getEl("search-clear-btn") as HTMLButtonElement;
  const historyList = getEl("history-list") as HTMLDivElement;
  const emptyState = getEl("empty-state") as HTMLDivElement;
  const emptyTitle = emptyState.querySelector(".empty-title") as HTMLElement;
  const emptyDesc = emptyState.querySelector(".empty-desc") as HTMLElement;
  // The default copy lives in index.html; capture it once so a search can be
  // cleared without duplicating the markup in TypeScript.
  const emptyTitleDefault = emptyTitle.textContent ?? "";
  const emptyDescDefault = emptyDesc.innerHTML;
  const filterTabs = document.querySelectorAll<HTMLButtonElement>(".filter-tab");
  const pauseBtn = getEl("pause-btn") as HTMLButtonElement;
  const pinBtn = getEl("pin-btn") as HTMLButtonElement;
  const clearBtn = getEl("clear-btn") as HTMLButtonElement;
  const closeBtn = getEl("close-btn") as HTMLButtonElement;
  const settingsBtn = getEl("settings-btn") as HTMLButtonElement;
  const settingsPage = getEl("settings-page") as HTMLDivElement;
  const settingsBackBtn = getEl("settings-back-btn") as HTMLButtonElement;
  const mainContent = getEl("main-content") as HTMLDivElement;
  const settingMaxHistory = getEl("setting-max-history") as HTMLInputElement;
  const settingDeleteTtl = getEl("setting-delete-ttl") as HTMLInputElement;
  const settingStartOnLogin = getEl("setting-start-on-login") as HTMLInputElement;
  const settingCompactMode = getEl("setting-compact-mode") as HTMLInputElement;
  const settingTextSize = getEl("setting-text-size") as HTMLSelectElement;
  const settingFont = getEl("setting-font") as HTMLSelectElement;
  const settingTheme = getEl("setting-theme") as HTMLSelectElement;
  const settingAutomaticUpdateChecks = getEl("setting-automatic-update-checks") as HTMLInputElement;
  const settingShowPinned = getEl("setting-show-pinned") as HTMLInputElement;
  const shortcutPinItem = getEl("shortcut-pin-item") as HTMLInputElement;
  const shortcutDelete = getEl("shortcut-delete") as HTMLInputElement;
  const shortcutPause = getEl("shortcut-pause") as HTMLInputElement;
  const shortcutSearch = getEl("shortcut-search") as HTMLInputElement;
  const shortcutsReset = getEl("shortcuts-reset") as HTMLButtonElement;
  const settingsAttention = getEl("settings-attention") as HTMLButtonElement;
  const settingsStatus = getEl("settings-status") as HTMLDivElement;
  const settingsRetry = getEl("settings-retry") as HTMLButtonElement;
  const settingsLeave = getEl("settings-leave") as HTMLDivElement;
  const settingsReview = getEl("settings-review") as HTMLButtonElement;
  const settingsDiscard = getEl("settings-discard") as HTMLButtonElement;
  const countAll = getEl("count-all") as HTMLSpanElement;
  const countText = getEl("count-text") as HTMLSpanElement;
  const countImage = getEl("count-image") as HTMLSpanElement;
  const countFile = getEl("count-file") as HTMLSpanElement;

  return { settingTextSize, settingFont, settingTheme, settingAutomaticUpdateChecks, settingCompactMode, settingStartOnLogin, settingShowPinned, countPinned, countDeleted, searchInput, searchClearBtn, historyList, emptyState, emptyTitle, emptyDesc, emptyTitleDefault, emptyDescDefault, filterTabs, pauseBtn, pinBtn, clearBtn, closeBtn, settingsBtn, settingsPage, settingsBackBtn, mainContent, settingMaxHistory, settingDeleteTtl, shortcutPinItem, shortcutDelete, shortcutPause, shortcutSearch, shortcutsReset, settingsAttention, settingsStatus, settingsRetry, settingsLeave, settingsReview, settingsDiscard, countAll, countText, countImage, countFile };
}

export type AppElements = ReturnType<typeof getAppElements>;
