import { afterEach, expect, it, vi } from "vitest";
import { createUpdateChecker } from "./updates";

afterEach(() => vi.useRealTimers());

it("checks after startup and daily, and disabling automatic checks keeps the manual action working", async () => {
  vi.useFakeTimers();
  const lookup = vi.fn().mockResolvedValue(null);
  const render = vi.fn();
  const checker = createUpdateChecker(render, lookup);
  checker.setAutomatic(true);
  expect(lookup).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(30_000);
  expect(lookup).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
  expect(lookup).toHaveBeenCalledTimes(2);

  checker.setAutomatic(false);
  await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
  expect(lookup).toHaveBeenCalledTimes(2);
  await checker.check();
  expect(lookup).toHaveBeenCalledTimes(3);
  expect(render).toHaveBeenLastCalledWith({ phase: "current" });
  expect(vi.getTimerCount()).toBe(0);
});

it("avoids duplicate requests and allows retry after failure", async () => {
  const lookup = vi.fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce({ version: "0.4.0", url: "https://github.com/omar908/Clippy-board/releases/tag/v0.4.0" });
  const render = vi.fn();
  const checker = createUpdateChecker(render, lookup);
  await Promise.all([checker.check(), checker.check()]);
  expect(lookup).toHaveBeenCalledTimes(1);
  expect(render).toHaveBeenLastCalledWith({ phase: "error" });
  await checker.check();
  expect(render).toHaveBeenLastCalledWith(expect.objectContaining({ phase: "available" }));
});
