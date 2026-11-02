import type { ClipboardItem, ClipboardPayload, DeletedItem } from "../types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown, field: string) {
  if (!isRecord(value)) throw new TypeError(`${field} must be an object`);
  return value;
}

function text(value: unknown, field: string) {
  if (typeof value !== "string") throw new TypeError(`${field} must be a string`);
  return value;
}

function number(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`${field} must be a finite nonnegative number`);
  }
  return value;
}

/** Rust uses nested payloads. Older flattened entries are accepted here so the
 * rest of the application can use one discriminated union without shape casts.
 */
function normalizePayload(item: Record<string, unknown>): ClipboardPayload {
  const payload = item.payload === undefined ? item : record(item.payload, "payload");
  switch (item.type) {
    case "text":
      return { type: "text", payload: {
        text: text(payload.text, "text"), preview: text(payload.preview, "preview"),
        char_count: number(payload.char_count, "char_count"), line_count: number(payload.line_count, "line_count"),
      } };
    case "image": {
      const thumbnail = payload.thumbnail;
      if (thumbnail !== undefined && thumbnail !== null && typeof thumbnail !== "string") {
        throw new TypeError("thumbnail must be a string or null");
      }
      return { type: "image", payload: {
        data_url: text(payload.data_url, "data_url"), ...(thumbnail === undefined ? {} : { thumbnail }),
        width: number(payload.width, "width"), height: number(payload.height, "height"),
        byte_size: number(payload.byte_size, "byte_size"),
      } };
    }
    case "file": {
      if (!Array.isArray(payload.paths)) throw new TypeError("paths must be an array");
      const paths = payload.paths.map((path: unknown) => text(path, "path"));
      return { type: "file", payload: {
        paths, count: number(payload.count, "count"), preview: text(payload.preview, "preview"),
      } };
    }
    default:
      throw new TypeError("Unknown clipboard item type");
  }
}

export function normalizeClipboardItem(value: unknown): ClipboardItem {
  const item = record(value, "clipboard item");
  if (item.pinned !== undefined && typeof item.pinned !== "boolean") {
    throw new TypeError("pinned must be a boolean");
  }
  return {
    id: text(item.id, "id"), timestamp: number(item.timestamp, "timestamp"),
    ...(item.pinned === undefined ? {} : { pinned: item.pinned }),
    ...normalizePayload(item),
  };
}

export function normalizeDeletedItem(value: unknown): DeletedItem {
  const item = record(value, "deleted item");
  return {
    id: text(item.id, "id"), original_timestamp: number(item.original_timestamp, "original_timestamp"),
    deleted_at: number(item.deleted_at, "deleted_at"), ...normalizePayload(item),
  };
}

export function normalizeClipboardItems(value: unknown): ClipboardItem[] {
  if (!Array.isArray(value)) throw new TypeError("history must be an array");
  return value.map((item: unknown) => normalizeClipboardItem(item));
}

export function normalizeDeletedItems(value: unknown): DeletedItem[] {
  if (!Array.isArray(value)) throw new TypeError("deleted history must be an array");
  return value.map((item: unknown) => normalizeDeletedItem(item));
}
