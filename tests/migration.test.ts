import { describe, expect, it, vi } from "vitest";
import { CURRENT_SCHEMA, migrateFrontmatter, migrateLibrary } from "../src/migration";

const labels = { planned: "To watch", completed: "Watched" };

describe("schema migration", () => {
  it.each(["in-progress", "on-hold", "dropped", undefined])("maps %s to planned", (status) => {
    const frontmatter: Record<string, any> = { status, finished_date: "2026-01-02" };
    migrateFrontmatter(frontmatter, labels);
    expect(frontmatter.status).toBe("planned");
    expect(frontmatter.status_history).toEqual(["2026-01-02 | To watch"]);
    expect(frontmatter.mediaQuickEditSchema).toBe(CURRENT_SCHEMA);
  });

  it("preserves completed and normalizes legacy history objects", () => {
    const frontmatter: Record<string, any> = { status: "completed", status_history: [{ date: "2025-02-03", action: "Watched" }] };
    migrateFrontmatter(frontmatter, labels);
    expect(frontmatter.status).toBe("completed");
    expect(frontmatter.status_history).toEqual(["2025-02-03 | Watched"]);
  });

  it("is safe in an empty Vault", async () => {
    const app: any = { vault: { getMarkdownFiles: () => [] } };
    await expect(migrateLibrary(app, { movieFolder: "Media DB/movies", bookFolder: "Media DB/books" } as any, () => labels)).resolves.toEqual({ scanned: 0, migrated: 0 });
  });

  it("handles an English-path Vault while metadata cache is still cold", async () => {
    const file = { path: "Library/Movies/Example.md" };
    const frontmatter: Record<string, any> = { status: "dropped" };
    const app: any = {
      vault: { getMarkdownFiles: () => [file], cachedRead: vi.fn().mockResolvedValue("---\nstatus: dropped\n---") },
      metadataCache: { getFileCache: () => undefined },
      fileManager: { processFrontMatter: vi.fn(async (_file, callback) => callback(frontmatter)) }
    };
    const result = await migrateLibrary(app, { movieFolder: "Library/Movies", bookFolder: "Library/Books" } as any, () => labels);
    expect(result).toEqual({ scanned: 1, migrated: 1 });
    expect(frontmatter).toMatchObject({ status: "planned", mediaQuickEditSchema: CURRENT_SCHEMA });
  });
});
