import { describe, expect, it, vi } from "vitest";
import { CoverCache, coverCacheKey } from "../src/coverCache";
import { MediaShelfView, coverVariantFor, normalizeCoverSource } from "../src/mediaShelfView";

describe("bookshelf cover handling", () => {
  it("normalizes common URL, Markdown, wiki-link and array cover fields", () => {
    expect(normalizeCoverSource("https://example.com/cover.jpg")).toBe("https://example.com/cover.jpg");
    expect(normalizeCoverSource("![cover](https://example.com/cover.jpg)")).toBe("https://example.com/cover.jpg");
    expect(normalizeCoverSource("![[Attachments/cover.png|封面]]")).toBe("Attachments/cover.png");
    expect(normalizeCoverSource(["", "https://example.com/book.webp"])).toBe("https://example.com/book.webp");
  });

  it("treats the legacy Open Library placeholder as a missing cover", () => {
    expect(normalizeCoverSource("data:image/svg+xml,%3Ctext%3ENo%20cover%3C/text%3E")).toBe("");
  });

  it("assigns stable designed-cover variants", () => {
    expect(coverVariantFor("百年孤独")).toBe(coverVariantFor("百年孤独"));
    expect(coverVariantFor("百年孤独")).toBeGreaterThanOrEqual(0);
    expect(coverVariantFor("百年孤独")).toBeLessThan(6);
  });

  it("uses a stable cache key per remote source", () => {
    expect(coverCacheKey("https://example.com/a.jpg")).toBe(coverCacheKey("https://example.com/a.jpg"));
    expect(coverCacheKey("https://example.com/a.jpg")).not.toBe(coverCacheKey("https://example.com/b.jpg"));
    expect(coverCacheKey("https://example.com/a.jpg")).toMatch(/^[0-9a-f]{8}$/);
  });

  it("prefers a Vault-local cached thumbnail when it exists", async () => {
    const source = "https://example.com/a.jpg";
    const path = `.obsidian/plugins/media-quick-edit/cover-cache/${coverCacheKey(source)}.webp`;
    const adapter = {
      exists: vi.fn().mockResolvedValue(true),
      getResourcePath: vi.fn((value: string) => `app://vault/${value}`)
    };
    const cache = new CoverCache({ vault: { configDir: ".obsidian", adapter } } as any, "media-quick-edit");
    await expect(cache.getCachedResource(source)).resolves.toBe(`app://vault/${path}`);
    expect(adapter.exists).toHaveBeenCalledWith(path);
  });
});

describe("Base view initial render", () => {
  it("does not read Base config before Obsidian injects it", () => {
    const rootEl = {};
    const scrollEl = { createDiv: vi.fn(() => rootEl) };

    expect(() => new MediaShelfView({ app: {} } as any, scrollEl as any)).not.toThrow();
    expect(scrollEl.createDiv).toHaveBeenCalledOnce();
  });

  it("builds the shell after Base data and config are available", () => {
    const view = {
      data: { data: [] },
      ensureShell: vi.fn(),
      applyView: vi.fn(),
      records: []
    } as any;

    (MediaShelfView.prototype as any).refresh.call(view);

    expect(view.ensureShell).toHaveBeenCalledOnce();
    expect(view.applyView).toHaveBeenCalledOnce();
  });
});
