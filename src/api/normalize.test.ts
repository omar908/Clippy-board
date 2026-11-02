import { describe, expect, it } from "vitest";
import type { ClipboardPayload } from "../types";
import { normalizeClipboardItem, normalizeClipboardItems, normalizeDeletedItem, normalizeDeletedItems } from "./normalize";

const payloads: ClipboardPayload[] = [
  { type: "text", payload: { text: "<b>Hello</b>", preview: "Hello", char_count: 12, line_count: 1 } },
  { type: "image", payload: { data_url: "data:image/png;base64,full", thumbnail: "data:image/png;base64,thumb", width: 640, height: 480, byte_size: 2048 } },
  { type: "file", payload: { paths: ["C:/one.txt", "D:/two.txt"], count: 2, preview: "one.txt" } },
];

describe("clipboard IPC normalization", () => {
  it.each(payloads)("accepts nested and legacy flattened $type history without changing the input", value => {
    const nested = { id: "item", timestamp: 10, pinned: true, ...value };
    const flattened = { id: "item", timestamp: 10, pinned: true, type: value.type, ...value.payload };
    const original = structuredClone(flattened);
    expect(normalizeClipboardItem(nested)).toStrictEqual(nested);
    expect(normalizeClipboardItem(flattened)).toStrictEqual(nested);
    expect(flattened).toStrictEqual(original);
  });

  it.each(payloads)("accepts nested and legacy flattened $type deleted entries", value => {
    const nested = { id: "deleted", original_timestamp: 10, deleted_at: 20, ...value };
    const flattened = { id: "deleted", original_timestamp: 10, deleted_at: 20, type: value.type, ...value.payload };
    expect(normalizeDeletedItem(nested)).toStrictEqual(nested);
    expect(normalizeDeletedItem(flattened)).toStrictEqual(nested);
  });

  it.each([undefined, null, "data:image/png;base64,thumbnail"])("supports optional/null image thumbnails: %s", thumbnail => {
    const raw = { id: "image", timestamp: 0, type: "image", payload: {
      data_url: "data:image/png;base64,full", width: 1, height: 1, byte_size: 4,
      ...(thumbnail === undefined ? {} : { thumbnail }),
    } };
    expect(normalizeClipboardItem(raw)).toStrictEqual(raw);
  });

  it("preserves zero metadata, empty content, missing pin flags, and list order", () => {
    const raw = { id: "empty", timestamp: 0, type: "text", payload: { text: "", preview: "", char_count: 0, line_count: 0 } };
    const result = normalizeClipboardItems([raw, { ...raw, id: "second" }]);
    expect(result[0]).toStrictEqual(raw);
    expect(result.map(item => item.id)).toEqual(["empty", "second"]);
  });

  it("copies mutable file paths so normalizing does not alias the incoming array", () => {
    const paths = ["C:/one.txt"];
    const item = normalizeClipboardItem({ id: "file", timestamp: 0, type: "file", paths, count: 1, preview: "one.txt" });
    paths.push("C:/two.txt");
    expect(item.type).toBe("file");
    if (item.type === "file") expect(item.payload.paths).toEqual(["C:/one.txt"]);
  });

  it.each([
    null, [], "text", {},
    { id: "x", timestamp: 0, type: "unsupported" },
    { id: 4, timestamp: 0, ...payloads[0] },
    { id: "x", timestamp: NaN, ...payloads[0] },
    { id: "x", timestamp: -1, ...payloads[0] },
    { id: "x", timestamp: 0, pinned: "false", ...payloads[0] },
    { id: "x", timestamp: 0, type: "text", payload: null },
    { id: "x", timestamp: 0, type: "text", payload: { text: "x", preview: "x", char_count: "1", line_count: 1 } },
    { id: "x", timestamp: 0, type: "file", paths: [42], count: 1, preview: "x" },
    { id: "x", timestamp: 0, type: "image", data_url: "data:", width: 1, height: 1, byte_size: Infinity },
    { id: "x", timestamp: 0, type: "image", data_url: "data:", width: 1, height: 1, byte_size: 4, thumbnail: false },
  ])("rejects malformed IPC data: %j", value => {
    expect(() => normalizeClipboardItem(value)).toThrow(TypeError);
  });

  it("rejects invalid deleted metadata and invalid collection shapes", () => {
    expect(() => normalizeDeletedItem({ id: "x", deleted_at: 10, ...payloads[0] })).toThrow("original_timestamp");
    expect(() => normalizeDeletedItem({ id: "x", original_timestamp: 0, deleted_at: "10", ...payloads[0] })).toThrow("deleted_at");
    expect(() => normalizeClipboardItems({})).toThrow("array");
    expect(() => normalizeDeletedItems(null)).toThrow("array");
  });

  it("prefers an explicit nested payload and rejects a broken one instead of silently mixing shapes", () => {
    const flat = { id: "item", timestamp: 1, type: "text", text: "flat", preview: "flat", char_count: 4, line_count: 1 };
    expect(normalizeClipboardItem({ ...flat, payload: payloads[0].payload })).toEqual({ id: "item", timestamp: 1, ...payloads[0] });
    expect(() => normalizeClipboardItem({ ...flat, payload: {} })).toThrow();
  });
});
