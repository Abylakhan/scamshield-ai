// Packs the backend analysis engine (pure Python) + the browser bridge into public/engine/engine.json
// for the GitHub Pages build, where the engine runs in the browser via Pyodide.
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const backend = join(here, "../../backend");
const SKIP = new Set(["app/main.py", "app/database.py", "app/models.py", "app/ratelimit.py"]);
const files = {};

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = relative(backend, full).split("\\").join("/");
    if (statSync(full).isDirectory()) {
      if (name !== "__pycache__" && rel !== "app/routers") walk(full);
    } else if ((name.endsWith(".py") || name.endsWith(".json")) && !SKIP.has(rel)) {
      files[rel] = readFileSync(full, "utf8");
    }
  }
}
walk(join(backend, "app"));
files["bridge.py"] = readFileSync(join(here, "../engine/bridge.py"), "utf8");

const out = join(here, "../public/engine/engine.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(files));
console.log(`engine bundle: ${Object.keys(files).length} files, ${(JSON.stringify(files).length / 1024).toFixed(0)} KB`);
