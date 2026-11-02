import { invoke } from "@tauri-apps/api/core";
import { normalizeClipboardItem, normalizeClipboardItems, normalizeDeletedItems } from "./normalize";

export async function getHistory() {
  return normalizeClipboardItems(await invoke<unknown>("get_history"));
}

export async function getPinned() {
  return invoke<boolean>("get_pinned");
}

export async function setPinned(pinned: boolean) {
  return invoke<boolean>("set_pinned", { pinned });
}

export async function togglePin(id: string, pinned: boolean) {
  return invoke<void>("toggle_pin", { id, pinned });
}

export async function selectItem(id: string) {
  return invoke<void>("select_item", { id });
}

export async function deleteItem(id: string, ttlSeconds: number) {
  return invoke<void>("delete_item", { id, ttlSeconds });
}

export async function clearHistory(ids?: string[] | null, ttlSeconds?: number) {
  return invoke<string[]>("clear_history", { ids: ids ?? null, ttlSeconds: ttlSeconds ?? null });
}

export async function getDeleted() {
  return normalizeDeletedItems(await invoke<unknown>("get_deleted"));
}

export async function restoreFromDeleted(id: string) {
  return normalizeClipboardItem(await invoke<unknown>("restore_from_deleted", { id }));
}

export async function deletePermanentlyFromDeleted(id: string) {
  return invoke<void>("delete_permanently_from_deleted", { id });
}

export async function purgeExpiredDeleted() {
  return invoke<void>("purge_expired_deleted");
}

export async function getListeningPaused() {
  return invoke<boolean>("get_listening_paused");
}

export async function setListeningPaused(paused: boolean) {
  return invoke<boolean>("set_listening_paused", { paused });
}
