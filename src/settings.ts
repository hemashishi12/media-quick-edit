import { App, FuzzySuggestModal, PluginSettingTab, Setting } from "obsidian";

export interface MediaQuickEditSettings {
  tmdbApiKey: string;
  movieFolder: string;
  bookFolder: string;
  basePath: string;
  autoOpenNewEntry: boolean;
  defaultAddType: "movie" | "book";
  moviePlannedLabel: string;
  movieCompletedLabel: string;
  bookPlannedLabel: string;
  bookCompletedLabel: string;
  migrationVersion?: number;
}

export const DEFAULT_SETTINGS: MediaQuickEditSettings = {
  tmdbApiKey: "",
  movieFolder: "Media DB/movies",
  bookFolder: "Media DB/books",
  basePath: "",
  autoOpenNewEntry: true,
  defaultAddType: "movie",
  moviePlannedLabel: "想看",
  movieCompletedLabel: "看过",
  bookPlannedLabel: "想读",
  bookCompletedLabel: "读过"
};

class PathPickerModal extends FuzzySuggestModal<string> {
  constructor(app: App, private items: string[], placeholder: string, private choose: (path: string) => void) { super(app); this.setPlaceholder(placeholder); }
  getItems(): string[] { return this.items; }
  getItemText(item: string): string { return item; }
  onChooseItem(item: string): void { this.choose(item); }
}

export class MediaQuickEditSettingTab extends PluginSettingTab {
  constructor(app: App, private owner: any) { super(app, owner); }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Media Quick Edit" });
    new Setting(containerEl).setName("TMDB API Key").setDesc("仅保存在当前 Vault 的插件 data.json 中，不会发送到插件作者的服务器。").addText((text) => {
      text.setPlaceholder("输入 TMDB v3 API Key").setValue(this.owner.settings.tmdbApiKey);
      text.inputEl.type = "password";
      text.onChange((value) => this.setValue("tmdbApiKey", value.trim()));
    }).addButton((button) => button.setButtonText("测试连接").onClick(() => this.owner.testTmdbConnection()));
    new Setting(containerEl).setName("Open Library").setDesc("书籍搜索使用公开接口，无需密钥；查询内容会直接发送到 openlibrary.org。").addButton((button) => button.setButtonText("测试连接").onClick(() => this.owner.testOpenLibraryConnection()));
    this.addPath("电影 / 剧集文件夹", "movieFolder", "选择保存电影和剧集的文件夹", "folder");
    this.addPath("书籍文件夹", "bookFolder", "选择保存书籍的文件夹", "folder");
    this.addPath("默认 Base", "basePath", "选择左侧栏按钮打开的 .base 文件", "base");
    new Setting(containerEl).setName("自动打开新条目").addToggle((toggle) => toggle.setValue(this.owner.settings.autoOpenNewEntry).onChange((value) => this.setValue("autoOpenNewEntry", value)));
    new Setting(containerEl).setName("默认添加类型").addDropdown((dropdown) => dropdown.addOption("movie", "电影 / 剧集").addOption("book", "书籍").setValue(this.owner.settings.defaultAddType).onChange((value) => this.setValue("defaultAddType", value)));
    containerEl.createEl("h3", { text: "状态标签" });
    this.addLabel("电影：计划状态", "moviePlannedLabel", "想看");
    this.addLabel("电影：完成状态", "movieCompletedLabel", "看过");
    this.addLabel("书籍：计划状态", "bookPlannedLabel", "想读");
    this.addLabel("书籍：完成状态", "bookCompletedLabel", "读过");
  }

  private addPath(name: string, key: keyof MediaQuickEditSettings, description: string, kind: "folder" | "base"): void {
    let input: any;
    const setting = new Setting(this.containerEl).setName(name).setDesc(description).addText((text) => {
      input = text;
      text.setValue(String(this.owner.settings[key] || "")).onChange((value) => this.setValue(key, normalizePathValue(value)));
    });
    setting.addButton((button) => button.setButtonText("选择").onClick(() => {
      const items = kind === "base"
        ? this.app.vault.getFiles().filter((file) => file.extension === "base").map((file) => file.path)
        : this.app.vault.getAllLoadedFiles().filter((item: any) => item.children).map((item) => item.path).filter(Boolean);
      new PathPickerModal(this.app, items, kind === "base" ? "选择 Base 文件" : "选择文件夹", (path) => { input.setValue(path); void this.setValue(key, path); }).open();
    }));
  }

  private async setValue(key: keyof MediaQuickEditSettings, value: any): Promise<void> {
    this.owner.settings[key] = value;
    await this.owner.saveSettings();
  }

  private addLabel(name: string, key: keyof MediaQuickEditSettings, placeholder: string): void {
    new Setting(this.containerEl).setName(name).addText((text) => text.setPlaceholder(placeholder).setValue(String(this.owner.settings[key] || "")).onChange((value) => this.setValue(key, value.trim() || placeholder)));
  }
}

export function normalizePathValue(value: string): string {
  return value.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}
