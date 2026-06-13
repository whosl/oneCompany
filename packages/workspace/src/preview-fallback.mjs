import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const host = process.env.PREVIEW_HOST || process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || process.env.PREVIEW_PORT || 3000);
const root = process.env.PREVIEW_ROOT || process.cwd();

const server = http.createServer((req, res) => {
  const rel = req.url === "/" ? "index.html" : String(req.url || "/").replace(/^\//, "");

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
