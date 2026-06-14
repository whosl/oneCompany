import { Hono } from "hono";
import { getAgent, listAgents, toAgentCard } from "@oc/agent-core";
import { parseIdAtVersion } from "@oc/agent-core";
import type { Db } from "@oc/shared";

/**
 * Resolve the public base URL used to build AgentCard.url. Falls back to the
 * API port when OC_PUBLIC_BASE_URL is unset so cards always carry a usable URL.
 */
function resolveBaseUrl(): string {
  return process.env.OC_PUBLIC_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3001}`;
}

/**
 * A2A Agent discovery routes.
 *
 *   GET /.well-known/agent-card.json  — A2A discovery entrypoint (lists all agents)
 *   GET /agents                       — REST alias of the above
 *   GET /agents/:id/:version          — a single agent's card
 *   GET /agents/:id/:version/schema   — input/output JSON schemas for the agent
 *
 * These are read-only discovery endpoints per OneCompany spec §7/§9: external
 * A2A clients can learn what agents exist and how to address them; internal
 * workflow coordination is unchanged (still LangGraph + durable state).
 */
export function createAgentRoutes(db: Db) {
  const app = new Hono();

  const listCards = () => {
    const baseUrl = resolveBaseUrl();
    const agents = listAgents(db).map((agent) => toAgentCard(agent, baseUrl));
    return { agents };
  };

  // A2A well-known discovery endpoint.
  app.get("/.well-known/agent-card.json", (c) => c.json(listCards()));

  // REST-style alias.
  app.get("/agents", (c) => c.json(listCards()));

  app.get("/agents/:id/:version", (c) => {
    const id = c.req.param("id");
    const version = c.req.param("version");
    try {
      const agent = getAgent(db, `${id}@${version}`);
      return c.json(toAgentCard(agent, resolveBaseUrl()));
    } catch {
      return c.json({ error: `Agent not found: ${id}@${version}` }, 404);
    }
  });

  app.get("/agents/:id/:version/schema", (c) => {
    const id = c.req.param("id");
    const version = c.req.param("version");
    try {
      const agent = getAgent(db, `${id}@${version}`);
      return c.json({
        id: `${id}@${version}`,
        inputSchema: agent.inputSchema,
        outputSchema: agent.outputSchema,
      });
    } catch {
      return c.json({ error: `Agent not found: ${id}@${version}` }, 404);
    }
  });

  return app;
}

// Re-export so callers don't need a second import line.
export { parseIdAtVersion };
