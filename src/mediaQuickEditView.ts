import { BasesView, Keymap, Notice, TFile } from "obsidian";
import { applyStatusHistory, commentPatch, ratingPatch, statusPatch, StatusValue } from "./history";

const VIEW_TYPE = "media-quick-edit";
const STATUS_VALUES: StatusValue[] = ["planned", "completed"];
const HEADERS = [
  ["title", "标题"], ["type", "类型"], ["rating", "我的评分"], ["status", "状态"],
  ["comment", "短评"], ["finishedDate", "完成日期"], ["modified", "最后修改"]
] as const;
const ROW_HEIGHT = 38;
const OVERSCAN = 8;
const collator = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });

interface RecordItem {
  entry: any; title: string; type: string; rating: number; status: StatusValue;
  comment: string; finishedDate: string; modified: number;
}

class WriteQueue {
  private pending = new Map<string, Promise<void>>();
  constructor(private app: any) {}
  update(file: TFile, patch: Record<string, any>): Promise<void> {
    const previous = this.pending.get(file.path) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(async () => {
      await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, any>) => {
        applyStatusHistory(frontmatter, patch);
        for (const [key, value] of Object.entries(patch)) if (!key.startsWith("__")) frontmatter[key] = value;
      });
    });
    this.pending.set(file.path, next);
    void next.finally(() => { if (this.pending.get(file.path) === next) this.pending.delete(file.path); });
    return next;
  }
}

export class MediaQuickEditView extends BasesView {
  type = VIEW_TYPE;
  private rootEl: HTMLElement;
  private tableWrap: HTMLElement;
  private tableBody: HTMLTableSectionElement;
  private emptyEl: HTMLElement;
  private records: RecordItem[] = [];
  private headers = new Map<string, HTMLTableCellElement>();
  private drafts = new Map<string, string>();
  private timers = new Map<string, number>();
  private busy = new Set<string>();
  private queue: WriteQueue;
  private frame: number | null = null;
  private dataVersion = 0;
  private renderedWindow = "";

  constructor(controller: any, scrollEl: HTMLElement) {
    super(controller);
    this.rootEl = scrollEl.createDiv({ cls: "mqe-view" });
    this.queue = new WriteQueue(this.app);
    this.registerDomEvent(this.rootEl, "scroll", () => this.scheduleRender(), { passive: true });
  }

  private get owner(): any { return (this.app as any).plugins.getPlugin("media-quick-edit"); }
  onDataUpdated(): void { this.refresh(); }
  onunload(): void { if (this.frame !== null) cancelAnimationFrame(this.frame); for (const timer of this.timers.values()) window.clearTimeout(timer); }

  private ensureShell(): void {
    if (this.tableBody) return;
    this.rootEl.empty();
    this.tableWrap = this.rootEl.createDiv({ cls: "mqe-table-wrap" });
    const table = this.tableWrap.createEl("table", { cls: "mqe-table" });
    const head = table.createTHead().insertRow();
    for (const [key, label] of HEADERS) this.createHeader(head, key, label);
    this.tableBody = table.createTBody();
    this.emptyEl = this.rootEl.createDiv({ cls: "mqe-empty", text: "当前筛选下没有条目。" });
  }

  private refresh(): void {
    this.ensureShell();
    const entries = (this as any).data?.data ?? [];
    this.records = this.sort(entries.map((entry: any) => this.readRecord(entry)));
    this.dataVersion += 1; this.renderedWindow = "";
    this.tableWrap.toggle(this.records.length > 0); this.emptyEl.toggle(this.records.length === 0);
    this.updateIndicators(); this.renderRows(); this.scheduleRender();
  }

  private createHeader(row: HTMLTableRowElement, key: string, label: string): void {
    const cell = row.createEl("th", { attr: { "aria-sort": "none" } });
    this.headers.set(key, cell);
    const content = cell.createDiv({ cls: "mqe-header-content" });
    const button = content.createEl("button", { cls: "mqe-sort-button", attr: { type: "button", title: `按${label}倒序排列` } });
    button.createSpan({ text: label }); button.createSpan({ cls: "mqe-sort-indicator" }); button.onclick = () => this.changeSort(key);
    if (key === "title") {
      const add = content.createEl("button", { cls: "mqe-add", text: "+", attr: { type: "button", title: "添加电影、剧集或书籍", "aria-label": "添加电影、剧集或书籍" } });
      add.onclick = (event) => { event.preventDefault(); event.stopPropagation(); this.owner.openAddModal(); };
    }
    this.applyColumnWidth(cell, key);
    const handle = cell.createDiv({ cls: "mqe-resize-handle", attr: { role: "separator", "aria-label": `调整${label}列宽` } });
    this.enableResize(handle, cell, key);
  }

  private get widths(): Record<string, number> { return (this as any).config.get("mediaColumnWidths") || {}; }
  private applyColumnWidth(cell: HTMLTableCellElement, key: string): void { const width = Number(this.widths[key]); if (width > 0) cell.style.width = `${width}px`; }
  private enableResize(handle: HTMLElement, cell: HTMLTableCellElement, key: string): void {
    handle.onpointerdown = (event) => {
      event.preventDefault(); event.stopPropagation();
      const startX = event.clientX; const startWidth = cell.getBoundingClientRect().width; handle.setPointerCapture?.(event.pointerId);
      const move = (e: PointerEvent) => { cell.style.width = `${Math.max(1, startWidth + e.clientX - startX)}px`; };
      const finish = () => { (this as any).config.set("mediaColumnWidths", { ...this.widths, [key]: Math.round(cell.getBoundingClientRect().width) }); handle.removeEventListener("pointermove", move); };
      handle.addEventListener("pointermove", move); handle.addEventListener("pointerup", finish, { once: true }); handle.addEventListener("pointercancel", finish, { once: true });
    };
  }

  private get sortState(): { key: string | null; direction: "ASC" | "DESC" } {
    const value = String((this as any).config.get("mediaSort") || ""); const [key, direction] = value.split(":");
    return { key: HEADERS.some(([candidate]) => candidate === key) ? key : null, direction: direction === "ASC" ? "ASC" : "DESC" };
  }
  private changeSort(key: string): void { const state = this.sortState; const direction = state.key !== key || state.direction === "ASC" ? "DESC" : "ASC"; (this as any).config.set("mediaSort", `${key}:${direction}`); this.records = this.sort(this.records); this.dataVersion += 1; this.renderedWindow = ""; this.updateIndicators(); this.renderRows(); }
  private updateIndicators(): void { const state = this.sortState; for (const [key] of HEADERS) { const cell = this.headers.get(key); if (!cell) continue; const active = state.key === key; cell.setAttribute("aria-sort", active ? state.direction === "ASC" ? "ascending" : "descending" : "none"); const indicator = cell.querySelector(".mqe-sort-indicator"); if (indicator) indicator.textContent = active ? state.direction === "ASC" ? "▲" : "▼" : ""; } }
  private sort(records: RecordItem[]): RecordItem[] {
    const { key, direction } = this.sortState; if (!key) return [...records]; const multiplier = direction === "ASC" ? 1 : -1;
    return [...records].sort((left, right) => {
      if (key === "rating" && (left.rating <= 0) !== (right.rating <= 0)) return left.rating <= 0 ? 1 : -1;
      let value = 0;
      if (key === "title") value = collator.compare(left.title, right.title);
      else if (key === "type") value = collator.compare(this.typeLabel(left.type), this.typeLabel(right.type));
      else if (key === "rating") value = left.rating - right.rating;
      else if (key === "status") value = Number(left.status === "completed") - Number(right.status === "completed");
      else if (key === "comment") value = collator.compare(left.comment, right.comment);
      else if (key === "finishedDate") value = collator.compare(left.finishedDate, right.finishedDate);
      else if (key === "modified") value = left.modified - right.modified;
      if (value) return value * multiplier;
      if (key === "finishedDate" && left.modified !== right.modified) return (left.modified - right.modified) * multiplier;
      return collator.compare(left.title, right.title);
    });
  }

  private scheduleRender(): void { if (this.frame !== null) return; this.frame = requestAnimationFrame(() => { this.frame = null; this.renderRows(); }); }
  private renderRows(): void {
    if (!this.tableBody || !this.records.length) return;
    const bodyOffset = this.tableWrap.offsetTop + (this.tableBody.parentElement?.querySelector("thead")?.clientHeight ?? 0);
    const bodyTop = Math.max(0, this.rootEl.scrollTop - bodyOffset); const visible = Math.max(1, Math.ceil((this.rootEl.clientHeight || 600) / ROW_HEIGHT));
    const start = Math.max(0, Math.floor(bodyTop / ROW_HEIGHT) - OVERSCAN); const end = Math.min(this.records.length, start + visible + OVERSCAN * 2);
    const windowKey = `${this.dataVersion}:${start}:${end}`; if (windowKey === this.renderedWindow) return; this.renderedWindow = windowKey; this.tableBody.empty();
    if (start) this.spacer(start * ROW_HEIGHT); for (let index = start; index < end; index++) this.renderRow(this.records[index]); if (end < this.records.length) this.spacer((this.records.length - end) * ROW_HEIGHT);
  }
  private spacer(height: number): void { const row = this.tableBody.insertRow(); row.classList.add("mqe-spacer-row"); const cell = row.insertCell(); cell.colSpan = HEADERS.length; cell.style.height = `${height}px`; }
  private renderRow(record: RecordItem): void {
    const file = record.entry.file as TFile; const row = this.tableBody.insertRow(); row.classList.add("mqe-row"); row.dataset.path = file.path; row.classList.toggle("is-busy", this.busy.has(file.path));
    const title = row.insertCell().createEl("a", { cls: "mqe-title internal-link", text: record.title, attr: { href: file.path, "data-href": file.path } });
    title.onclick = (event) => { event.preventDefault(); void this.app.workspace.openLinkText(file.path, "", Keymap.isModEvent(event)); };
    row.insertCell().createSpan({ cls: "mqe-type", text: this.typeLabel(record.type) });
    this.renderStars(row.insertCell(), file, record.rating); this.renderStatus(row.insertCell(), file, record.type, record.status); this.renderComment(row.insertCell(), file, record.comment);
    row.insertCell().createSpan({ cls: "mqe-date", text: record.finishedDate || "—" }); row.insertCell().createSpan({ cls: "mqe-date", text: new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "short", hour12: false }).format(new Date(file.stat.mtime)) });
  }

  private renderStars(cell: HTMLTableCellElement, file: TFile, rating: number): void {
    const selected = Math.max(0, Math.min(5, Math.round(rating / 2))); const wrap = cell.createDiv({ cls: "mqe-stars" });
    for (let value = 1; value <= 5; value++) { const star = wrap.createEl("button", { cls: `mqe-star${value <= selected ? " is-active" : ""}`, text: value <= selected ? "★" : "☆", attr: { type: "button", title: `${value} 星` } }); star.onclick = () => void this.apply(file, ratingPatch(value), "评分已保存"); }
  }
  private renderStatus(cell: HTMLTableCellElement, file: TFile, type: string, current: StatusValue): void {
    cell.classList.add("mqe-status-cell"); const details = cell.createEl("details", { cls: "mqe-status-menu" }); const labels = this.owner.statusLabels(type === "book" ? "book" : "movie"); const summary = details.createEl("summary", { cls: "mqe-status", text: labels[current] }); const choices = details.createDiv({ cls: "mqe-status-choices" });
    for (const status of STATUS_VALUES) { const button = choices.createEl("button", { cls: `mqe-status-choice${status === current ? " is-active" : ""}`, text: labels[status], attr: { type: "button" } }); button.onclick = () => { details.open = false; summary.textContent = labels[status]; void this.apply(file, statusPatch(status, labels), "状态已保存"); }; }
  }
  private renderComment(cell: HTMLTableCellElement, file: TFile, saved: string): void {
    const editor = cell.createDiv({ cls: "mqe-comment-editor" }); const input = editor.createEl("input", { cls: "mqe-comment-input", type: "text", value: this.drafts.get(file.path) ?? saved, attr: { placeholder: "写短评……" } });
    input.oninput = () => { this.drafts.set(file.path, input.value); const old = this.timers.get(file.path); if (old) clearTimeout(old); this.timers.set(file.path, window.setTimeout(() => this.saveComment(file, input.value), 600)); };
    input.onblur = () => { if (this.drafts.has(file.path)) void this.saveComment(file, input.value); };
  }
  private async saveComment(file: TFile, comment: string): Promise<void> { const type = this.app.metadataCache.getFileCache(file)?.frontmatter?.type === "book" ? "book" : "movie"; await this.apply(file, commentPatch(comment, this.owner.statusLabels(type).completed), "短评已保存"); this.drafts.delete(file.path); }
  private async apply(file: TFile, patch: Record<string, any>, message: string): Promise<boolean> { this.busy.add(file.path); try { await this.queue.update(file, patch); return true; } catch (error) { console.error(error); new Notice(`保存失败：${file.basename}`); return false; } finally { this.busy.delete(file.path); } }
  private readRecord(entry: any): RecordItem { const file = entry.file as TFile; const fm = this.app.metadataCache.getFileCache(file)?.frontmatter || {}; return { entry, title: String(fm.title || file.basename), type: String(fm.type || ""), rating: Number(fm.personalRating || 0), status: fm.status === "completed" ? "completed" : "planned", comment: String(fm.comment || ""), finishedDate: String(fm.finished_date || ""), modified: file.stat.mtime }; }
  private typeLabel(type: string): string { return type === "book" ? "书" : type === "series" ? "剧集" : type === "musicRelease" ? "音乐" : type === "game" ? "游戏" : "电影"; }
}

export { VIEW_TYPE };
