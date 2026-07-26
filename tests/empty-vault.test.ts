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
      getLeaf: vi.fn()
    }
  } as any;
}

describe("empty Vault startup", () => {
  beforeEach(() => { Notice.messages.length = 0; });

  it("loads portable defaults and registers the custom Base view", async () => {
    const plugin: any = new MediaQuickEditPlugin(emptyVaultApp(), { id: "media-quick-edit" });
    await plugin.onload();
    expect(plugin.settings).toMatchObject({
      tmdbApiKey: "",
      movieFolder: "Media DB/movies",
      bookFolder: "Media DB/books",
      basePath: ""
    });
    expect(plugin.basesViews).toHaveLength(1);
    expect(plugin.basesViews[0].id).toBe("media-quick-edit");
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

  it("uses media-specific default status labels", async () => {
    const plugin: any = new MediaQuickEditPlugin(emptyVaultApp(), { id: "media-quick-edit" });
    await plugin.onload();
    expect(plugin.statusLabels("movie")).toEqual({ planned: "想看", completed: "看过" });
    expect(plugin.statusLabels("book")).toEqual({ planned: "想读", completed: "读过" });
  });
});
