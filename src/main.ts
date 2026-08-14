import { Notice, Plugin, TFile } from "obsidian";
import { AddMediaModal } from "./addMediaModal";
import { MediaQuickEditView, VIEW_TYPE } from "./mediaQuickEditView";
import { MediaShelfView, SHELF_VIEW_TYPE } from "./mediaShelfView";
import { DEFAULT_SETTINGS, MediaQuickEditSettings, MediaQuickEditSettingTab, normalizePathValue } from "./settings";
import { tmdbRequest } from "./tmdb";
import { CURRENT_SCHEMA, migrateLibrary } from "./migration";
import { searchOpenLibrary } from "./openLibrary";
import { CoverCache } from "./coverCache";
import { addShelfViewToBase } from "./baseViewSetup";

export default class MediaQuickEditPlugin extends Plugin {
  settings: MediaQuickEditSettings = { ...DEFAULT_SETTINGS };
  coverCache: CoverCache;
  private watchedBaseControllers = new WeakSet<object>();

  async onload(): Promise<void> {
    const storedSettings = (await this.loadData()) || {};
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...storedSettings,
      lastBaseViews: { ...DEFAULT_SETTINGS.lastBaseViews, ...(storedSettings.lastBaseViews || {}) }
    };
    this.coverCache = new CoverCache(this.app, this.manifest.id);
    this.addSettingTab(new MediaQuickEditSettingTab(this.app, this));
    this.registerBasesView(VIEW_TYPE, {
      name: "媒体快速编辑",
      icon: "list-pen",
      factory: (controller, scrollEl) => new MediaQuickEditView(controller, scrollEl)
    });
    this.registerBasesView(SHELF_VIEW_TYPE, {
      name: "书架",
      icon: "library-big",
      factory: (controller, scrollEl) => new MediaShelfView(controller, scrollEl)
    });
    this.addRibbonIcon("library-big", "打开媒体库 Base", () => void this.openConfiguredBase());
    this.registerEvent(this.app.workspace.on("layout-change", () => {
      this.watchOpenBaseViews();
      void this.rememberOpenBaseViews();
    }));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => {
      this.watchOpenBaseViews();
      void this.rememberOpenBaseViews();
    }));
    this.app.workspace.onLayoutReady(() => {
      void this.runMigration();
      void this.ensureShelfViewInConfiguredBase();
      this.watchOpenBaseViews();
      void this.rememberOpenBaseViews();
    });
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

  async openConfiguredBase(): Promise<void> {
    const base = this.getConfiguredBase();
    if (!base) return void new Notice("尚未设置有效的默认 Base，请在 Media Quick Edit 设置中选择");

    const openLeaf = this.app.workspace.getLeavesOfType("bases").find((leaf) => this.getBaseLeafState(leaf).file === base.path);
    if (openLeaf) {
      await this.app.workspace.revealLeaf(openLeaf);
      this.watchOpenBaseViews();
      await this.rememberOpenBaseViews();
      return;
    }

    const leaf = this.app.workspace.getLeaf(true);
    const viewName = this.settings.lastBaseViews[base.path];
    if (viewName) {
      try {
        await leaf.setViewState({ type: "bases", state: { file: base.path, viewName } });
      } catch (error) {
        console.debug("Media Quick Edit could not restore the previous Base view", error);
        await leaf.openFile(base);
      }
    } else {
      await leaf.openFile(base);
    }
    await this.app.workspace.revealLeaf(leaf);
    this.watchOpenBaseViews();
    await this.rememberOpenBaseViews();
  }

  private getBaseLeafState(leaf: any): { file: string; viewName: string } {
    const state = leaf.getViewState?.()?.state ?? {};
    return {
      file: typeof state.file === "string" ? state.file : "",
      viewName: typeof state.viewName === "string" ? state.viewName : ""
    };
  }

  private watchOpenBaseViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType("bases")) {
      const controller = (leaf.view as any)?.controller;
      if (!controller || this.watchedBaseControllers.has(controller) || typeof controller.events?.on !== "function") continue;
      this.watchedBaseControllers.add(controller);
      this.registerEvent(controller.events.on("view-changed", () => void this.rememberBaseLeaf(leaf)));
    }
  }

  private async rememberBaseLeaf(leaf: any): Promise<void> {
    const { file, viewName } = this.getBaseLeafState(leaf);
    if (!file || !viewName || this.settings.lastBaseViews[file] === viewName) return;
    this.settings.lastBaseViews[file] = viewName;
    await this.saveSettings();
  }

  private async rememberOpenBaseViews(): Promise<void> {
    let changed = false;
    for (const leaf of this.app.workspace.getLeavesOfType("bases")) {
      const { file, viewName } = this.getBaseLeafState(leaf);
      if (!file || !viewName || this.settings.lastBaseViews[file] === viewName) continue;
      this.settings.lastBaseViews[file] = viewName;
      changed = true;
    }
    if (changed) await this.saveSettings();
  }

  async ensureShelfViewInConfiguredBase(): Promise<boolean> {
    const base = this.getConfiguredBase();
    if (!base) return false;
    let changed = false;
    await this.app.vault.process(base, (source) => {
      const next = addShelfViewToBase(source);
      changed = next !== source;
      return next;
    });
    return changed;
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
