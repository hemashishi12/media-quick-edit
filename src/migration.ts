import { App, TFile } from "obsidian";
import { MediaQuickEditSettings } from "./settings";

export const CURRENT_SCHEMA = 2;

export async function migrateLibrary(app: App, settings: MediaQuickEditSettings, statusLabels: (type: "movie" | "book") => { planned: string; completed: string }): Promise<{ scanned: number; migrated: number }> {
  const folders = [settings.movieFolder, settings.bookFolder].filter(Boolean).map((path) => `${path.replace(/\/+$/, "")}/`);
  const files = app.vault.getMarkdownFiles().filter((file) => folders.some((folder) => file.path.startsWith(folder)));
  let migrated = 0;
  for (const file of files) {
    const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
    const historySupported = Array.isArray(frontmatter?.status_history) && frontmatter.status_history.every((item: any) => typeof item === "string");
    if (frontmatter && Number(frontmatter.mediaQuickEditSchema || 0) >= CURRENT_SCHEMA && historySupported) continue;
    if (!frontmatter && !(await app.vault.cachedRead(file)).startsWith("---")) continue;
    await migrateFile(app, file, statusLabels(frontmatter?.type === "book" ? "book" : "movie"));
    migrated += 1;
  }
  return { scanned: files.length, migrated };
}

async function migrateFile(app: App, file: TFile, labels: { planned: string; completed: string }): Promise<void> {
  await app.fileManager.processFrontMatter(file, (frontmatter) => {
    migrateFrontmatter(frontmatter, labels);
  });
}

export function migrateFrontmatter(frontmatter: Record<string, any>, labels: { planned: string; completed: string }): void {
  const completed = frontmatter.status === "completed";
  frontmatter.status = completed ? "completed" : "planned";
  const existing = Array.isArray(frontmatter.status_history) ? frontmatter.status_history : [];
  frontmatter.status_history = existing.map((item: any) => typeof item === "string" ? item : `${item?.date || ""} | ${item?.action || ""}`.trim());
  if (!frontmatter.status_history.length && frontmatter.finished_date) {
    frontmatter.status_history.push(`${String(frontmatter.finished_date)} | ${completed ? labels.completed : labels.planned}`);
  }
  frontmatter.mediaQuickEditSchema = CURRENT_SCHEMA;
}
