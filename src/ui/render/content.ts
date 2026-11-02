import type { TextPayload, ImagePayload, FilePayload } from "../../types";

export function renderTextContent(payload: TextPayload, contentEl: HTMLElement) {
  contentEl.textContent = payload.preview || payload.text || "";
}

export function renderImageContent(payload: ImagePayload, contentEl: HTMLElement) {
  contentEl.innerHTML = "";
  const img = document.createElement("img");
  // Prefer the pre-rendered thumbnail; full data_url is the fallback
  // (and what restore uses — that path stays Rust-side).
  img.src = payload.thumbnail || payload.data_url || "";
  img.alt = "Clipboard image preview";
  img.loading = "lazy";
  contentEl.appendChild(img);
}

export function renderFileContent(payload: FilePayload, contentEl: HTMLElement) {
  contentEl.innerHTML = "";
  (payload.paths || []).slice(0, 3).forEach((p: string) => {
    const fileRow = document.createElement("div");
    fileRow.className = "file-row";
    const icon = document.createElement("span");
    icon.className = "file-icon";
    icon.textContent = "📄";
    const pathSpan = document.createElement("span");
    pathSpan.className = "file-path";
    pathSpan.textContent = p;
    fileRow.appendChild(icon);
    fileRow.appendChild(pathSpan);
    contentEl.appendChild(fileRow);
  });

  if ((payload.paths || []).length > 3) {
    const moreSpan = document.createElement("span");
    moreSpan.className = "file-path";
    moreSpan.textContent = `...and ${(payload.paths || []).length - 3} more files`;
    contentEl.appendChild(moreSpan);
  }
}
