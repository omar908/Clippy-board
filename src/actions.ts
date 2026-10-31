import { invoke } from "@tauri-apps/api/core";

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
    await invoke("toggle_pin", { id: item.id, pinned: !item.pinned });
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
    await invoke("set_listening_paused", { paused: next });
  } catch {}
  setPaused(next);
  updateUI(next);
}

export async function deleteItemAction(
  item: ClipboardItemLike | null,
  deleteItemFn: (id: string) => Promise<void>
) {
  if (!item || item.pinned) return;
  try {
    await deleteItemFn(item.id);
  } catch {}
}
