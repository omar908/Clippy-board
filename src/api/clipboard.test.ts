import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { getHistory, getDeleted, restoreFromDeleted } from "./clipboard";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
beforeEach(() => vi.mocked(invoke).mockReset());

const text = { type: "text", text: "hello", preview: "hello", char_count: 5, line_count: 1 };
const payload = { text: text.text, preview: text.preview, char_count: text.char_count, line_count: text.line_count };

describe("clipboard API boundary", () => {
  it("normalizes history and deleted fetches and restored items", async () => {
    vi.mocked(invoke).mockResolvedValueOnce([{ id: "history", timestamp: 1, ...text }]);
    expect(await getHistory()).toEqual([{ id: "history", timestamp: 1, type: "text", payload }]);
    vi.mocked(invoke).mockResolvedValueOnce([{ id: "deleted", original_timestamp: 1, deleted_at: 2, ...text }]);
    expect(await getDeleted()).toEqual([{ id: "deleted", original_timestamp: 1, deleted_at: 2, type: "text", payload }]);
    vi.mocked(invoke).mockResolvedValueOnce({ id: "restored", timestamp: 3, ...text });
    expect(await restoreFromDeleted("restored")).toEqual({ id: "restored", timestamp: 3, type: "text", payload });
    expect(invoke).toHaveBeenLastCalledWith("restore_from_deleted", { id: "restored" });
  });

  it("rejects an invalid fetch so callers can keep their last valid state", async () => {
    vi.mocked(invoke).mockResolvedValueOnce([{ id: "missing-payload", timestamp: 1, type: "image" }]);
    await expect(getHistory()).rejects.toThrow();
  });
});
