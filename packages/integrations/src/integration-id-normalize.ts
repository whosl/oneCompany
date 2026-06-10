import { P1_INTEGRATION_DEFINITIONS } from "./p1-definitions.js";

const REGISTERED_IDS = new Set(P1_INTEGRATION_DEFINITIONS.map((row) => row.id));

const ALIASES: Record<string, string> = {
  browser: "playwright",
  "browser mcp": "playwright",
  "playwright browser": "playwright",
  e2e: "playwright",
  playwright: "playwright",
  figma: "figma",
  "figma mcp": "figma",
  design: "figma",
  github: "github",
  "git hub": "github",
  git: "github",
  supabase: "supabase",
  vercel: "vercel",
  deploy: "vercel",
  deployment: "vercel",
};

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export type NormalizeIntegrationIdResult = {
  raw: string;
  integrationId?: string;
  status: "exact" | "alias" | "unknown";
};

export function normalizeIntegrationId(raw: string): NormalizeIntegrationIdResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { raw, status: "unknown" };
  }

  const slug = slugify(trimmed);
  if (REGISTERED_IDS.has(slug)) {
    return { raw: trimmed, integrationId: slug, status: "exact" };
  }

  const alias = ALIASES[slug];
  if (alias && REGISTERED_IDS.has(alias)) {
    return { raw: trimmed, integrationId: alias, status: "alias" };
  }

  for (const id of REGISTERED_IDS) {
    if (slug.includes(id)) {
      return { raw: trimmed, integrationId: id, status: "alias" };
    }
  }

  return { raw: trimmed, status: "unknown" };
}

export function normalizeRequirementIntegrationIds(rawIds: string[]): {
  normalized: string[];
  results: NormalizeIntegrationIdResult[];
  unknown: string[];
} {
  const normalized: string[] = [];
  const results: NormalizeIntegrationIdResult[] = [];
  const unknown: string[] = [];

  for (const raw of rawIds) {
    const result = normalizeIntegrationId(raw);
    results.push(result);
    if (!result.integrationId) {
      unknown.push(result.raw);
      continue;
    }
    if (!normalized.includes(result.integrationId)) {
      normalized.push(result.integrationId);
    }
  }

  return { normalized, results, unknown };
}
