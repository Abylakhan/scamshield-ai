// Runs the ScamShield Python engine in the browser (GitHub Pages build) using Pyodide.

const PYODIDE_VERSION = "0.26.4";
const PYODIDE_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

interface PyodideAPI {
  loadPackage(names: string[]): Promise<void>;
  runPythonAsync(code: string): Promise<unknown>;
  globals: { set(name: string, value: unknown): void };
  FS: { mkdirTree(path: string): void; writeFile(path: string, data: string): void };
}

// Typed view of the worker global (the project's TS lib is DOM, not WebWorker).
const ctx = self as unknown as { postMessage(msg: unknown): void; onmessage: ((e: MessageEvent) => void) | null };

let ready: Promise<PyodideAPI> | null = null;

async function boot(engineUrl: string): Promise<PyodideAPI> {
  ctx.postMessage({ type: "status", stage: "runtime" });
  const mod = (await import(/* @vite-ignore */ `${PYODIDE_URL}pyodide.mjs`)) as { loadPyodide: (o: { indexURL: string }) => Promise<PyodideAPI> };
  const py = await mod.loadPyodide({ indexURL: PYODIDE_URL });
  ctx.postMessage({ type: "status", stage: "packages" });
  const [files] = await Promise.all([
    fetch(engineUrl).then((r) => { if (!r.ok) throw new Error(`engine bundle HTTP ${r.status}`); return r.json() as Promise<Record<string, string>>; }),
    py.loadPackage(["pydantic"]),
  ]);
  const root = "/home/pyodide/scamshield";
  for (const [path, text] of Object.entries(files)) {
    const full = `${root}/${path}`;
    py.FS.mkdirTree(full.slice(0, full.lastIndexOf("/")));
    py.FS.writeFile(full, text);
  }
  ctx.postMessage({ type: "status", stage: "engine" });
  await py.runPythonAsync(`import sys\nsys.path.insert(0, "${root}")\nimport bridge`);
  ctx.postMessage({ type: "ready" });
  return py;
}

ctx.onmessage = async (e: MessageEvent) => {
  const msg = e.data as { type: "init"; engineUrl: string } | { type: "call"; id: number; op: string; args: unknown };
  if (msg.type === "init") {
    ready ??= boot(msg.engineUrl);
    ready.catch((err) => ctx.postMessage({ type: "failed", error: String(err?.message ?? err) }));
    return;
  }
  try {
    if (!ready) throw new Error("engine not initialised");
    const py = await ready;
    py.globals.set("CALL_JSON", JSON.stringify({ op: msg.op, args: msg.args }));
    const out = (await py.runPythonAsync("await bridge.dispatch(CALL_JSON)")) as string;
    ctx.postMessage({ type: "result", id: msg.id, ...JSON.parse(out) });
  } catch (err) {
    ctx.postMessage({ type: "result", id: msg.id, ok: false, status: 500, detail: String((err as Error)?.message ?? err) });
  }
};
