var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => MediaQuickEditPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian6 = require("obsidian");

// src/addMediaModal.ts
var import_obsidian3 = require("obsidian");

// src/history.ts
function localDateString(date = /* @__PURE__ */ new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function ratingPatch(stars) {
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw new RangeError("Stars must be a whole number from 1 to 5.");
  return { personalRating: stars * 2, status: "completed", finished_date: localDateString(), __statusHistoryAction: `\u8BC4\u5206\uFF1A${stars * 2}\u5206` };
}
function statusPatch(status, labels) {
  return { status, finished_date: localDateString(), __statusHistoryAction: labels[status] };
}
function commentPatch(comment, completedLabel) {
  return { comment, status: "completed", finished_date: localDateString(), __statusHistoryAction: `${completedLabel}\uFF08\u77ED\u8BC4\uFF09` };
}
function applyStatusHistory(frontmatter, patch) {
  const action = patch.__statusHistoryAction;
  if (!action) return;
  const history = Array.isArray(frontmatter.status_history) ? frontmatter.status_history.map((item) => typeof item === "string" ? item : `${item?.date || ""} | ${item?.action || ""}`.trim()) : [];
  const previousDate = frontmatter.finished_date;
  if (previousDate && previousDate !== patch.finished_date && !history.some((item) => item.startsWith(`${previousDate} |`))) {
    history.push(`${previousDate} | ${frontmatter.status === "completed" ? "\u770B\u8FC7" : "\u60F3\u770B"}`);
  }
  history.push(`${patch.finished_date || localDateString()} | ${action}`);
  frontmatter.status_history = history;
}

// src/openLibrary.ts
var import_obsidian = require("obsidian");
async function searchOpenLibrary(query, timeoutMs = 15e3) {
  const url = `https://openlibrary.org/search.json?${new URLSearchParams({ q: query, limit: "20" }).toString()}`;
  const request = (0, import_obsidian.requestUrl)({ url, headers: { accept: "application/json" } }).then((response) => response.json);
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = globalThis.setTimeout(() => reject(new Error("Open Library request timed out")), timeoutMs);
  });
  try {
    const data = await Promise.race([request, timeout]);
    return (data.docs || []).slice(0, 20);
  } finally {
    if (timeoutId !== void 0) globalThis.clearTimeout(timeoutId);
  }
}
function openLibraryCover(coverId) {
  return coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : OPEN_LIBRARY_PLACEHOLDER;
}
var OPEN_LIBRARY_PLACEHOLDER = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="360" height="540"><rect width="100%" height="100%" fill="#2f3136"/><path d="M95 100h170v340H95z" fill="#454950"/><path d="M125 150h110M125 190h110M125 230h80" stroke="#9ca3af" stroke-width="12" stroke-linecap="round"/><text x="180" y="360" text-anchor="middle" fill="#d1d5db" font-family="sans-serif" font-size="28">No cover</text></svg>')}`;

// src/tmdb.ts
var import_obsidian2 = require("obsidian");
var API_BASE = "https://api.themoviedb.org/3";
var IMAGE_BASE = "https://image.tmdb.org/t/p/original";
async function tmdbRequest(apiKey, endpoint, params = {}) {
  const normalizedKey = apiKey.trim();
  if (!normalizedKey) throw new Error("TMDB API Key is not configured");
  const query = new URLSearchParams({ ...params, api_key: normalizedKey });
  const response = await (0, import_obsidian2.requestUrl)({ url: `${API_BASE}${endpoint}?${query.toString()}`, headers: { accept: "application/json" } });
  return response.json;
}
async function searchTmdb(apiKey, query) {
  for (const language of ["zh-CN", "ja-JP", "en-US"]) {
    const data = await tmdbRequest(apiKey, "/search/multi", { query, language, include_adult: "false", page: "1" });
    const results = (data.results || []).filter((item) => item.media_type === "movie" || item.media_type === "tv");
    if (results.length) return results.slice(0, 20);
  }
  return [];
}
async function getTmdbDetails(apiKey, type, id) {
  return tmdbRequest(apiKey, `/${type}/${id}`, { language: "zh-CN", append_to_response: "credits,external_ids" });
}

// src/addMediaModal.ts
function yaml(value) {
  return JSON.stringify(value ?? "");
}
function yamlArray(values) {
  return `[${[...new Set((values || []).filter(Boolean))].map(yaml).join(", ")}]`;
}
function safeName(value) {
  return value.replace(/[<>:"/\\|?*]/g, " ").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "") || "\u672A\u547D\u540D";
}
var AddMediaModal = class extends import_obsidian3.Modal {
  constructor(app, owner) {
    super(app);
    this.owner = owner;
    this.mediaType = owner.settings.defaultAddType || "movie";
  }
  queryInput;
  resultsEl;
  mediaType;
  onOpen() {
    this.titleEl.setText("\u6DFB\u52A0\u7535\u5F71\u3001\u5267\u96C6\u6216\u4E66\u7C4D");
    new import_obsidian3.Setting(this.contentEl).setName("\u641C\u7D22\u6807\u9898").setDesc("\u652F\u6301\u4E2D\u6587\u3001\u65E5\u6587\u548C\u82F1\u6587").addText((text) => {
      this.queryInput = text.inputEl;
      text.setPlaceholder("\u8F93\u5165\u6807\u9898");
      text.inputEl.addEventListener("keydown", (event) => {
        if (event.key === "Enter") void this.search();
      });
    }).addButton((button) => button.setButtonText("\u641C\u7D22").setCta().onClick(() => this.search()));
    new import_obsidian3.Setting(this.contentEl).setName("\u6DFB\u52A0\u7C7B\u578B").addDropdown((dropdown) => dropdown.addOption("movie", "\u7535\u5F71 / \u5267\u96C6").addOption("book", "\u4E66\u7C4D").setValue(this.mediaType).onChange((value) => {
      this.mediaType = value;
    }));
    this.resultsEl = this.contentEl.createDiv({ cls: "mqe-tmdb-results" });
    window.setTimeout(() => this.queryInput?.focus(), 0);
  }
  async search() {
    const query = this.queryInput?.value.trim();
    if (!query) return;
    this.resultsEl.empty();
    this.resultsEl.createEl("p", { text: this.mediaType === "book" ? "\u6B63\u5728\u641C\u7D22 Open Library\u2026\u2026" : "\u6B63\u5728\u641C\u7D22 TMDB\u2026\u2026", cls: "mqe-tmdb-muted" });
    try {
      if (this.mediaType === "book") this.renderBooks(await searchOpenLibrary(query));
      else {
        if (!this.owner.settings.tmdbApiKey) throw new Error("\u8BF7\u5148\u5728\u63D2\u4EF6\u8BBE\u7F6E\u4E2D\u586B\u5199 TMDB API Key");
        this.renderTmdb(await searchTmdb(this.owner.settings.tmdbApiKey, query));
      }
    } catch (error) {
      console.error("Media search failed", error);
      this.resultsEl.setText(error instanceof Error ? error.message : "\u641C\u7D22\u5931\u8D25");
    }
  }
  renderTmdb(results) {
    this.resultsEl.empty();
    if (!results.length) return void this.resultsEl.setText("\u6CA1\u6709\u627E\u5230\u5339\u914D\u6761\u76EE");
    for (const item of results) {
      const title = item.title || item.name || item.original_title || item.original_name;
      const original = item.original_title || item.original_name;
      const year = String(item.release_date || item.first_air_date || "\u672A\u77E5\u5E74\u4EFD").slice(0, 4);
      const type = item.media_type === "tv" ? "\u5267\u96C6" : "\u7535\u5F71";
      this.resultsEl.createEl("button", { cls: "mqe-tmdb-result", text: `${title}${original && original !== title ? ` / ${original}` : ""} (${year}) \xB7 ${type}` }).addEventListener("click", () => this.chooseTmdb(item));
    }
  }
  renderBooks(results) {
    this.resultsEl.empty();
    if (!results.length) return void this.resultsEl.setText("\u6CA1\u6709\u627E\u5230\u5339\u914D\u4E66\u7C4D");
    for (const item of results) {
      const author = (item.author_name || []).slice(0, 3).join("\u3001");
      this.resultsEl.createEl("button", { cls: "mqe-tmdb-result", text: `${item.title || "\u672A\u547D\u540D\u4E66\u7C4D"}${author ? ` / ${author}` : ""} (${item.first_publish_year || "\u672A\u77E5\u5E74\u4EFD"})` }).addEventListener("click", () => this.chooseStatus((status) => this.createBook(item, status), "book"));
    }
  }
  async chooseTmdb(item) {
    this.resultsEl.setText("\u6B63\u5728\u8BFB\u53D6\u6761\u76EE\u8BE6\u60C5\u2026\u2026");
    try {
      const endpoint = item.media_type === "tv" ? "tv" : "movie";
      const details = await getTmdbDetails(this.owner.settings.tmdbApiKey, endpoint, item.id);
      this.chooseStatus((status) => this.createTmdb(details, endpoint, status), "movie");
    } catch (error) {
      console.error(error);
      this.resultsEl.setText("\u8BFB\u53D6\u8BE6\u60C5\u5931\u8D25");
    }
  }
  chooseStatus(action, type) {
    this.resultsEl.empty();
    const labels = this.owner.statusLabels(type);
    for (const status of ["planned", "completed"]) this.resultsEl.createEl("button", { cls: "mqe-tmdb-status", text: labels[status] }).addEventListener("click", () => action(status));
  }
  async createBook(item, status) {
    const title = item.title || "\u672A\u547D\u540D\u4E66\u7C4D";
    const year = item.first_publish_year || "\u672A\u77E5";
    const today = localDateString();
    const labels = this.owner.statusLabels("book");
    const path = `${this.owner.settings.bookFolder}/${safeName(`${title} (${year}) [openlibrary]`)}.md`;
    const content = `---
type: book
title: ${yaml(title)}
author: ${yamlArray(item.author_name || [])}
year: ${yaml(year)}
isbn: ${yaml((item.isbn || [])[0] || "")}
dataSource: OpenLibrary
openLibraryKey: ${yaml(item.key || "")}
image: ${yaml(openLibraryCover(item.cover_i))}
status: ${status}
personalRating: 0
finished_date: ${today}
comment: ""
date_added: ${today}
status_history:
  - ${yaml(`${today} | ${labels[status]}`)}
mediaQuickEditSchema: 2
tags:
  - mediaDB/book
---

# ${title}

## \u77ED\u8BC4

## \u9605\u8BFB\u8BB0\u5F55
`;
    await this.createFile(path, content, title);
  }
  async createTmdb(details, endpoint, status) {
    const title = details.title || details.name || details.original_title || details.original_name;
    const original = details.original_title || details.original_name || title;
    const release = details.release_date || details.first_air_date || "";
    const year = release.slice(0, 4);
    const mediaType = endpoint === "tv" ? "series" : "movie";
    const directors = endpoint === "movie" ? (details.credits?.crew || []).filter((x) => x.job === "Director").map((x) => x.name) : (details.created_by || []).map((x) => x.name);
    const writers = (details.credits?.crew || []).filter((x) => x.department === "Writing").map((x) => x.name).slice(0, 10);
    const actors = (details.credits?.cast || []).slice(0, 12).map((x) => x.name);
    const today = localDateString();
    const labels = this.owner.statusLabels("movie");
    const duration = endpoint === "movie" ? details.runtime || 0 : (details.episode_run_time || [])[0] || 0;
    const path = `${this.owner.settings.movieFolder}/${safeName(`${title} (${year || "\u672A\u77E5"}) [tmdb-${details.id}]`)}.md`;
    const content = `---
type: ${mediaType}
tmdbType: ${endpoint}
title: ${yaml(title)}
englishTitle: ${yaml(original)}
aliases: ${yamlArray([title, original])}
year: ${yaml(year)}
dataSource: TMDBAPI
url: ${yaml(`https://www.themoviedb.org/${endpoint}/${details.id}`)}
id: ${details.id}
imdbId: ${yaml(details.external_ids?.imdb_id || "")}
author: ${yamlArray(directors)}
director: ${yamlArray(directors)}
writer: ${yamlArray(writers)}
actors: ${yamlArray(actors)}
genres: ${yamlArray((details.genres || []).map((x) => x.name))}
plot: ${yaml(details.overview || "")}
duration: ${duration}
image: ${yaml(details.poster_path ? `${IMAGE_BASE}${details.poster_path}` : "")}
backdrop: ${yaml(details.backdrop_path ? `${IMAGE_BASE}${details.backdrop_path}` : "")}
onlineRating: ${Number(details.vote_average || 0).toFixed(1)}
voteCount: ${details.vote_count || 0}
premiere: ${yaml(release)}
status: ${status}
personalRating: 0
finished_date: ${today}
comment: ""
date_added: ${today}
status_history:
  - ${yaml(`${today} | ${labels[status]}`)}
mediaQuickEditSchema: 2
tags:
  - mediaDB/${mediaType}
---

# ${title}

## \u77ED\u8BC4

## \u89C2\u770B\u8BB0\u5F55
`;
    await this.createFile(path, content, title);
  }
  async createFile(path, content, title) {
    if (this.app.vault.getAbstractFileByPath(path)) return void new import_obsidian3.Notice("\u8BE5\u6761\u76EE\u5DF2\u7ECF\u5B58\u5728");
    await this.owner.ensureFolder(path.substring(0, path.lastIndexOf("/")));
    const file = await this.app.vault.create(path, content);
    new import_obsidian3.Notice(`\u5DF2\u6DFB\u52A0\uFF1A${title}`);
    this.close();
    if (this.owner.settings.autoOpenNewEntry) await this.app.workspace.getLeaf(true).openFile(file);
  }
};

// src/mediaQuickEditView.ts
var import_obsidian4 = require("obsidian");
var VIEW_TYPE = "media-quick-edit";
var STATUS_VALUES = ["planned", "completed"];
var HEADERS = [
  ["title", "\u6807\u9898"],
  ["type", "\u7C7B\u578B"],
  ["rating", "\u6211\u7684\u8BC4\u5206"],
  ["status", "\u72B6\u6001"],
  ["comment", "\u77ED\u8BC4"],
  ["finishedDate", "\u5B8C\u6210\u65E5\u671F"],
  ["modified", "\u6700\u540E\u4FEE\u6539"]
];
var ROW_HEIGHT = 38;
var OVERSCAN = 8;
var collator = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });
var WriteQueue = class {
  constructor(app) {
    this.app = app;
  }
  pending = /* @__PURE__ */ new Map();
  update(file, patch) {
    const previous = this.pending.get(file.path) ?? Promise.resolve();
    const next = previous.catch(() => void 0).then(async () => {
      await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
        applyStatusHistory(frontmatter, patch);
        for (const [key, value] of Object.entries(patch)) if (!key.startsWith("__")) frontmatter[key] = value;
      });
    });
    this.pending.set(file.path, next);
    void next.finally(() => {
      if (this.pending.get(file.path) === next) this.pending.delete(file.path);
    });
    return next;
  }
};
var MediaQuickEditView = class extends import_obsidian4.BasesView {
  type = VIEW_TYPE;
  rootEl;
  tableWrap;
  tableBody;
  emptyEl;
  records = [];
  headers = /* @__PURE__ */ new Map();
  drafts = /* @__PURE__ */ new Map();
  timers = /* @__PURE__ */ new Map();
  busy = /* @__PURE__ */ new Set();
  queue;
  frame = null;
  dataVersion = 0;
  renderedWindow = "";
  constructor(controller, scrollEl) {
    super(controller);
    this.rootEl = scrollEl.createDiv({ cls: "mqe-view" });
    this.queue = new WriteQueue(this.app);
    this.registerDomEvent(this.rootEl, "scroll", () => this.scheduleRender(), { passive: true });
  }
  get owner() {
    return this.app.plugins.getPlugin("media-quick-edit");
  }
  onDataUpdated() {
    this.refresh();
  }
  onunload() {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    for (const timer of this.timers.values()) window.clearTimeout(timer);
  }
  ensureShell() {
    if (this.tableBody) return;
    this.rootEl.empty();
    this.tableWrap = this.rootEl.createDiv({ cls: "mqe-table-wrap" });
    const table = this.tableWrap.createEl("table", { cls: "mqe-table" });
    const head = table.createTHead().insertRow();
    for (const [key, label] of HEADERS) this.createHeader(head, key, label);
    this.tableBody = table.createTBody();
    this.emptyEl = this.rootEl.createDiv({ cls: "mqe-empty", text: "\u5F53\u524D\u7B5B\u9009\u4E0B\u6CA1\u6709\u6761\u76EE\u3002" });
  }
  refresh() {
    this.ensureShell();
    const entries = this.data?.data ?? [];
    this.records = this.sort(entries.map((entry) => this.readRecord(entry)));
    this.dataVersion += 1;
    this.renderedWindow = "";
    this.tableWrap.toggle(this.records.length > 0);
    this.emptyEl.toggle(this.records.length === 0);
    this.updateIndicators();
    this.renderRows();
    this.scheduleRender();
  }
  createHeader(row, key, label) {
    const cell = row.createEl("th", { attr: { "aria-sort": "none" } });
    this.headers.set(key, cell);
    const content = cell.createDiv({ cls: "mqe-header-content" });
    const button = content.createEl("button", { cls: "mqe-sort-button", attr: { type: "button", title: `\u6309${label}\u5012\u5E8F\u6392\u5217` } });
    button.createSpan({ text: label });
    button.createSpan({ cls: "mqe-sort-indicator" });
    button.onclick = () => this.changeSort(key);
    if (key === "title") {
      const add = content.createEl("button", { cls: "mqe-add", text: "+", attr: { type: "button", title: "\u6DFB\u52A0\u7535\u5F71\u3001\u5267\u96C6\u6216\u4E66\u7C4D", "aria-label": "\u6DFB\u52A0\u7535\u5F71\u3001\u5267\u96C6\u6216\u4E66\u7C4D" } });
      add.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.owner.openAddModal();
      };
    }
    this.applyColumnWidth(cell, key);
    const handle = cell.createDiv({ cls: "mqe-resize-handle", attr: { role: "separator", "aria-label": `\u8C03\u6574${label}\u5217\u5BBD` } });
    this.enableResize(handle, cell, key);
  }
  get widths() {
    return this.config.get("mediaColumnWidths") || {};
  }
  applyColumnWidth(cell, key) {
    const width = Number(this.widths[key]);
    if (width > 0) cell.style.width = `${width}px`;
  }
  enableResize(handle, cell, key) {
    handle.onpointerdown = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      const startWidth = cell.getBoundingClientRect().width;
      handle.setPointerCapture?.(event.pointerId);
      const move = (e) => {
        cell.style.width = `${Math.max(1, startWidth + e.clientX - startX)}px`;
      };
      const finish = () => {
        this.config.set("mediaColumnWidths", { ...this.widths, [key]: Math.round(cell.getBoundingClientRect().width) });
        handle.removeEventListener("pointermove", move);
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", finish, { once: true });
      handle.addEventListener("pointercancel", finish, { once: true });
    };
  }
  get sortState() {
    const value = String(this.config.get("mediaSort") || "");
    const [key, direction] = value.split(":");
    return { key: HEADERS.some(([candidate]) => candidate === key) ? key : null, direction: direction === "ASC" ? "ASC" : "DESC" };
  }
  changeSort(key) {
    const state = this.sortState;
    const direction = state.key !== key || state.direction === "ASC" ? "DESC" : "ASC";
    this.config.set("mediaSort", `${key}:${direction}`);
    this.records = this.sort(this.records);
    this.dataVersion += 1;
    this.renderedWindow = "";
    this.updateIndicators();
    this.renderRows();
  }
  updateIndicators() {
    const state = this.sortState;
    for (const [key] of HEADERS) {
      const cell = this.headers.get(key);
      if (!cell) continue;
      const active = state.key === key;
      cell.setAttribute("aria-sort", active ? state.direction === "ASC" ? "ascending" : "descending" : "none");
      const indicator = cell.querySelector(".mqe-sort-indicator");
      if (indicator) indicator.textContent = active ? state.direction === "ASC" ? "\u25B2" : "\u25BC" : "";
    }
  }
  sort(records) {
    const { key, direction } = this.sortState;
    if (!key) return [...records];
    const multiplier = direction === "ASC" ? 1 : -1;
    return [...records].sort((left, right) => {
      if (key === "rating" && left.rating <= 0 !== right.rating <= 0) return left.rating <= 0 ? 1 : -1;
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
  scheduleRender() {
    if (this.frame !== null) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.renderRows();
    });
  }
  renderRows() {
    if (!this.tableBody || !this.records.length) return;
    const bodyOffset = this.tableWrap.offsetTop + (this.tableBody.parentElement?.querySelector("thead")?.clientHeight ?? 0);
    const bodyTop = Math.max(0, this.rootEl.scrollTop - bodyOffset);
    const visible = Math.max(1, Math.ceil((this.rootEl.clientHeight || 600) / ROW_HEIGHT));
    const start = Math.max(0, Math.floor(bodyTop / ROW_HEIGHT) - OVERSCAN);
    const end = Math.min(this.records.length, start + visible + OVERSCAN * 2);
    const windowKey = `${this.dataVersion}:${start}:${end}`;
    if (windowKey === this.renderedWindow) return;
    this.renderedWindow = windowKey;
    this.tableBody.empty();
    if (start) this.spacer(start * ROW_HEIGHT);
    for (let index = start; index < end; index++) this.renderRow(this.records[index]);
    if (end < this.records.length) this.spacer((this.records.length - end) * ROW_HEIGHT);
  }
  spacer(height) {
    const row = this.tableBody.insertRow();
    row.classList.add("mqe-spacer-row");
    const cell = row.insertCell();
    cell.colSpan = HEADERS.length;
    cell.style.height = `${height}px`;
  }
  renderRow(record) {
    const file = record.entry.file;
    const row = this.tableBody.insertRow();
    row.classList.add("mqe-row");
    row.dataset.path = file.path;
    row.classList.toggle("is-busy", this.busy.has(file.path));
    const title = row.insertCell().createEl("a", { cls: "mqe-title internal-link", text: record.title, attr: { href: file.path, "data-href": file.path } });
    title.onclick = (event) => {
      event.preventDefault();
      void this.app.workspace.openLinkText(file.path, "", import_obsidian4.Keymap.isModEvent(event));
    };
    row.insertCell().createSpan({ cls: "mqe-type", text: this.typeLabel(record.type) });
    this.renderStars(row.insertCell(), file, record.rating);
    this.renderStatus(row.insertCell(), file, record.type, record.status);
    this.renderComment(row.insertCell(), file, record.comment);
    row.insertCell().createSpan({ cls: "mqe-date", text: record.finishedDate || "\u2014" });
    row.insertCell().createSpan({ cls: "mqe-date", text: new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "short", hour12: false }).format(new Date(file.stat.mtime)) });
  }
  renderStars(cell, file, rating) {
    const selected = Math.max(0, Math.min(5, Math.round(rating / 2)));
    const wrap = cell.createDiv({ cls: "mqe-stars" });
    for (let value = 1; value <= 5; value++) {
      const star = wrap.createEl("button", { cls: `mqe-star${value <= selected ? " is-active" : ""}`, text: value <= selected ? "\u2605" : "\u2606", attr: { type: "button", title: `${value} \u661F` } });
      star.onclick = () => void this.apply(file, ratingPatch(value), "\u8BC4\u5206\u5DF2\u4FDD\u5B58");
    }
  }
  renderStatus(cell, file, type, current) {
    cell.classList.add("mqe-status-cell");
    const details = cell.createEl("details", { cls: "mqe-status-menu" });
    const labels = this.owner.statusLabels(type === "book" ? "book" : "movie");
    const summary = details.createEl("summary", { cls: "mqe-status", text: labels[current] });
    const choices = details.createDiv({ cls: "mqe-status-choices" });
    for (const status of STATUS_VALUES) {
      const button = choices.createEl("button", { cls: `mqe-status-choice${status === current ? " is-active" : ""}`, text: labels[status], attr: { type: "button" } });
      button.onclick = () => {
        details.open = false;
        summary.textContent = labels[status];
        void this.apply(file, statusPatch(status, labels), "\u72B6\u6001\u5DF2\u4FDD\u5B58");
      };
    }
  }
  renderComment(cell, file, saved) {
    const editor = cell.createDiv({ cls: "mqe-comment-editor" });
    const input = editor.createEl("input", { cls: "mqe-comment-input", type: "text", value: this.drafts.get(file.path) ?? saved, attr: { placeholder: "\u5199\u77ED\u8BC4\u2026\u2026" } });
    input.oninput = () => {
      this.drafts.set(file.path, input.value);
      const old = this.timers.get(file.path);
      if (old) clearTimeout(old);
      this.timers.set(file.path, window.setTimeout(() => this.saveComment(file, input.value), 600));
    };
    input.onblur = () => {
      if (this.drafts.has(file.path)) void this.saveComment(file, input.value);
    };
  }
  async saveComment(file, comment) {
    const type = this.app.metadataCache.getFileCache(file)?.frontmatter?.type === "book" ? "book" : "movie";
    await this.apply(file, commentPatch(comment, this.owner.statusLabels(type).completed), "\u77ED\u8BC4\u5DF2\u4FDD\u5B58");
    this.drafts.delete(file.path);
  }
  async apply(file, patch, message) {
    this.busy.add(file.path);
    try {
      await this.queue.update(file, patch);
      return true;
    } catch (error) {
      console.error(error);
      new import_obsidian4.Notice(`\u4FDD\u5B58\u5931\u8D25\uFF1A${file.basename}`);
      return false;
    } finally {
      this.busy.delete(file.path);
    }
  }
  readRecord(entry) {
    const file = entry.file;
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter || {};
    return { entry, title: String(fm.title || file.basename), type: String(fm.type || ""), rating: Number(fm.personalRating || 0), status: fm.status === "completed" ? "completed" : "planned", comment: String(fm.comment || ""), finishedDate: String(fm.finished_date || ""), modified: file.stat.mtime };
  }
  typeLabel(type) {
    return type === "book" ? "\u4E66" : type === "series" ? "\u5267\u96C6" : type === "musicRelease" ? "\u97F3\u4E50" : type === "game" ? "\u6E38\u620F" : "\u7535\u5F71";
  }
};

// src/settings.ts
var import_obsidian5 = require("obsidian");
var DEFAULT_SETTINGS = {
  tmdbApiKey: "",
  movieFolder: "Media DB/movies",
  bookFolder: "Media DB/books",
  basePath: "",
  autoOpenNewEntry: true,
  defaultAddType: "movie",
  moviePlannedLabel: "\u60F3\u770B",
  movieCompletedLabel: "\u770B\u8FC7",
  bookPlannedLabel: "\u60F3\u8BFB",
  bookCompletedLabel: "\u8BFB\u8FC7"
};
var PathPickerModal = class extends import_obsidian5.FuzzySuggestModal {
  constructor(app, items, placeholder, choose) {
    super(app);
    this.items = items;
    this.choose = choose;
    this.setPlaceholder(placeholder);
  }
  getItems() {
    return this.items;
  }
  getItemText(item) {
    return item;
  }
  onChooseItem(item) {
    this.choose(item);
  }
};
var MediaQuickEditSettingTab = class extends import_obsidian5.PluginSettingTab {
  constructor(app, owner) {
    super(app, owner);
    this.owner = owner;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Media Quick Edit" });
    new import_obsidian5.Setting(containerEl).setName("TMDB API Key").setDesc("\u4EC5\u4FDD\u5B58\u5728\u5F53\u524D Vault \u7684\u63D2\u4EF6 data.json \u4E2D\uFF0C\u4E0D\u4F1A\u53D1\u9001\u5230\u63D2\u4EF6\u4F5C\u8005\u7684\u670D\u52A1\u5668\u3002").addText((text) => {
      text.setPlaceholder("\u8F93\u5165 TMDB v3 API Key").setValue(this.owner.settings.tmdbApiKey);
      text.inputEl.type = "password";
      text.onChange((value) => this.setValue("tmdbApiKey", value.trim()));
    }).addButton((button) => button.setButtonText("\u6D4B\u8BD5\u8FDE\u63A5").onClick(() => this.owner.testTmdbConnection()));
    new import_obsidian5.Setting(containerEl).setName("Open Library").setDesc("\u4E66\u7C4D\u641C\u7D22\u4F7F\u7528\u516C\u5F00\u63A5\u53E3\uFF0C\u65E0\u9700\u5BC6\u94A5\uFF1B\u67E5\u8BE2\u5185\u5BB9\u4F1A\u76F4\u63A5\u53D1\u9001\u5230 openlibrary.org\u3002").addButton((button) => button.setButtonText("\u6D4B\u8BD5\u8FDE\u63A5").onClick(() => this.owner.testOpenLibraryConnection()));
    this.addPath("\u7535\u5F71 / \u5267\u96C6\u6587\u4EF6\u5939", "movieFolder", "\u9009\u62E9\u4FDD\u5B58\u7535\u5F71\u548C\u5267\u96C6\u7684\u6587\u4EF6\u5939", "folder");
    this.addPath("\u4E66\u7C4D\u6587\u4EF6\u5939", "bookFolder", "\u9009\u62E9\u4FDD\u5B58\u4E66\u7C4D\u7684\u6587\u4EF6\u5939", "folder");
    this.addPath("\u9ED8\u8BA4 Base", "basePath", "\u9009\u62E9\u5DE6\u4FA7\u680F\u6309\u94AE\u6253\u5F00\u7684 .base \u6587\u4EF6", "base");
    new import_obsidian5.Setting(containerEl).setName("\u81EA\u52A8\u6253\u5F00\u65B0\u6761\u76EE").addToggle((toggle) => toggle.setValue(this.owner.settings.autoOpenNewEntry).onChange((value) => this.setValue("autoOpenNewEntry", value)));
    new import_obsidian5.Setting(containerEl).setName("\u9ED8\u8BA4\u6DFB\u52A0\u7C7B\u578B").addDropdown((dropdown) => dropdown.addOption("movie", "\u7535\u5F71 / \u5267\u96C6").addOption("book", "\u4E66\u7C4D").setValue(this.owner.settings.defaultAddType).onChange((value) => this.setValue("defaultAddType", value)));
    containerEl.createEl("h3", { text: "\u72B6\u6001\u6807\u7B7E" });
    this.addLabel("\u7535\u5F71\uFF1A\u8BA1\u5212\u72B6\u6001", "moviePlannedLabel", "\u60F3\u770B");
    this.addLabel("\u7535\u5F71\uFF1A\u5B8C\u6210\u72B6\u6001", "movieCompletedLabel", "\u770B\u8FC7");
    this.addLabel("\u4E66\u7C4D\uFF1A\u8BA1\u5212\u72B6\u6001", "bookPlannedLabel", "\u60F3\u8BFB");
    this.addLabel("\u4E66\u7C4D\uFF1A\u5B8C\u6210\u72B6\u6001", "bookCompletedLabel", "\u8BFB\u8FC7");
  }
  addPath(name, key, description, kind) {
    let input;
    const setting = new import_obsidian5.Setting(this.containerEl).setName(name).setDesc(description).addText((text) => {
      input = text;
      text.setValue(String(this.owner.settings[key] || "")).onChange((value) => this.setValue(key, normalizePathValue(value)));
    });
    setting.addButton((button) => button.setButtonText("\u9009\u62E9").onClick(() => {
      const items = kind === "base" ? this.app.vault.getFiles().filter((file) => file.extension === "base").map((file) => file.path) : this.app.vault.getAllLoadedFiles().filter((item) => item.children).map((item) => item.path).filter(Boolean);
      new PathPickerModal(this.app, items, kind === "base" ? "\u9009\u62E9 Base \u6587\u4EF6" : "\u9009\u62E9\u6587\u4EF6\u5939", (path) => {
        input.setValue(path);
        void this.setValue(key, path);
      }).open();
    }));
  }
  async setValue(key, value) {
    this.owner.settings[key] = value;
    await this.owner.saveSettings();
  }
  addLabel(name, key, placeholder) {
    new import_obsidian5.Setting(this.containerEl).setName(name).addText((text) => text.setPlaceholder(placeholder).setValue(String(this.owner.settings[key] || "")).onChange((value) => this.setValue(key, value.trim() || placeholder)));
  }
};
function normalizePathValue(value) {
  return value.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

// src/migration.ts
var CURRENT_SCHEMA = 2;
async function migrateLibrary(app, settings, statusLabels) {
  const folders = [settings.movieFolder, settings.bookFolder].filter(Boolean).map((path) => `${path.replace(/\/+$/, "")}/`);
  const files = app.vault.getMarkdownFiles().filter((file) => folders.some((folder) => file.path.startsWith(folder)));
  let migrated = 0;
  for (const file of files) {
    const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
    const historySupported = Array.isArray(frontmatter?.status_history) && frontmatter.status_history.every((item) => typeof item === "string");
    if (frontmatter && Number(frontmatter.mediaQuickEditSchema || 0) >= CURRENT_SCHEMA && historySupported) continue;
    if (!frontmatter && !(await app.vault.cachedRead(file)).startsWith("---")) continue;
    await migrateFile(app, file, statusLabels(frontmatter?.type === "book" ? "book" : "movie"));
    migrated += 1;
  }
  return { scanned: files.length, migrated };
}
async function migrateFile(app, file, labels) {
  await app.fileManager.processFrontMatter(file, (frontmatter) => {
    migrateFrontmatter(frontmatter, labels);
  });
}
function migrateFrontmatter(frontmatter, labels) {
  const completed = frontmatter.status === "completed";
  frontmatter.status = completed ? "completed" : "planned";
  const existing = Array.isArray(frontmatter.status_history) ? frontmatter.status_history : [];
  frontmatter.status_history = existing.map((item) => typeof item === "string" ? item : `${item?.date || ""} | ${item?.action || ""}`.trim());
  if (!frontmatter.status_history.length && frontmatter.finished_date) {
    frontmatter.status_history.push(`${String(frontmatter.finished_date)} | ${completed ? labels.completed : labels.planned}`);
  }
  frontmatter.mediaQuickEditSchema = CURRENT_SCHEMA;
}

// src/main.ts
var MediaQuickEditPlugin = class extends import_obsidian6.Plugin {
  settings = { ...DEFAULT_SETTINGS };
  async onload() {
    this.settings = { ...DEFAULT_SETTINGS, ...await this.loadData() || {} };
    this.addSettingTab(new MediaQuickEditSettingTab(this.app, this));
    this.registerBasesView(VIEW_TYPE, {
      name: "\u5A92\u4F53\u5FEB\u901F\u7F16\u8F91",
      icon: "list-pen",
      factory: (controller, scrollEl) => new MediaQuickEditView(controller, scrollEl)
    });
    this.addRibbonIcon("library-big", "\u6253\u5F00\u5A92\u4F53\u5E93 Base", () => {
      const base = this.getConfiguredBase();
      if (!base) return void new import_obsidian6.Notice("\u5C1A\u672A\u8BBE\u7F6E\u6709\u6548\u7684\u9ED8\u8BA4 Base\uFF0C\u8BF7\u5728 Media Quick Edit \u8BBE\u7F6E\u4E2D\u9009\u62E9");
      void this.app.workspace.getLeaf(true).openFile(base);
    });
    this.app.workspace.onLayoutReady(() => void this.runMigration());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  openAddModal() {
    new AddMediaModal(this.app, this).open();
  }
  statusLabels(type) {
    return type === "book" ? { planned: this.settings.bookPlannedLabel, completed: this.settings.bookCompletedLabel } : { planned: this.settings.moviePlannedLabel, completed: this.settings.movieCompletedLabel };
  }
  getConfiguredBase() {
    const configured = this.settings.basePath ? this.app.vault.getAbstractFileByPath(this.settings.basePath) : null;
    if (configured instanceof import_obsidian6.TFile && configured.extension === "base") return configured;
    const active = this.app.workspace.getActiveFile();
    return active?.extension === "base" ? active : null;
  }
  async ensureFolder(folderPath) {
    const path = normalizePathValue(folderPath);
    if (!path) throw new Error("\u4FDD\u5B58\u6587\u4EF6\u5939\u672A\u914D\u7F6E");
    let current = "";
    for (const part of path.split("/").filter(Boolean)) {
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(current)) await this.app.vault.createFolder(current);
    }
  }
  async testTmdbConnection() {
    if (!this.settings.tmdbApiKey) return void new import_obsidian6.Notice("\u8BF7\u5148\u586B\u5199 TMDB API Key");
    try {
      await tmdbRequest(this.settings.tmdbApiKey, "/configuration");
      new import_obsidian6.Notice("TMDB \u8FDE\u63A5\u6210\u529F");
    } catch (error) {
      console.error(error);
      new import_obsidian6.Notice("TMDB \u8FDE\u63A5\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5 API Key \u548C\u7F51\u7EDC");
    }
  }
  async testOpenLibraryConnection() {
    try {
      await searchOpenLibrary("test", 8e3);
      new import_obsidian6.Notice("Open Library \u8FDE\u63A5\u6210\u529F");
    } catch (error) {
      console.error(error);
      new import_obsidian6.Notice("Open Library \u8FDE\u63A5\u5931\u8D25\u6216\u8D85\u65F6\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC");
    }
  }
  async runMigration() {
    if (this.settings.migrationVersion >= CURRENT_SCHEMA) return;
    try {
      const result = await migrateLibrary(this.app, this.settings, (type) => this.statusLabels(type));
      this.settings.migrationVersion = CURRENT_SCHEMA;
      await this.saveSettings();
      if (result.migrated) new import_obsidian6.Notice(`Media Quick Edit \u5DF2\u8FC1\u79FB ${result.migrated} \u4E2A\u6761\u76EE`);
    } catch (error) {
      console.error("Media Quick Edit migration failed", error);
      new import_obsidian6.Notice("Media Quick Edit \u6570\u636E\u8FC1\u79FB\u5931\u8D25\uFF0C\u7A0D\u540E\u5C06\u91CD\u8BD5");
    }
  }
};
