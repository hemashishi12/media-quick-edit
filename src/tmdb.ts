import { requestUrl } from "obsidian";

const API_BASE = "https://api.themoviedb.org/3";
export const IMAGE_BASE = "https://image.tmdb.org/t/p/original";

export async function tmdbRequest(apiKey: string, endpoint: string, params: Record<string, string> = {}): Promise<any> {
  const normalizedKey = apiKey.trim();
  if (!normalizedKey) throw new Error("TMDB API Key is not configured");
  const query = new URLSearchParams({ ...params, api_key: normalizedKey });
  const response = await requestUrl({ url: `${API_BASE}${endpoint}?${query.toString()}`, headers: { accept: "application/json" } });
  return response.json;
}

export async function searchTmdb(apiKey: string, query: string): Promise<any[]> {
  for (const language of ["zh-CN", "ja-JP", "en-US"]) {
    const data = await tmdbRequest(apiKey, "/search/multi", { query, language, include_adult: "false", page: "1" });
    const results = (data.results || []).filter((item: any) => item.media_type === "movie" || item.media_type === "tv");
    if (results.length) return results.slice(0, 20);
  }
  return [];
}

export async function getTmdbDetails(apiKey: string, type: "movie" | "tv", id: number): Promise<any> {
  return tmdbRequest(apiKey, `/${type}/${id}`, { language: "zh-CN", append_to_response: "credits,external_ids" });
}
