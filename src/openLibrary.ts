import { requestUrl } from "obsidian";

export async function searchOpenLibrary(query: string, timeoutMs = 15000): Promise<any[]> {
  const url = `https://openlibrary.org/search.json?${new URLSearchParams({ q: query, limit: "20" }).toString()}`;
  const request = requestUrl({ url, headers: { accept: "application/json" } }).then((response) => response.json);
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = globalThis.setTimeout(() => reject(new Error("Open Library request timed out")), timeoutMs);
  });
  try {
    const data: any = await Promise.race([request, timeout]);
    return (data.docs || []).slice(0, 20);
  } finally {
    if (timeoutId !== undefined) globalThis.clearTimeout(timeoutId);
  }
}

export function openLibraryCover(coverId?: number): string {
  return coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : OPEN_LIBRARY_PLACEHOLDER;
}

const OPEN_LIBRARY_PLACEHOLDER = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="360" height="540"><rect width="100%" height="100%" fill="#2f3136"/><path d="M95 100h170v340H95z" fill="#454950"/><path d="M125 150h110M125 190h110M125 230h80" stroke="#9ca3af" stroke-width="12" stroke-linecap="round"/><text x="180" y="360" text-anchor="middle" fill="#d1d5db" font-family="sans-serif" font-size="28">No cover</text></svg>')}`;
