import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const targetFile = path.resolve(__dirname, "../node_modules/vite-plugin-pwa/dist/index.js");

if (fs.existsSync(targetFile)) {
  let content = fs.readFileSync(targetFile, "utf-8");
  let modified = false;

  if (content.includes('var _dirname = typeof __dirname !== "undefined" ? __dirname : dirname(fileURLToPath(import.meta.url));')) {
    content = content.replace(
      'var _dirname = typeof __dirname !== "undefined" ? __dirname : dirname(fileURLToPath(import.meta.url));',
      'var _dirname = dirname(fileURLToPath(import.meta.url));'
    );
    modified = true;
  }

  if (content.includes('var require2 = createRequire(_dirname);')) {
    content = content.replace(
      'var require2 = createRequire(_dirname);',
      'var require2 = createRequire(resolve(_dirname));'
    );
    modified = true;
  }

  if (content.includes('readFileSync(resolve3(_dirname2, "../package.json"), "utf-8")')) {
    content = content.replace(
      /const _dirname2 = typeof __dirname[\s\S]*?readFileSync\(resolve3\(_dirname2, "\.\.\/package\.json"\), "utf-8"\)\s*\);/,
      `let version = "1.3.0";
  try {
    const pkgPath = resolve3(dirname2(fileURLToPath2(import.meta.url)), "../package.json");
    version = JSON.parse(readFileSync(pkgPath, "utf-8")).version || "1.3.0";
  } catch {}`
    );
    modified = true;
  }

  if (modified) {
    fs.writeFileSync(targetFile, content, "utf-8");
    console.log("vite-plugin-pwa successfully patched for Node 22 ESM compatibility.");
  }
}
