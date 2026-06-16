import { Hono } from "hono";
import { getPreviewHandle } from "@oc/workspace";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

export function createPreviewProxyRoutes() {
  const router = new Hono();

  router.get("/:projectId", (c) => {
    const projectId = c.req.param("projectId");
    return c.redirect(`/preview/${encodeURIComponent(projectId)}/`, 301);
  });

  router.all("/:projectId/*", async (c) => {
    const projectId = c.req.param("projectId");
    const handle = getPreviewHandle(projectId);
    if (!handle) {
      return c.text(`Preview not running for project: ${projectId}`, 404);
    }

    const incomingUrl = new URL(c.req.url);
    const targetUrl = new URL(`${incomingUrl.pathname}${incomingUrl.search}`, handle.url);
    const headers = new Headers(c.req.raw.headers);
    for (const header of HOP_BY_HOP_HEADERS) {
      headers.delete(header);
    }

    const method = c.req.raw.method;
    const response = await fetch(targetUrl, {
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? undefined : c.req.raw.body,
      duplex: "half",
      redirect: "manual",
    } as RequestInit & { duplex: "half" });

    const responseHeaders = new Headers(response.headers);
    for (const header of HOP_BY_HOP_HEADERS) {
      responseHeaders.delete(header);
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  });

  return router;
}
