import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestUrl } from "obsidian";
import { openLibraryCover, searchOpenLibrary } from "../src/openLibrary";
import { DEFAULT_SETTINGS, normalizePathValue } from "../src/settings";
import { tmdbRequest } from "../src/tmdb";

describe("public defaults and API boundaries", () => {
  const requestMock = vi.mocked(requestUrl);
  beforeEach(() => { requestMock.mockReset(); });
  afterEach(() => { vi.useRealTimers(); });

  it("uses portable English default paths and no bundled API key", () => {
    expect(DEFAULT_SETTINGS.movieFolder).toBe("Media DB/movies");
    expect(DEFAULT_SETTINGS.bookFolder).toBe("Media DB/books");
    expect(DEFAULT_SETTINGS.basePath).toBe("");
    expect(DEFAULT_SETTINGS.tmdbApiKey).toBe("");
  });

  it("normalizes Chinese and Windows-style Vault paths", () => {
    expect(normalizePathValue(" /电影与书\\电影/ ")).toBe("电影与书/电影");
  });

  it("rejects a missing TMDB key before making a request", async () => {
    await expect(tmdbRequest("  ", "/configuration")).rejects.toThrow("not configured");
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("returns a local data-URL placeholder when a book has no cover", () => {
    expect(openLibraryCover()).toMatch(/^data:image\/svg\+xml,/);
  });

  it("surfaces Open Library timeout failures", async () => {
    vi.useFakeTimers();
    requestMock.mockReturnValue(new Promise(() => undefined) as any);
    const result = searchOpenLibrary("example", 25);
    const rejection = expect(result).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(25);
    await rejection;
  });
});
