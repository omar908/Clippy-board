import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

// Load the actual index.html, production bootstrap, CSS and components. Only
// the three native SDK modules are substituted; no fixture markup is copied.
const native = fileURLToPath(new URL("./native.ts", import.meta.url));
export default defineConfig({
  resolve: { alias: [
    { find: /^@tauri-apps\/api\/core$/, replacement: native },
    { find: /^@tauri-apps\/api\/window$/, replacement: native },
    { find: /^@tauri-apps\/api\/event$/, replacement: native },
  ] },
  server: { watch: { ignored: ["**/src-tauri/**", "**/test-results/**", "**/playwright-report/**"] } },
});
