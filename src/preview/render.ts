import type { ClipboardItem } from "../types";

const TEXT_CHAR_CAP = 100_000;

export function renderPreviewContent(header: HTMLElement, body: HTMLElement, item: ClipboardItem): () => void {
  let stopDrag = () => {};
  header.replaceChildren();
  body.replaceChildren();

  const badge = document.createElement("span");
  badge.className = `item-badge badge-${item.type}`;
  badge.textContent = item.type;

  const time = document.createElement("span");
  time.textContent = new Date(item.timestamp).toLocaleString();

  const details = document.createElement("span");
  details.className = "preview-details";

  header.append(badge, time, details);

  if (item.type === "text") {
    details.textContent = `${item.payload.char_count.toLocaleString()} chars · ${item.payload.line_count.toLocaleString()} lines`;

    const textEl = document.createElement("div");
    textEl.className = "preview-text";
    const full = item.payload.text;
    textEl.textContent =
      full.length > TEXT_CHAR_CAP
        ? full.slice(0, TEXT_CHAR_CAP)
        : full;
    body.append(textEl);

    if (full.length > TEXT_CHAR_CAP) {
      const notice = document.createElement("div");
      notice.className = "preview-notice";
      notice.textContent = `Truncated — showing first ${TEXT_CHAR_CAP.toLocaleString()} of ${full.length.toLocaleString()} characters`;
      body.append(notice);
    }
  } else if (item.type === "image") {
    const p = item.payload;
    details.textContent = `${p.width}×${p.height} · ${formatBytes(p.byte_size)}`;

    const wrap = document.createElement("div");
    wrap.className = "preview-image-wrap";
    wrap.title = "Click to zoom to 100% · drag to pan";

    const img = document.createElement("img");
    img.className = "preview-image";
    img.src = p.data_url;
    img.alt = "Clipboard image";

    let suppressClick = false; // set after a drag, so release doesn't toggle zoom

    // Zoom toggle anchored on the click point: the clicked spot stays under
    // the cursor in both directions (fit <-> 100%).
    img.addEventListener("click", (e) => {
      if (suppressClick) { suppressClick = false; return; }
      const r = img.getBoundingClientRect();
      const wr = wrap.getBoundingClientRect();
      // Click point in natural image coordinates
      const nx = (e.clientX - r.left) * (img.naturalWidth / r.width);
      const ny = (e.clientY - r.top) * (img.naturalHeight / r.height);
      wrap.classList.toggle("zoomed");
      // Scroll so the same image point lands back under the cursor
      const r2 = img.getBoundingClientRect();
      const s2 = r2.width / img.naturalWidth;
      wrap.scrollLeft = (r2.left - wr.left) + nx * s2 - (e.clientX - wr.left);
      wrap.scrollTop = (r2.top - wr.top) + ny * s2 - (e.clientY - wr.top);
    });

    // Drag (left or middle button) pans the zoomed image.
    wrap.addEventListener("mousedown", (e) => {
      if (e.button !== 0 && e.button !== 1) return;
      stopDrag();
      e.preventDefault(); // no selection drag, no middle-click auto-scroll
      suppressClick = false;
      const sx = e.clientX, sy = e.clientY;
      const sl = wrap.scrollLeft, st = wrap.scrollTop;
      let moved = false;
      wrap.classList.add("grabbing");
      const onMove = (ev: MouseEvent) => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return; // click vs. drag
        moved = true;
        wrap.scrollLeft = sl - dx;
        wrap.scrollTop = st - dy;
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        wrap.classList.remove("grabbing");
        if (moved) suppressClick = true; // a drag must not toggle zoom on release
        stopDrag = () => {};
      };
      stopDrag = onUp;
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    });

    wrap.append(img);
    body.append(wrap);
  } else {
    const p = item.payload;
    details.textContent = `${p.count.toLocaleString()} files`;

    const list = document.createElement("div");
    list.className = "preview-file-list";
    for (const path of p.paths) {
      const row = document.createElement("div");
      row.className = "preview-file-row";

      const icon = document.createElement("span");
      icon.className = "preview-file-icon";
      icon.textContent = "\u{1F4C4}"; // page facing up

      const text = document.createElement("span");
      text.textContent = path;

      row.append(icon, text);
      list.append(row);
    }
    body.append(list);
  }
  return () => stopDrag();
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

