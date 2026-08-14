import { beforeEach, describe, expect, it, vi } from "vitest";
import { Notice, TFile } from "obsidian";
import MediaQuickEditPlugin from "../src/main";

function emptyVaultApp() {
  return {
    vault: {
      getAbstractFileByPath: vi.fn(() => null),
      getMarkdownFiles: vi.fn(() => []),
      getAllLoadedFiles: vi.fn(() => []),
      getFiles: vi.fn(() => [])
    },
    workspace: {
      getActiveFile: vi.fn(() => null),
      onLayoutReady: vi.fn(),
      on: vi.fn(() => ({})),
      getLeavesOfType: vi.fn(() => []),
      revealLeaf: vi.fn(),
      getLeaf: vi.fn()
    }
  } as any;
}

describe("empty Vault startup", () => {
  beforeEach(() => { Notice.messages.length = 0; });

  it("loads portable defaults and registers both Base views", async () => {
    const plugin: any = new MediaQuickEditPlugin(emptyVaultApp(), { id: "media-quick-edit" });
    await plugin.onload();
    expect(plugin.settings).toMatchObject({
      tmdbApiKey: "",
      movieFolder: "Media DB/movies",
      bookFolder: "Media DB/books",
      basePath: ""
    });
    expect(plugin.basesViews).toHaveLength(2);
    expect(plugin.basesViews.map((view: any) => view.id)).toEqual(["media-quick-edit", "media-shelf"]);
    expect(plugin.basesViews[1].registration.name).toBe("书架");
    expect(plugin.settingTabs).toHaveLength(1);
  });

  it("prompts instead of opening an unrelated file when no Base is configured", async () => {
    const app = emptyVaultApp();
    const plugin: any = new MediaQuickEditPlugin(app, { id: "media-quick-edit" });
    await plugin.onload();
    plugin.ribbons[0].callback();
    expect(Notice.messages.at(-1)).toContain("尚未设置有效的默认 Base");
    expect(app.workspace.getLeaf).not.toHaveBeenCalled();
  });

  it("falls back only to the currently active Base", async () => {
    const app = emptyVaultApp();
    const activeBase = new TFile();
    activeBase.path = "Library/Media.base";
    activeBase.extension = "base";
    app.workspace.getActiveFile.mockReturnValue(activeBase);
    const plugin: any = new MediaQuickEditPlugin(app, { id: "media-quick-edit" });
    await plugin.onload();
    expect(plugin.getConfiguredBase()).toBe(activeBase);
  });

  it("reveals an already-open Base without replacing its selected view", async () => {
    const app = emptyVaultApp();
    const base = new TFile();
    base.path = "Library/Media.base";
    base.extension = "base";
    app.vault.getAbstractFileByPath.mockReturnValue(base);
    const openLeaf = {
      getViewState: vi.fn(() => ({ type: "bases", state: { file: base.path, viewName: "书架" } }))
    };
    app.workspace.getLeavesOfType.mockReturnValue([openLeaf]);
    const plugin: any = new MediaQuickEditPlugin(app, { id: "media-quick-edit" });
    plugin._data = { basePath: base.path };
    await plugin.onload();

    await plugin.openConfiguredBase();

    expect(app.workspace.revealLeaf).toHaveBeenCalledWith(openLeaf);
    expect(app.workspace.getLeaf).not.toHaveBeenCalled();
  });

  it("restores the last selected view after the Base was closed", async () => {
    const app = emptyVaultApp();
    const base = new TFile();
    base.path = "Library/Media.base";
    base.extension = "base";
    app.vault.getAbstractFileByPath.mockReturnValue(base);
    const newLeaf = { setViewState: vi.fn() };
    app.workspace.getLeaf.mockReturnValue(newLeaf);
    const plugin: any = new MediaQuickEditPlugin(app, { id: "media-quick-edit" });
    plugin._data = { basePath: base.path, lastBaseViews: { [base.path]: "书架" } };
    await plugin.onload();

    await plugin.openConfiguredBase();

    expect(newLeaf.setViewState).toHaveBeenCalledWith({
      type: "bases",
      state: { file: base.path, viewName: "书架" }
    });
    expect(app.workspace.revealLeaf).toHaveBeenCalledWith(newLeaf);
  });

  it("remembers the selected view for each open Base", async () => {
    const app = emptyVaultApp();
    app.workspace.getLeavesOfType.mockReturnValue([{
      getViewState: vi.fn(() => ({ type: "bases", state: { file: "Library/Media.base", viewName: "书架" } }))
    }]);
    const plugin: any = new MediaQuickEditPlugin(app, { id: "media-quick-edit" });
    await plugin.onload();

    await plugin.rememberOpenBaseViews();

    expect(plugin.settings.lastBaseViews).toEqual({ "Library/Media.base": "书架" });
    expect(plugin._data.lastBaseViews).toEqual({ "Library/Media.base": "书架" });
  });

  it("records Base view changes from the controller event", async () => {
    const app = emptyVaultApp();
    let selectedView = "快速编辑";
    let onViewChanged: (() => void) | undefined;
    const controller = {
      events: { on: vi.fn((_name: string, callback: () => void) => { onViewChanged = callback; return {}; }) }
    };
    const leaf = {
      view: { controller },
      getViewState: vi.fn(() => ({ type: "bases", state: { file: "Library/Media.base", viewName: selectedView } }))
    };
    app.workspace.getLeavesOfType.mockReturnValue([leaf]);
    const plugin: any = new MediaQuickEditPlugin(app, { id: "media-quick-edit" });
    await plugin.onload();
    plugin.watchOpenBaseViews();

    selectedView = "书架";
    onViewChanged?.();
    await vi.waitFor(() => expect(plugin.settings.lastBaseViews["Library/Media.base"]).toBe("书架"));

    expect(controller.events.on).toHaveBeenCalledOnce();
    expect(plugin._data.lastBaseViews["Library/Media.base"]).toBe("书架");
  });

  it("uses media-specific default status labels", async () => {
    const plugin: any = new MediaQuickEditPlugin(emptyVaultApp(), { id: "media-quick-edit" });
    await plugin.onload();
    expect(plugin.statusLabels("movie")).toEqual({ planned: "想看", completed: "看过" });
    expect(plugin.statusLabels("book")).toEqual({ planned: "想读", completed: "读过" });
  });
});
