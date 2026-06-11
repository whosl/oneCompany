import { Hono } from "hono";
import type { TaiziService } from "./service.js";

/**
 * POST /projects/:id/taizi/message — 用户自由输入的统一入口。
 * Taizi 分类意图并分发到目标 agent / 工作流，立即返回路由结果；
 * 长耗时动作在后台继续，进度通过事件流（taizi.routed / agent.*）推送。
 */
export function createTaiziRoutes(taizi: TaiziService) {
  const router = new Hono();

  router.post("/:id/taizi/message", async (c) => {
    const projectId = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as { message?: string };
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) {
      return c.json({ error: "message is required" }, 400);
    }
    try {
      const result = await taizi.handleMessage(projectId, message);
      return c.json(result);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (detail.includes("not found")) {
        return c.json({ error: detail }, 404);
      }
      return c.json({ error: detail }, 500);
    }
  });

  return router;
}
