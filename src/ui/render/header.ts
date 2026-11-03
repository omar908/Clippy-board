import type { ClipboardItem } from "../../types";

type CountFilter = "all" | "pinned" | "text" | "image" | "file" | "deleted";

export function updateCountsUI(
  elements: Record<CountFilter, HTMLElement | null>,
  history: ClipboardItem[],
  deletedCount: number,
  showPinnedInAll = true,
) {
  const counts = {
    all: history.filter(item => showPinnedInAll || !item.pinned).length,
    pinned: history.filter((item) => item.pinned).length,
    text: history.filter((item) => item.type === "text").length,
    image: history.filter((item) => item.type === "image").length,
    file: history.filter((item) => item.type === "file").length,
    deleted: deletedCount,
  };
  for (const filter of Object.keys(counts) as CountFilter[]) {
    const element = elements[filter];
    if (element) element.textContent = String(counts[filter]);
  }
}
