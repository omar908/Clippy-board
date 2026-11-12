import { afterEach, expect, it, vi } from "vitest";
import { checkLatestRelease } from "./updates";

vi.mock("../../package.json", () => ({ version: "0.9.2" }));
afterEach(() => vi.unstubAllGlobals());

it("compares release versions numerically and constructs a link within the project", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({
    tag_name: "v0.10.0",
    html_url: "https://example.com",
  }));
  vi.stubGlobal("fetch", fetch);
  await expect(checkLatestRelease()).resolves.toEqual({
    version: "0.10.0", url: "https://github.com/omar908/Clippy-board/releases/tag/v0.10.0",
  });
  expect(fetch).toHaveBeenCalledWith(
    "https://api.github.com/repos/omar908/Clippy-board/releases/latest",
    expect.objectContaining({ credentials: "omit" }),
  );
});

it.each(["v0.9.2", "v0.8.99"])("does not offer the installed version or a downgrade (%s)", async tag => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ tag_name: tag })));
  await expect(checkLatestRelease()).resolves.toBeNull();
});

it("rejects malformed release metadata and failed requests", async () => {
  vi.stubGlobal("fetch", vi.fn()
    .mockResolvedValueOnce(Response.json({ tag_name: "v1.0.0-beta.1" }))
    .mockResolvedValueOnce(new Response(null, { status: 429 })));
  await expect(checkLatestRelease()).rejects.toThrow("Invalid release version");
  await expect(checkLatestRelease()).rejects.toThrow("HTTP 429");
});
