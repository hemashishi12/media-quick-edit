const SHELF_VIEW_BLOCK = ["  - type: media-shelf", "    name: 书架"];

export function addShelfViewToBase(source: string): string {
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const viewsIndex = lines.findIndex((line) => /^views\s*:/.test(line));
  if (viewsIndex >= 0) {
    let end = viewsIndex + 1;
    while (end < lines.length && (lines[end].trim() === "" || /^\s/.test(lines[end]) || /^\s*#/.test(lines[end]))) end += 1;
    const viewsBlock = lines.slice(viewsIndex, end).join("\n");
    if (/^\s*-?\s*type\s*:\s*["']?media-shelf["']?\s*(?:#.*)?$/m.test(viewsBlock)) return source;
    if (/^views\s*:\s*\[\s*\]\s*(?:#.*)?$/.test(lines[viewsIndex])) {
      lines.splice(viewsIndex, 1, "views:", ...SHELF_VIEW_BLOCK);
    } else if (/^views\s*:\s*(?:#.*)?$/.test(lines[viewsIndex])) {
      lines.splice(end, 0, ...SHELF_VIEW_BLOCK);
    } else {
      return source;
    }
  } else {
    while (lines.length && lines.at(-1) === "") lines.pop();
    if (lines.length) lines.push("");
    lines.push("views:", ...SHELF_VIEW_BLOCK, "");
  }
  return lines.join(newline);
}
