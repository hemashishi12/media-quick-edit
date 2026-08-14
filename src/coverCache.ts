import { App, normalizePath, requestUrl } from "obsidian";

const THUMBNAIL_WIDTH = 360;
const THUMBNAIL_HEIGHT = 540;
const MAX_CONCURRENT_DOWNLOADS = 3;

export function coverCacheKey(source: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index++) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

async function createThumbnail(data: ArrayBuffer, contentType: string): Promise<ArrayBuffer> {
  const blob = new Blob([data], { type: contentType || "image/jpeg" });
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, THUMBNAIL_WIDTH / bitmap.width, THUMBNAIL_HEIGHT / bitmap.height);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Canvas is unavailable");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);
    const thumbnail = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Thumbnail encoding failed")), "image/webp", 0.84);
    });
    return thumbnail.arrayBuffer();
  } finally {
    bitmap.close();
  }
}

export class CoverCache {
  private cacheDir: string;
  private pending = new Map<string, Promise<string | null>>();
  private activeDownloads = 0;
  private waiters: Array<() => void> = [];

  constructor(private app: App, pluginId: string) {
    const configDir = this.app.vault.configDir || ".obsidian";
    this.cacheDir = normalizePath(`${configDir}/plugins/${pluginId}/cover-cache`);
  }

  async getCachedResource(source: string): Promise<string | null> {
    const path = this.cachePath(source);
    return await this.app.vault.adapter.exists(path) ? this.app.vault.adapter.getResourcePath(path) : null;
  }

  cacheRemote(source: string): Promise<string | null> {
    if (!/^https?:\/\//i.test(source)) return Promise.resolve(null);
    const existing = this.pending.get(source);
    if (existing) return existing;
    const task = this.downloadAndCache(source)
      .catch((error) => {
        console.debug("Media Quick Edit cover cache skipped", source, error);
        return null;
      })
      .finally(() => this.pending.delete(source));
    this.pending.set(source, task);
    return task;
  }

  async invalidate(source: string): Promise<void> {
    const path = this.cachePath(source);
    if (await this.app.vault.adapter.exists(path)) await this.app.vault.adapter.remove(path);
  }

  private async downloadAndCache(source: string): Promise<string> {
    const cached = await this.getCachedResource(source);
    if (cached) return cached;
    await this.acquireSlot();
    try {
      const secondCheck = await this.getCachedResource(source);
      if (secondCheck) return secondCheck;
      const response = await requestUrl({ url: source, headers: { accept: "image/avif,image/webp,image/*,*/*;q=0.8" } });
      if (response.status < 200 || response.status >= 300) throw new Error(`Cover request failed with ${response.status}`);
      const contentType = Object.entries(response.headers).find(([key]) => key.toLowerCase() === "content-type")?.[1]?.split(";")[0] || "image/jpeg";
      if (!contentType.startsWith("image/")) throw new Error(`Unexpected cover content type: ${contentType}`);
      const thumbnail = await createThumbnail(response.arrayBuffer, contentType);
      await this.ensureDirectory();
      const path = this.cachePath(source);
      await this.app.vault.adapter.writeBinary(path, thumbnail);
      return this.app.vault.adapter.getResourcePath(path);
    } finally {
      this.releaseSlot();
    }
  }

  private cachePath(source: string): string {
    return normalizePath(`${this.cacheDir}/${coverCacheKey(source)}.webp`);
  }

  private async ensureDirectory(): Promise<void> {
    if (!(await this.app.vault.adapter.exists(this.cacheDir))) await this.app.vault.adapter.mkdir(this.cacheDir);
  }

  private async acquireSlot(): Promise<void> {
    if (this.activeDownloads >= MAX_CONCURRENT_DOWNLOADS) await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.activeDownloads += 1;
  }

  private releaseSlot(): void {
    this.activeDownloads = Math.max(0, this.activeDownloads - 1);
    this.waiters.shift()?.();
  }
}
