import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const host = process.env.PREVIEW_HOST || process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || process.env.PREVIEW_PORT || 3000);
const root = process.env.PREVIEW_ROOT || process.cwd();

const server = http.createServer((req, res) => {
  const rel = req.url === "/" ? "index.html" : String(req.url || "/").replace(/^\//, "");
  const filePath = path.join(root, rel);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    res.writeHead(200);
    res.end(fs.readFileSync(filePath));
    return;
  }

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end("<!doctype html><title>generated-app</title><body><h1>generated-app</h1></body>");
});

server.listen(port, host);
