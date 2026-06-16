import AdmZip from "adm-zip";
import { Hono } from "hono";
import { DeliveryReportStatusError } from "@oc/workflow";
import type { DeliveryService } from "./service.js";

export function createDeliveryRoutes(delivery: DeliveryService) {
  const router = new Hono();

  router.post("/:id/delivery/generate", (c) => {
    const projectId = c.req.param("id");
    try {
      const result = delivery.generateReport(projectId);
      return c.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed to generate delivery report";
      if (error instanceof DeliveryReportStatusError) {
        return c.json({ error: message }, 409);
      }
      return c.json({ error: message }, 400);
    }
  });

  router.post("/:id/delivery/export", (c) => {
    const projectId = c.req.param("id");
    try {
      const result = delivery.exportSubmission(projectId);
      return c.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed to export submission package";
      return c.json({ error: message }, 400);
    }
  });

  router.get("/:id/delivery/download", (c) => {
    const projectId = c.req.param("id");
    try {
      const result = delivery.exportSubmission(projectId);
      const zip = new AdmZip();
      zip.addLocalFolder(result.packagePath);
      const buffer = zip.toBuffer();
      const projectName = delivery.getProjectName(projectId);
      const safeName = projectName.replace(/[^\w\u4e00-\u9fa5.-]/g, "_");
      const encoded = encodeURIComponent(safeName);
      return new Response(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${encoded}.zip"; filename*=UTF-8''${encoded}.zip`,
          "Content-Length": String(buffer.length),
          "Cache-Control": "no-cache",
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed to download submission package";
      return c.json({ error: message }, 400);
    }
  });

  router.get("/:id/delivery", (c) => {
    const projectId = c.req.param("id");
    try {
      return c.json(delivery.getStatus(projectId));
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed to get delivery status";
      return c.json({ error: message }, 400);
    }
  });

  return router;
}
