import { togglePin as apiTogglePin, setListeningPaused } from "./api/clipboard";

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
  deleteItemFn: (id: string) => Promise<void>
) {
  if (!item || item.pinned) return;
  try {
    await deleteItemFn(item.id);
  } catch {}
}
