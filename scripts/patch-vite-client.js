import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const clientPath = path.resolve(__dirname, "../node_modules/vite/dist/client/client.mjs");

export function patchViteClient() {
  if (!fs.existsSync(clientPath)) return;
  let code = fs.readFileSync(clientPath, "utf-8");
  let modified = false;

  const transportRegex = /const createWebSocketModuleRunnerTransport = \([\s\S]*?return \{\s*async connect\(\{[\s\S]*?send\(data\) \{\s*ws\.send\(JSON\.stringify\(data\)\);\s*\}\s*\};\s*\};/;
  if (transportRegex.test(code)) {
    code = code.replace(
      transportRegex,
      `const createWebSocketModuleRunnerTransport = () => ({
  async connect() {},
  disconnect() {},
  send() {}
});`
    );
    modified = true;
  }

  if (code.includes('error: (err) => console.error("[vite]", err)')) {
    code = code.replace(
      'error: (err) => console.error("[vite]", err)',
      'error: () => {}'
    );
    modified = true;
  }

  if (code.includes('console.error(`[vite]')) {
    code = code.replaceAll('console.error(`[vite]', 'console.debug(`[vite]');
    modified = true;
  }
  if (code.includes('console.error("[vite]')) {
    code = code.replaceAll('console.error("[vite]', 'console.debug("[vite]');
    modified = true;
  }

  if (modified) {
    fs.writeFileSync(clientPath, code, "utf-8");
    console.log("vite client.mjs successfully patched for AI Studio preview.");
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  patchViteClient();
}
