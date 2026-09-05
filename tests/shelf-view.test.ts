import { describe, expect, it, vi } from "vitest";
import { CoverCache, coverCacheKey } from "../src/coverCache";
import { MediaShelfView, compareShelfRecords, coverVariantFor, normalizeCoverSource } from "../src/mediaShelfView";

describe("bookshelf sorting", () => {
  it("sorts the default view by finished date descending and puts missing dates last", () => {
    const records = [
      { title: "没有完成日期", rating: 10, finishedDate: 0, modified: 300 },
      { title: "较早完成", rating: 10, finishedDate: Date.parse("2026-08-18"), modified: 200 },
      { title: "最近完成", rating: 2, finishedDate: Date.parse("2026-09-03"), modified: 100 }
    ];

    expect(records.sort((left, right) => compareShelfRecords(left, right, "recent")).map((record) => record.title))
      .toEqual(["最近完成", "较早完成", "没有完成日期"]);
  });
});

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
      isRefreshing: false,
      ensureShell: vi.fn(() => expect(view.isRefreshing).toBe(true)),
      applyView: vi.fn(() => expect(view.isRefreshing).toBe(true)),
      records: []
    } as any;

    (MediaShelfView.prototype as any).refresh.call(view);

    expect(view.ensureShell).toHaveBeenCalledOnce();
    expect(view.applyView).toHaveBeenCalledOnce();
    expect(view.isRefreshing).toBe(false);
  });
});

describe("bookshelf comment editor lifecycle", () => {
  it("does not commit when a refresh removes the focused input", () => {
    const blurHandlers: Array<() => void> = [];
    const input = {
      value: "原短评",
      isConnected: true,
      addEventListener: vi.fn((event: string, handler: () => void) => {
        if (event === "blur") blurHandlers.push(handler);
      }),
      focus: vi.fn(),
      setSelectionRange: vi.fn()
    };
    const row = {
      createDiv: vi.fn(() => ({})),
      setAttribute: vi.fn()
    };
    const record = { file: { path: "Media DB/books/Example.md" }, title: "Example" };
    const view = {
      activeCommentEditor: { file: record.file, original: "原短评", draft: "原短评" },
      commentFocusTimer: null,
      isRefreshing: true,
      commitCommentEditor: vi.fn()
    } as any;
    row.createDiv.mockReturnValue({ createEl: vi.fn(() => input) });
    vi.stubGlobal("window", { clearTimeout: vi.fn(), setTimeout: vi.fn() });

    (MediaShelfView.prototype as any).renderCommentEditor.call(view, row, record);
    blurHandlers[0]();
    expect(view.commitCommentEditor).not.toHaveBeenCalled();

    view.isRefreshing = false;
    blurHandlers[0]();
    expect(view.commitCommentEditor).toHaveBeenCalledWith(record, row, input);
    vi.unstubAllGlobals();
  });
});
