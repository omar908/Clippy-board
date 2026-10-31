import { togglePin as apiTogglePin, setListeningPaused, selectItem, deleteItem, clearHistory, restoreFromDeleted, deletePermanentlyFromDeleted } from "./api/clipboard";
import { hideWindow, setInteracting } from "./api/window";
import { getSettings, saveSettings } from "./api/settings";

export type ClipboardItemLike = {
  id: string;
  pinned?: boolean;
};

export async function togglePinAction(
  item: ClipboardItemLike | null,
  fetchInitialHistory: () => Promise<void>,
  filterAndRender: () => void
) {
  if (!item) return;
  try {
    await apiTogglePin(item.id, !item.pinned);
    await fetchInitialHistory();
    filterAndRender();
  } catch {}
}

export async function toggleListeningAction(
  isPaused: boolean,
  setPaused: (v: boolean) => void,
  updateUI: (paused: boolean) => void
) {
  const next = !isPaused;
  try {
    await setListeningPaused(next);
  } catch {}
  setPaused(next);
  updateUI(next);
}

export async function deleteItemAction(
  item: ClipboardItemLike | null,
  deleteItemFn?: (id: string) => Promise<void>,
  ttlSeconds?: number
) {
  if (!item || item.pinned) return;
  try {
    if (deleteItemFn) {
      await deleteItemFn(item.id);
    } else {
      await deleteItem(item.id, ttlSeconds ?? 60);
    }
  } catch {}
}

export async function copyItemAction(id: string) {
  try {
    await selectItem(id);
  } catch {}
}

export async function clearHistoryAction(ids?: string[] | null, ttlSeconds?: number) {
  try {
    return await clearHistory(ids ?? null, ttlSeconds ?? undefined);
  } catch {
    return [];
  }
}

export async function restoreFromDeletedAction(id: string) {
  try {
    return await restoreFromDeleted(id);
  } catch {
    return null;
  }
}

export async function deletePermanentlyFromDeletedAction(id: string) {
  try {
    await deletePermanentlyFromDeleted(id);
  } catch {}
}

export async function hideWindowAction() {
  try {
    await hideWindow();
  } catch {}
}

export async function setInteractingAction(interacting: boolean) {
  try {
    await setInteracting(interacting);
  } catch {}
}

export async function loadSettingsAction() {
  try {
    return await getSettings();
  } catch {
    return null;
  }
}

export async function saveSettingsAction(settings: any) {
  try {
    await saveSettings(settings);
    return true;
  } catch {
    return false;
  }
}
