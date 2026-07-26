import { App, Modal, Notice, Setting, TFile } from "obsidian";
import { localDateString } from "./history";
import { openLibraryCover, searchOpenLibrary } from "./openLibrary";
import { getTmdbDetails, IMAGE_BASE, searchTmdb } from "./tmdb";

function yaml(value: any): string { return JSON.stringify(value ?? ""); }
function yamlArray(values: any[]): string { return `[${[...new Set((values || []).filter(Boolean))].map(yaml).join(", ")}]`; }
function safeName(value: string): string { return value.replace(/[<>:"/\\|?*]/g, " ").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "") || "未命名"; }

export class AddMediaModal extends Modal {
  private queryInput: HTMLInputElement;
  private resultsEl: HTMLElement;
  private mediaType: "movie" | "book";

  constructor(app: App, private owner: any) {
    super(app);
    this.mediaType = owner.settings.defaultAddType || "movie";
  }

  onOpen(): void {
    this.titleEl.setText("添加电影、剧集或书籍");
    new Setting(this.contentEl).setName("搜索标题").setDesc("支持中文、日文和英文").addText((text) => {
      this.queryInput = text.inputEl;
      text.setPlaceholder("输入标题");
      text.inputEl.addEventListener("keydown", (event) => { if (event.key === "Enter") void this.search(); });
    }).addButton((button) => button.setButtonText("搜索").setCta().onClick(() => this.search()));
    new Setting(this.contentEl).setName("添加类型").addDropdown((dropdown) => dropdown.addOption("movie", "电影 / 剧集").addOption("book", "书籍").setValue(this.mediaType).onChange((value: "movie" | "book") => { this.mediaType = value; }));
    this.resultsEl = this.contentEl.createDiv({ cls: "mqe-tmdb-results" });
    window.setTimeout(() => this.queryInput?.focus(), 0);
  }

  private async search(): Promise<void> {
    const query = this.queryInput?.value.trim();
    if (!query) return;
    this.resultsEl.empty();
    this.resultsEl.createEl("p", { text: this.mediaType === "book" ? "正在搜索 Open Library……" : "正在搜索 TMDB……", cls: "mqe-tmdb-muted" });
    try {
      if (this.mediaType === "book") this.renderBooks(await searchOpenLibrary(query));
      else {
        if (!this.owner.settings.tmdbApiKey) throw new Error("请先在插件设置中填写 TMDB API Key");
        this.renderTmdb(await searchTmdb(this.owner.settings.tmdbApiKey, query));
      }
    } catch (error) {
      console.error("Media search failed", error);
      this.resultsEl.setText(error instanceof Error ? error.message : "搜索失败");
    }
  }

  private renderTmdb(results: any[]): void {
    this.resultsEl.empty();
    if (!results.length) return void this.resultsEl.setText("没有找到匹配条目");
    for (const item of results) {
      const title = item.title || item.name || item.original_title || item.original_name;
      const original = item.original_title || item.original_name;
      const year = String(item.release_date || item.first_air_date || "未知年份").slice(0, 4);
      const type = item.media_type === "tv" ? "剧集" : "电影";
      this.resultsEl.createEl("button", { cls: "mqe-tmdb-result", text: `${title}${original && original !== title ? ` / ${original}` : ""} (${year}) · ${type}` }).addEventListener("click", () => this.chooseTmdb(item));
    }
  }

  private renderBooks(results: any[]): void {
    this.resultsEl.empty();
    if (!results.length) return void this.resultsEl.setText("没有找到匹配书籍");
    for (const item of results) {
      const author = (item.author_name || []).slice(0, 3).join("、");
      this.resultsEl.createEl("button", { cls: "mqe-tmdb-result", text: `${item.title || "未命名书籍"}${author ? ` / ${author}` : ""} (${item.first_publish_year || "未知年份"})` }).addEventListener("click", () => this.chooseStatus((status) => this.createBook(item, status), "book"));
    }
  }

  private async chooseTmdb(item: any): Promise<void> {
    this.resultsEl.setText("正在读取条目详情……");
    try {
      const endpoint = item.media_type === "tv" ? "tv" : "movie";
      const details = await getTmdbDetails(this.owner.settings.tmdbApiKey, endpoint, item.id);
      this.chooseStatus((status) => this.createTmdb(details, endpoint, status), "movie");
    } catch (error) { console.error(error); this.resultsEl.setText("读取详情失败"); }
  }

  private chooseStatus(action: (status: "planned" | "completed") => void, type: "movie" | "book"): void {
    this.resultsEl.empty();
    const labels = this.owner.statusLabels(type);
    for (const status of ["planned", "completed"] as const) this.resultsEl.createEl("button", { cls: "mqe-tmdb-status", text: labels[status] }).addEventListener("click", () => action(status));
  }

  private async createBook(item: any, status: "planned" | "completed"): Promise<void> {
    const title = item.title || "未命名书籍";
    const year = item.first_publish_year || "未知";
    const today = localDateString();
    const labels = this.owner.statusLabels("book");
    const path = `${this.owner.settings.bookFolder}/${safeName(`${title} (${year}) [openlibrary]`)}.md`;
    const content = `---\ntype: book\ntitle: ${yaml(title)}\nauthor: ${yamlArray(item.author_name || [])}\nyear: ${yaml(year)}\nisbn: ${yaml((item.isbn || [])[0] || "")}\ndataSource: OpenLibrary\nopenLibraryKey: ${yaml(item.key || "")}\nimage: ${yaml(openLibraryCover(item.cover_i))}\nstatus: ${status}\npersonalRating: 0\nfinished_date: ${today}\ncomment: ""\ndate_added: ${today}\nstatus_history:\n  - ${yaml(`${today} | ${labels[status]}`)}\nmediaQuickEditSchema: 2\ntags:\n  - mediaDB/book\n---\n\n# ${title}\n\n## 短评\n\n## 阅读记录\n`;
    await this.createFile(path, content, title);
  }

  private async createTmdb(details: any, endpoint: "movie" | "tv", status: "planned" | "completed"): Promise<void> {
    const title = details.title || details.name || details.original_title || details.original_name;
    const original = details.original_title || details.original_name || title;
    const release = details.release_date || details.first_air_date || "";
    const year = release.slice(0, 4);
    const mediaType = endpoint === "tv" ? "series" : "movie";
    const directors = endpoint === "movie" ? (details.credits?.crew || []).filter((x: any) => x.job === "Director").map((x: any) => x.name) : (details.created_by || []).map((x: any) => x.name);
    const writers = (details.credits?.crew || []).filter((x: any) => x.department === "Writing").map((x: any) => x.name).slice(0, 10);
    const actors = (details.credits?.cast || []).slice(0, 12).map((x: any) => x.name);
    const today = localDateString();
    const labels = this.owner.statusLabels("movie");
    const duration = endpoint === "movie" ? details.runtime || 0 : (details.episode_run_time || [])[0] || 0;
    const path = `${this.owner.settings.movieFolder}/${safeName(`${title} (${year || "未知"}) [tmdb-${details.id}]`)}.md`;
    const content = `---\ntype: ${mediaType}\ntmdbType: ${endpoint}\ntitle: ${yaml(title)}\nenglishTitle: ${yaml(original)}\naliases: ${yamlArray([title, original])}\nyear: ${yaml(year)}\ndataSource: TMDBAPI\nurl: ${yaml(`https://www.themoviedb.org/${endpoint}/${details.id}`)}\nid: ${details.id}\nimdbId: ${yaml(details.external_ids?.imdb_id || "")}\nauthor: ${yamlArray(directors)}\ndirector: ${yamlArray(directors)}\nwriter: ${yamlArray(writers)}\nactors: ${yamlArray(actors)}\ngenres: ${yamlArray((details.genres || []).map((x: any) => x.name))}\nplot: ${yaml(details.overview || "")}\nduration: ${duration}\nimage: ${yaml(details.poster_path ? `${IMAGE_BASE}${details.poster_path}` : "")}\nbackdrop: ${yaml(details.backdrop_path ? `${IMAGE_BASE}${details.backdrop_path}` : "")}\nonlineRating: ${Number(details.vote_average || 0).toFixed(1)}\nvoteCount: ${details.vote_count || 0}\npremiere: ${yaml(release)}\nstatus: ${status}\npersonalRating: 0\nfinished_date: ${today}\ncomment: ""\ndate_added: ${today}\nstatus_history:\n  - ${yaml(`${today} | ${labels[status]}`)}\nmediaQuickEditSchema: 2\ntags:\n  - mediaDB/${mediaType}\n---\n\n# ${title}\n\n## 短评\n\n## 观看记录\n`;
    await this.createFile(path, content, title);
  }

  private async createFile(path: string, content: string, title: string): Promise<void> {
    if (this.app.vault.getAbstractFileByPath(path)) return void new Notice("该条目已经存在");
    await this.owner.ensureFolder(path.substring(0, path.lastIndexOf("/")));
    const file = await this.app.vault.create(path, content) as TFile;
    new Notice(`已添加：${title}`);
    this.close();
    if (this.owner.settings.autoOpenNewEntry) await this.app.workspace.getLeaf(true).openFile(file);
  }
}
