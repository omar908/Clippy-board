export function renderTextContent(item: any, contentEl: HTMLElement) {
  try {
    const payload = item.payload || {};
    const text = payload.text || item.text || item.preview || "";
    contentEl.textContent = text.length > 200 ? text.slice(0, 200) + "..." : text;
  } catch {
    contentEl.textContent = "";
  }
}

export function renderImageContent(item: any, contentEl: HTMLElement) {
  try {
    const payload = item.payload || {};
    const img = document.createElement("img");
    img.src = payload.thumbnail || payload.data || item.thumbnail || "";
    img.alt = "clipboard image";
    contentEl.innerHTML = "";
    contentEl.appendChild(img);
  } catch {}
}

export function renderFileContent(item: any, contentEl: HTMLElement) {
  try {
    const payload = item.payload || {};
    const name = payload.name || item.file_name || "File";
    contentEl.textContent = name;
  } catch {}
}
