import { describe, expect, it } from "vitest";
import { addShelfViewToBase } from "../src/baseViewSetup";

describe("automatic bookshelf view setup", () => {
  it("appends the bookshelf without changing existing views", () => {
    const source = `filters:\n  and:\n    - file.ext == "md"\nviews:\n  - type: media-quick-edit\n    name: 快速编辑\n  - type: cards\n    name: 封面墙\n`;
    const result = addShelfViewToBase(source);
    expect(result).toContain("  - type: media-quick-edit\n    name: 快速编辑");
    expect(result).toContain("  - type: cards\n    name: 封面墙");
    expect(result).toContain("  - type: media-shelf\n    name: 书架");
  });

  it("creates the views section when a Base has none", () => {
    expect(addShelfViewToBase('filters: file.ext == "md"\n')).toContain("views:\n  - type: media-shelf\n    name: 书架");
  });

  it("expands an empty inline views list", () => {
    expect(addShelfViewToBase("views: []\n")).toBe("views:\n  - type: media-shelf\n    name: 书架\n");
  });

  it("does not add a duplicate bookshelf", () => {
    const source = "views:\n  - type: media-shelf\n    name: 我的书架\n";
    expect(addShelfViewToBase(source)).toBe(source);
  });

  it("preserves CRLF line endings", () => {
    const result = addShelfViewToBase("views:\r\n  - type: table\r\n    name: Table\r\n");
    expect(result).toContain("  - type: media-shelf\r\n    name: 书架");
    expect(result.replace(/\r\n/g, "")).not.toContain("\n");
  });
});
