import { describe, expect, it, vi } from "vitest";
import { applyStatusHistory, commentPatch, localDateString, ratingPatch, statusPatch } from "../src/history";
import { isMediaMarkdownFile, touchLastUpdated } from "../src/lastUpdated";

describe("history patches", () => {
  it("uses local calendar dates", () => {
    expect(localDateString(new Date(2026, 6, 9, 23, 59))).toBe("2026-07-09");
  });

  it("rating and comment actions mark an entry completed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 26, 10));
    expect(ratingPatch(5)).toMatchObject({ personalRating: 10, status: "completed", finished_date: "2026-07-26" });
    expect(commentPatch("Great", "Read")).toMatchObject({ comment: "Great", status: "completed", finished_date: "2026-07-26" });
    vi.useRealTimers();
  });

  it("stores overwritten dates and the new action as text entries", () => {
    const frontmatter = { status: "planned", finished_date: "2026-06-01", status_history: [] as string[] };
    const patch = statusPatch("completed", { planned: "To watch", completed: "Watched" });
    patch.finished_date = "2026-07-26";
    applyStatusHistory(frontmatter, patch);
    expect(frontmatter.status_history).toEqual(["2026-06-01 | 想看", "2026-07-26 | Watched"]);
  });

  it("touches the update date only when the calendar date changes", () => {
    const frontmatter: Record<string, any> = {};
    expect(touchLastUpdated(frontmatter, new Date(2026, 6, 26, 9))).toBe(true);
    expect(frontmatter.last_updated).toBe("2026-07-26");
    expect(touchLastUpdated(frontmatter, new Date(2026, 6, 26, 18))).toBe(false);
    expect(touchLastUpdated(frontmatter, new Date(2026, 6, 27, 9))).toBe(true);
    expect(frontmatter.last_updated).toBe("2026-07-27");
  });

  it("matches only Markdown files inside configured media folders", () => {
    const settings = { movieFolder: "Media/movies", bookFolder: "Media/books" };
    expect(isMediaMarkdownFile({ path: "Media/books/Example.md", extension: "md" }, settings)).toBe(true);
    expect(isMediaMarkdownFile({ path: "Media/bookshelf/Example.md", extension: "md" }, settings)).toBe(false);
    expect(isMediaMarkdownFile({ path: "Media/movies/poster.png", extension: "png" }, settings)).toBe(false);
  });
});
