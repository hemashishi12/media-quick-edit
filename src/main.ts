import { Notice, Plugin, TFile } from "obsidian";
import { AddMediaModal } from "./addMediaModal";
import { MediaQuickEditView, VIEW_TYPE } from "./mediaQuickEditView";
import { DEFAULT_SETTINGS, MediaQuickEditSettings, MediaQuickEditSettingTab, normalizePathValue } from "./settings";
import { tmdbRequest } from "./tmdb";
import { CURRENT_SCHEMA, migrateLibrary } from "./migration";
import { searchOpenLibrary } from "./openLibrary";

export default class MediaQuickEditPlugin extends Plugin {
  settings: MediaQuickEditSettings = { ...DEFAULT_SETTINGS };

  async onload(): Promise<void> {
    this.settings = { ...DEFAULT_SETTINGS, ...((await this.loadData()) || {}) };
    this.addSettingTab(new MediaQuickEditSettingTab(this.app, this));
    this.registerBasesView(VIEW_TYPE, {
      name: "媒体快速编辑",
      icon: "list-pen",
      factory: (controller, scrollEl) => new MediaQuickEditView(controller, scrollEl)
    });
    this.addRibbonIcon("library-big", "打开媒体库 Base", () => {
      const base = this.getConfiguredBase();
      if (!base) return void new Notice("尚未设置有效的默认 Base，请在 Media Quick Edit 设置中选择");
      void this.app.workspace.getLeaf(true).openFile(base);
    });
    this.app.workspace.onLayoutReady(() => void this.runMigration());
  }

  async saveSettings(): Promise<void> { await this.saveData(this.settings); }
  openAddModal(): void { new AddMediaModal(this.app, this).open(); }

  statusLabels(type: "movie" | "book"): { planned: string; completed: string } {
    return type === "book"
      ? { planned: this.settings.bookPlannedLabel, completed: this.settings.bookCompletedLabel }
      : { planned: this.settings.moviePlannedLabel, completed: this.settings.movieCompletedLabel };
  }

  getConfiguredBase(): TFile | null {
    const configured = this.settings.basePath ? this.app.vault.getAbstractFileByPath(this.settings.basePath) : null;
    if (configured instanceof TFile && configured.extension === "base") return configured;
    const active = this.app.workspace.getActiveFile();
    return active?.extension === "base" ? active : null;
  }

  async ensureFolder(folderPath: string): Promise<void> {
    const path = normalizePathValue(folderPath);
    if (!path) throw new Error("保存文件夹未配置");
    let current = "";
    for (const part of path.split("/").filter(Boolean)) {
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(current)) await this.app.vault.createFolder(current);
    }
  }

  async testTmdbConnection(): Promise<void> {
    if (!this.settings.tmdbApiKey) return void new Notice("请先填写 TMDB API Key");
    try {
      await tmdbRequest(this.settings.tmdbApiKey, "/configuration");
      new Notice("TMDB 连接成功");
    } catch (error) {
      console.error(error);
      new Notice("TMDB 连接失败，请检查 API Key 和网络");
    }
  }

  async testOpenLibraryConnection(): Promise<void> {
    try {
      await searchOpenLibrary("test", 8000);
      new Notice("Open Library 连接成功");
    } catch (error) {
      console.error(error);
      new Notice("Open Library 连接失败或超时，请检查网络");
    }
  }

  async runMigration(): Promise<void> {
    if ((this.settings as any).migrationVersion >= CURRENT_SCHEMA) return;
    try {
      const result = await migrateLibrary(this.app, this.settings, (type) => this.statusLabels(type));
      (this.settings as any).migrationVersion = CURRENT_SCHEMA;
      await this.saveSettings();
      if (result.migrated) new Notice(`Media Quick Edit 已迁移 ${result.migrated} 个条目`);
    } catch (error) {
      console.error("Media Quick Edit migration failed", error);
      new Notice("Media Quick Edit 数据迁移失败，稍后将重试");
    }
  }
}
