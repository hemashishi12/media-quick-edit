import { copyFile, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
const output = path.join(root, "release", manifest.version);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of ["main.js", "manifest.json", "styles.css"]) {
  await copyFile(path.join(root, file), path.join(output, file));
}
console.log(`Release files prepared in ${output}`);
