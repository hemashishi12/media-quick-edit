import { BasesView, Keymap, Menu, Notice, setIcon, TFile } from "obsidian";
import { applyStatusHistory, commentPatch, ratingPatch } from "./history";
import { touchLastUpdated } from "./lastUpdated";

export const SHELF_VIEW_TYPE = "media-shelf";

type ShelfFilter = "all" | "book" | "movie" | "series";
type ShelfSort = "recent" | "rating" | "title";

interface ShelfRecord {
  entry: any;
  file: TFile;
  title: string;
  type: string;
  rating: number;
  comment: string;
  status: string;
  image: string;
  author: string;
  year: string;
  dateAdded: number;
  modified: number;
}

const BATCH_SIZE = 84;
const collator = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });

export function normalizeCoverSource(value: unknown): string {
  const candidate = Array.isArray(value) ? value.find((item) => typeof item === "string" && item.trim()) : value;
  if (typeof candidate !== "string") return "";
  let source = candidate.trim();
  const markdown = source.match(/^!\[[^\]]*\]\((.+)\)$/);
  if (markdown) source = markdown[1].trim();
  const wiki = source.match(/^!?\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/);
  if (wiki) source = wiki[1].trim();
  if (/^data:image\/svg\+xml/i.test(source) && /No(?:%20|\s)cover/i.test(source)) return "";
  return source;
}

export function coverVariantFor(title: string): number {
  let hash = 0;
  for (const character of title) hash = ((hash << 5) - hash + character.codePointAt(0)!) | 0;
  return Math.abs(hash) % 6;
}

function stringValue(value: unknown): string {
  if (Array.isArray(value)) return value.filter(Boolean).slice(0, 3).join("、");
  return value == null ? "" : String(value);
}

function timestamp(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export class MediaShelfView extends BasesView {
  type = SHELF_VIEW_TYPE;
  private rootEl: HTMLElement;
  private gridEl: HTMLElement;
  private emptyEl: HTMLElement;
  private countEl: HTMLElement;
  private loadMoreEl: HTMLButtonElement;
  private records: ShelfRecord[] = [];
  private visibleRecords: ShelfRecord[] = [];
  private activeFilter: ShelfFilter = "all";
  private query = "";
  private renderedCount = 0;
  private filterButtons = new Map<ShelfFilter, HTMLButtonElement>();
  private observer: IntersectionObserver | null = null;
  private searchTimer: number | null = null;
  private pending = new Map<string, Promise<void>>();
  private activeCommentEditor: { file: TFile; original: string; draft: string } | null = null;
  private commentCommitPath = "";
  private commentFocusTimer: number | null = null;

  constructor(controller: any, scrollEl: HTMLElement) {
    super(controller);
    this.rootEl = scrollEl.createDiv({ cls: "mqe-shelf-view" });
  }

  private get owner(): any { return (this.app as any).plugins.getPlugin("media-quick-edit"); }

  onDataUpdated(): void { this.refresh(); }

  onunload(): void {
    this.observer?.disconnect();
    if (this.searchTimer !== null) window.clearTimeout(this.searchTimer);
    if (this.commentFocusTimer !== null) window.clearTimeout(this.commentFocusTimer);
  }

  private ensureShell(): void {
    this.rootEl.empty();
    const header = this.rootEl.createDiv({ cls: "mqe-shelf-header" });
    const heading = header.createDiv({ cls: "mqe-shelf-heading" });
    heading.createEl("h2", { text: "书架" });
    this.countEl = heading.createSpan({ cls: "mqe-shelf-count", text: "0 部作品" });

    const actions = header.createDiv({ cls: "mqe-shelf-actions" });
    const searchWrap = actions.createDiv({ cls: "mqe-shelf-search" });
    searchWrap.createSpan({ cls: "mqe-shelf-search-icon", text: "⌕" });
    const search = searchWrap.createEl("input", { type: "search", attr: { placeholder: "搜索书名、电影或作者", "aria-label": "搜索书架" } });
    search.addEventListener("input", () => {
      if (this.searchTimer !== null) window.clearTimeout(this.searchTimer);
      this.searchTimer = window.setTimeout(() => {
        this.searchTimer = null;
        this.query = search.value.trim().toLocaleLowerCase("zh-CN");
        this.applyView();
      }, 120);
    });

    const sort = actions.createEl("select", { cls: "mqe-shelf-sort", attr: { "aria-label": "书架排序" } });
    for (const [value, label] of [["recent", "最近添加"], ["rating", "评分最高"], ["title", "标题排序"]] as const) {
      sort.createEl("option", { text: label, attr: { value } });
    }
    sort.value = this.sortState;
    sort.addEventListener("change", () => {
      (this as any).config.set("mediaShelfSort", sort.value);
      this.applyView();
    });

    const add = actions.createEl("button", { cls: "mqe-shelf-add", text: "+ 添加条目", attr: { type: "button" } });
    add.addEventListener("click", () => this.owner.openAddModal());

    const filters = this.rootEl.createDiv({ cls: "mqe-shelf-filters", attr: { role: "group", "aria-label": "媒体类型" } });
    for (const [value, label] of [["all", "全部"], ["book", "书籍"], ["movie", "电影"], ["series", "剧集"]] as const) {
      const button = filters.createEl("button", { cls: "mqe-shelf-filter", text: label, attr: { type: "button", "aria-pressed": value === this.activeFilter ? "true" : "false" } });
      button.addEventListener("click", () => {
        this.activeFilter = value;
        (this as any).config.set("mediaShelfFilter", value);
        this.applyView();
      });
      this.filterButtons.set(value, button);
    }

    const content = this.rootEl.createDiv({ cls: "mqe-shelf-content" });
    this.gridEl = content.createDiv({ cls: "mqe-shelf-grid" });
    this.emptyEl = content.createDiv({ cls: "mqe-shelf-empty", text: "当前筛选下没有作品。" });
    this.loadMoreEl = content.createEl("button", { cls: "mqe-shelf-more", text: "加载更多", attr: { type: "button" } });
    this.loadMoreEl.addEventListener("click", () => this.appendBatch());

    const savedFilter = String((this as any).config.get("mediaShelfFilter") || "all") as ShelfFilter;
    if (["all", "book", "movie", "series"].includes(savedFilter)) this.activeFilter = savedFilter;
    this.updateFilterButtons();

    if (typeof IntersectionObserver !== "undefined") {
      this.observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) this.appendBatch();
      }, { root: this.rootEl.parentElement, rootMargin: "500px 0px" });
      this.observer.observe(this.loadMoreEl);
    }
  }

  private get sortState(): ShelfSort {
    const value = String((this as any).config.get("mediaShelfSort") || "recent");
    return value === "rating" || value === "title" ? value : "recent";
  }

  private refresh(): void {
    this.ensureShell();
    const entries = (this as any).data?.data ?? [];
    this.records = entries.map((entry: any) => this.readRecord(entry));
    this.applyView();
  }

  private readRecord(entry: any): ShelfRecord {
    const file = entry.file as TFile;
    const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter || {};
    const image = normalizeCoverSource(
      frontmatter.image ?? frontmatter.cover ?? frontmatter.poster ?? frontmatter.thumbnail ?? frontmatter.coverUrl ?? frontmatter.cover_url
    );
    return {
      entry,
      file,
      title: String(frontmatter.title || file.basename),
      type: String(frontmatter.type || "movie"),
      rating: Number(frontmatter.personalRating || 0),
      comment: String(frontmatter.comment || ""),
      status: String(frontmatter.status || "planned"),
      image,
      author: stringValue(frontmatter.author || frontmatter.director),
      year: stringValue(frontmatter.year || String(frontmatter.premiere || "").slice(0, 4)),
      dateAdded: timestamp(frontmatter.date_added, file.stat.mtime),
      modified: file.stat.mtime
    };
  }

  private applyView(): void {
    const query = this.query;
    this.visibleRecords = this.records.filter((record) => {
      if (this.activeFilter !== "all" && this.typeGroup(record.type) !== this.activeFilter) return false;
      if (!query) return true;
      return `${record.title} ${record.author} ${record.year}`.toLocaleLowerCase("zh-CN").includes(query);
    });
    const sort = this.sortState;
    this.visibleRecords.sort((left, right) => {
      if (sort === "title") return collator.compare(left.title, right.title);
      if (sort === "rating") {
        if ((left.rating <= 0) !== (right.rating <= 0)) return left.rating <= 0 ? 1 : -1;
        return right.rating - left.rating || right.modified - left.modified;
      }
      return right.dateAdded - left.dateAdded || right.modified - left.modified;
    });

    this.gridEl.empty();
    this.renderedCount = 0;
    this.emptyEl.hidden = this.visibleRecords.length > 0;
    this.countEl.setText(`${this.visibleRecords.length} 部作品`);
    this.updateFilterButtons();
    this.appendBatch();
  }

  private appendBatch(): void {
    if (this.renderedCount >= this.visibleRecords.length) {
      this.loadMoreEl.hidden = true;
      return;
    }
    const end = Math.min(this.visibleRecords.length, this.renderedCount + BATCH_SIZE);
    for (let index = this.renderedCount; index < end; index++) this.renderCard(this.visibleRecords[index]);
    this.renderedCount = end;
    const remaining = this.visibleRecords.length - end;
    this.loadMoreEl.hidden = remaining <= 0;
    this.loadMoreEl.setText(remaining > 0 ? `加载更多（剩余 ${remaining}）` : "");
  }

  private renderCard(record: ShelfRecord): void {
    const card = this.gridEl.createEl("article", { cls: "mqe-shelf-card" });
    card.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const menu = new Menu();
      menu.addItem((item) => item
        .setTitle(record.comment ? "编辑短评" : "添加短评")
        .setIcon("message-square")
        .onClick(() => this.openCommentEditor(record)));
      menu.showAtMouseEvent(event);
    });
    const coverWrap = card.createDiv({ cls: "mqe-shelf-cover-wrap" });
    const cover = coverWrap.createEl("button", {
      cls: `mqe-shelf-cover mqe-shelf-cover--${coverVariantFor(record.title)}`,
      attr: { type: "button", "aria-label": `打开 ${record.title}` }
    });
    cover.addEventListener("click", (event) => this.openRecord(record.file, event));
    const art = cover.createDiv({ cls: "mqe-shelf-cover-art" });
    art.createSpan({ cls: "mqe-shelf-cover-orbit" });
    art.createSpan({ cls: "mqe-shelf-cover-kicker", text: record.author || this.typeLabel(record.type) });
    art.createSpan({ cls: "mqe-shelf-cover-title", text: record.title });
    if (record.year) art.createSpan({ cls: "mqe-shelf-cover-year", text: record.year });

    const imageSource = this.resolveCover(record);
    if (imageSource) {
      const image = cover.createEl("img", { cls: "mqe-shelf-cover-image", attr: { alt: `${record.title} 封面`, loading: "lazy", decoding: "async" } });
      void this.loadCoverImage(image, cover, imageSource);
    }
    cover.createSpan({ cls: "mqe-shelf-type", text: this.typeLabel(record.type) });
    if (record.status !== "completed") cover.createSpan({ cls: "mqe-shelf-planned", text: this.typeGroup(record.type) === "book" ? "想读" : "想看" });
    const edit = coverWrap.createEl("button", {
      cls: "mqe-shelf-cover-edit",
      attr: { type: "button", title: record.comment ? "编辑短评" : "添加短评", "aria-label": record.comment ? "编辑短评" : "添加短评" }
    });
    setIcon(edit, "pencil");
    edit.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.openCommentEditor(record);
    });

    const title = card.createEl("a", { cls: "mqe-shelf-title internal-link", text: record.title, attr: { href: record.file.path, "data-href": record.file.path } });
    title.addEventListener("click", (event) => { event.preventDefault(); this.openRecord(record.file, event); });
    const byline = [record.author, record.year].filter(Boolean).join(" · ");
    card.createDiv({ cls: "mqe-shelf-byline", text: byline || this.typeLabel(record.type) });
    this.renderRating(card, record);
  }

  private renderRating(card: HTMLElement, record: ShelfRecord): void {
    const row = card.createDiv({ cls: "mqe-shelf-rating", attr: { "aria-label": record.rating > 0 ? `我的评分 ${record.rating} 分` : "未评分" } });
    this.renderRatingContent(row, record);
  }

  private renderRatingContent(row: HTMLElement, record: ShelfRecord): void {
    row.empty();
    row.setAttribute("aria-label", record.rating > 0 ? `我的评分 ${record.rating} 分` : "未评分");
    if (this.activeCommentEditor?.file.path === record.file.path) {
      this.renderCommentEditor(row, record);
      return;
    }

    const stars = row.createDiv({ cls: "mqe-shelf-stars" });
    const selected = Math.max(0, Math.min(5, Math.round(record.rating / 2)));
    for (let value = 1; value <= 5; value++) {
      const button = stars.createEl("button", { cls: `mqe-shelf-star${value <= selected ? " is-active" : ""}`, text: value <= selected ? "★" : "☆", attr: { type: "button", title: `${value} 星`, "aria-label": `${value} 星` } });
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const previous = record.rating;
        record.rating = value * 2;
        this.openCommentEditor(record, row);
        try { await this.saveRating(record.file, value); }
        catch (error) {
          console.error(error);
          record.rating = previous;
          new Notice(`评分保存失败：${record.title}`);
        }
      });
    }
    const score = row.createSpan({ cls: "mqe-shelf-score", text: record.rating > 0 ? record.rating.toFixed(1) : "未评分" });
  }

  private openCommentEditor(record: ShelfRecord, row?: HTMLElement): void {
    if (this.activeCommentEditor?.file.path === record.file.path) return;
    if (this.activeCommentEditor) {
      const previous = this.activeCommentEditor;
      this.activeCommentEditor = null;
      if (previous.draft !== previous.original) {
        void this.saveComment(previous.file, previous.draft).catch((error) => {
          console.error(error);
          new Notice(`短评保存失败：${previous.file.basename}`);
        });
      }
    }
    this.activeCommentEditor = { file: record.file, original: record.comment, draft: record.comment };
    if (row) this.renderRatingContent(row, record);
    else this.applyView();
  }

  private renderCommentEditor(row: HTMLElement, record: ShelfRecord): void {
    const state = this.activeCommentEditor;
    if (!state || state.file.path !== record.file.path) return;
    const editor = row.createDiv({ cls: "mqe-shelf-comment-editor" });
    const input = editor.createEl("input", {
      cls: "mqe-shelf-comment-input",
      type: "text",
      value: state.draft,
      attr: { placeholder: "写短评……", "aria-label": `为 ${record.title} 写短评` }
    });
    input.addEventListener("input", () => {
      if (this.activeCommentEditor?.file.path === record.file.path) this.activeCommentEditor.draft = input.value;
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.cancelCommentEditor(record, row);
      } else if (event.key === "Enter") {
        event.preventDefault();
        void this.commitCommentEditor(record, row, input);
      }
    });
    input.addEventListener("blur", () => {
      if (input.isConnected) void this.commitCommentEditor(record, row, input);
    });
    if (this.commentFocusTimer !== null) window.clearTimeout(this.commentFocusTimer);
    this.commentFocusTimer = window.setTimeout(() => {
      this.commentFocusTimer = null;
      if (!input.isConnected || this.activeCommentEditor?.file.path !== record.file.path) return;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }, 0);
  }

  private cancelCommentEditor(record: ShelfRecord, row: HTMLElement): void {
    if (this.activeCommentEditor?.file.path !== record.file.path) return;
    this.activeCommentEditor = null;
    this.renderRatingContent(row, record);
  }

  private async commitCommentEditor(record: ShelfRecord, row: HTMLElement, input: HTMLInputElement): Promise<void> {
    const state = this.activeCommentEditor;
    if (!state || state.file.path !== record.file.path || this.commentCommitPath === record.file.path) return;
    state.draft = input.value;
    this.commentCommitPath = record.file.path;
    this.activeCommentEditor = null;
    this.renderRatingContent(row, record);
    try {
      if (state.draft !== state.original) {
        await this.saveComment(record.file, state.draft);
        record.comment = state.draft;
      }
    } catch (error) {
      console.error(error);
      this.activeCommentEditor = state;
      this.commentCommitPath = "";
      this.applyView();
      new Notice(`短评保存失败：${record.title}`);
      return;
    }
    this.commentCommitPath = "";
    this.applyView();
  }

  private async saveRating(file: TFile, stars: number): Promise<void> {
    await this.savePatch(file, ratingPatch(stars));
  }

  private async saveComment(file: TFile, comment: string): Promise<void> {
    const type = this.app.metadataCache.getFileCache(file)?.frontmatter?.type === "book" ? "book" : "movie";
    await this.savePatch(file, commentPatch(comment, this.owner.statusLabels(type).completed));
  }

  private async savePatch(file: TFile, patch: Record<string, any>): Promise<void> {
    const previous = this.pending.get(file.path) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(async () => {
      await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, any>) => {
        touchLastUpdated(frontmatter);
        applyStatusHistory(frontmatter, patch);
        for (const [key, value] of Object.entries(patch)) if (!key.startsWith("__")) frontmatter[key] = value;
      });
    });
    this.pending.set(file.path, next);
    try { await next; }
    finally { if (this.pending.get(file.path) === next) this.pending.delete(file.path); }
  }

  private resolveCover(record: ShelfRecord): string {
    if (!record.image) return "";
    if (/^(https?:|data:|blob:|app:)/i.test(record.image)) return record.image;
    const linked = this.app.metadataCache.getFirstLinkpathDest?.(record.image, record.file.path)
      ?? this.app.vault.getAbstractFileByPath(record.image);
    return linked instanceof TFile ? this.app.vault.getResourcePath(linked) : "";
  }

  private async loadCoverImage(image: HTMLImageElement, cover: HTMLElement, source: string): Promise<void> {
    const isRemote = /^https?:\/\//i.test(source);
    let cached: string | null = null;
    if (isRemote) {
      try { cached = await this.owner.coverCache?.getCachedResource(source) ?? null; }
      catch (error) { console.debug("Media Quick Edit cover cache lookup failed", error); }
    }
    if (!image.isConnected) return;
    const initialSource = cached || source;
    image.addEventListener("load", () => {
      cover.addClass("has-cover-image");
      if (isRemote && !cached) {
        void this.owner.coverCache?.cacheRemote(source).then((localSource: string | null) => {
          if (localSource && image.isConnected) image.src = localSource;
        });
      }
    }, { once: true });
    image.addEventListener("error", () => {
      if (cached && image.isConnected) {
        void this.owner.coverCache?.invalidate(source).finally(() => {
          cached = null;
          if (!image.isConnected) return;
          image.addEventListener("error", () => image.remove(), { once: true });
          image.src = source;
        });
      } else image.remove();
    }, { once: true });
    image.src = initialSource;
  }

  private openRecord(file: TFile, event: MouseEvent): void {
    void this.app.workspace.openLinkText(file.path, "", Keymap.isModEvent(event));
  }

  private updateFilterButtons(): void {
    for (const [value, button] of this.filterButtons) {
      const active = value === this.activeFilter;
      button.toggleClass("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    }
  }

  private typeGroup(type: string): Exclude<ShelfFilter, "all"> {
    if (type === "book") return "book";
    if (type === "series") return "series";
    return "movie";
  }

  private typeLabel(type: string): string {
    return type === "book" ? "书籍" : type === "series" ? "剧集" : type === "musicRelease" ? "音乐" : type === "game" ? "游戏" : "电影";
  }
}
