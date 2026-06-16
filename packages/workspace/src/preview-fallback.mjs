import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const host = process.env.PREVIEW_HOST || process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || process.env.PREVIEW_PORT || 3000);
const root = process.env.PREVIEW_ROOT || process.cwd();
const basePath = normalizeBasePath(process.env.PREVIEW_BASE_PATH || "/");

const server = http.createServer((req, res) => {
  const rawPath = String(req.url || "/").split("?")[0];
  const urlPath = stripBasePath(rawPath, basePath);
  if (urlPath === null) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\//, "");

  // Prevent path traversal AND symlink escapes:
  // 1. resolve the requested relative path and reject ".."/absolute escapes lexically,
  // 2. then resolve symlinks via realpath and require the real path to stay under the
  //    real root — otherwise a symlink like root/leak.txt -> /etc/passwd would pass step 1
  //    but still read outside the served directory.
  const rootResolved = path.resolve(root);
  const filePath = path.resolve(rootResolved, rel);
  if (filePath !== rootResolved && !filePath.startsWith(rootResolved + path.sep)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end("<!doctype html><title>generated-app</title><body><h1>generated-app</h1></body>");
    return;
  }
  const rootReal = fs.realpathSync(rootResolved);
  const fileReal = fs.realpathSync(filePath);
  if (fileReal !== rootReal && !fileReal.startsWith(rootReal + path.sep)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  res.writeHead(200);
  res.end(fs.readFileSync(filePath));
});

server.listen(port, host);

function normalizeBasePath(value) {
  if (!value || value === "/") return "/";
  const withLeading = value.startsWith("/") ? value : "/" + value;
  return withLeading.replace(/\/$/, "");
}

function stripBasePath(urlPath, basePath) {
  if (basePath === "/") return urlPath;
  if (urlPath === basePath) return "/";
  if (urlPath.startsWith(basePath + "/")) return urlPath.slice(basePath.length) || "/";
  return null;
}
