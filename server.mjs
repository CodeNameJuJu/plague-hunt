// Static file server for the production bundle — zero dependencies, so the
// deploy doesn't care whether devDependencies were pruned. Railway assigns
// PORT; anything unmatched falls back to index.html (single-page app).

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const ROOT = new URL("./dist/", import.meta.url).pathname;
const PORT = process.env.PORT || 8080;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
};

createServer(async (req, res) => {
  try {
    const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
    // normalize + strip leading slash, refuse traversal
    let path = normalize(url).replace(/^(\.\.[/\\])+/, "");
    if (path === "/" || path === "\\") path = "/index.html";
    let file = join(ROOT, path);
    let body;
    try {
      body = await readFile(file);
    } catch {
      file = join(ROOT, "index.html");
      body = await readFile(file);
    }
    res.writeHead(200, {
      "content-type": MIME[extname(file)] ?? "application/octet-stream",
      "cache-control": file.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
    });
    res.end(body);
  } catch (e) {
    res.writeHead(500);
    res.end("server error");
  }
}).listen(PORT, "0.0.0.0", () => console.log(`serving dist/ on :${PORT}`));
