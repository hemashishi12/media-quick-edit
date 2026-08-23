import { TFile } from "obsidian";
import { localDateString } from "./history";

export const LAST_UPDATED_PROPERTY = "last_updated";
export const LAST_UPDATED_DEBOUNCE_MS = 1200;

export function touchLastUpdated(frontmatter: Record<string, any>, date = new Date()): boolean {
  const today = localDateString(date);
  if (String(frontmatter[LAST_UPDATED_PROPERTY] || "") === today) return false;
  frontmatter[LAST_UPDATED_PROPERTY] = today;
  return true;
}

export function mediaFolders(settings: { movieFolder?: string; bookFolder?: string }): string[] {
  return [settings.movieFolder, settings.bookFolder]
    .filter((folder): folder is string => Boolean(folder?.trim()))
    .map((folder) => folder.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, ""));
}

export function isMediaMarkdownFile(file: Pick<TFile, "path" | "extension"> | null | undefined, settings: { movieFolder?: string; bookFolder?: string }): boolean {
  if (!file || file.extension !== "md") return false;
  return mediaFolders(settings).some((folder) => file.path.startsWith(`${folder}/`));
}
