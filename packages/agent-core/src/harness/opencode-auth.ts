import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { OpencodeClient } from "@opencode-ai/sdk";
import { getManagedApiKeys } from "../engine-mode.js";
import { isMimoCodingCli } from "../util/opencode-cli.js";

type InjectOpencodeAuthOptions = {
  directory?: string;
  preferredProviderIDs?: string[];
};

type LocalOpencodeCredential = {
  type: string;
  key?: string;
};

const MODEL_ENV_KEYS = ["OC_MODEL_CHEAP", "OC_MODEL_STANDARD", "OC_MODEL_STRONG"] as const;

const LOCAL_AUTH_PROVIDER_PRIORITY = [
  "xiaomi-token-plan-cn",
  "zhipuai-coding-plan",
  "zai-coding-plan",
  "openai",
] as const;

const DEFAULT_MODEL_BY_PROVIDER: Record<string, string> = {
  "xiaomi-token-plan-cn": "mimo-v2.5-pro",
  "zhipuai-coding-plan": "glm-5.1",
  "zai-coding-plan": "glm-5.1",
  openai: "gpt-4.1-mini",
};

const PROVIDER_API_KEY_ALIASES: Record<string, string[]> = {
  openai: ["OPENAI_API_KEY", "OC_OPENAI_API_KEY", "OC_LLM_API_KEY"],
  zhipu: ["ZHIPU_API_KEY", "GLM_API_KEY", "ZHIPUAI_API_KEY"],
  zhipuai: ["ZHIPU_API_KEY", "GLM_API_KEY", "ZHIPUAI_API_KEY"],
  zai: ["ZAI_API_KEY"],
  "zai-coding-plan": ["ZAI_API_KEY"],
  "zhipuai-coding-plan": ["ZHIPU_API_KEY", "GLM_API_KEY", "ZHIPUAI_API_KEY"],
};

const PROVIDER_ID_ALIASES: Record<string, string[]> = {
  zhipu: ["zhipuai", "zhipuai-coding-plan"],
  zhipuai: ["zhipu", "zhipuai-coding-plan"],
  "zhipuai-coding-plan": ["zhipuai", "zhipu"],
};

/**
 * The managed key (OC_LLM_API_KEY) belongs to whatever gateway OC_LLM_BASE_URL
 * points at. Only hand it to opencode's `openai` provider when it is actually
 * an OpenAI key, otherwise opencode calls api.openai.com with a foreign key
 * and fails with "Incorrect API key provided".
 */
function managedOpenAiKeyForOpencode(): string | undefined {
  const baseUrl = process.env.OC_LLM_BASE_URL?.trim();
  if (baseUrl && !/(^|\/\/)api\.openai\.com/.test(baseUrl)) {
    return process.env.OPENAI_API_KEY ?? process.env.OC_OPENAI_API_KEY;
  }
  return getManagedApiKeys().openai;
}

function parseProviderFromModelRef(modelRef: string | undefined): string | undefined {
  if (!modelRef) {
    return undefined;
  }
  const slash = modelRef.indexOf("/");
  if (slash <= 0) {
    return "openai";
  }
  return modelRef.slice(0, slash);
}

function normalizeProviderId(providerID: string): string {
  return providerID.trim().toLowerCase();
}

function providerIdToEnvToken(providerID: string): string {
  return normalizeProviderId(providerID)
    .replace(/[^a-z0-9]/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

export function resolveLocalOpencodeAuthPath(authPath?: string): string {
  if (authPath) {
    return authPath;
  }
  const fromEnv = process.env.OC_OPENCODE_AUTH_PATH?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  const dataHome = process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share");
  const product = isMimoCodingCli() ? "mimocode" : "opencode";
  return path.join(dataHome, product, "auth.json");
}

export function readLocalOpencodeAuth(authPath?: string): Record<string, LocalOpencodeCredential> {
  try {
    const raw = fs.readFileSync(resolveLocalOpencodeAuthPath(authPath), "utf8");
    const parsed = JSON.parse(raw) as Record<string, LocalOpencodeCredential>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function modelRefFromEnv(): string | undefined {
  const keys = [
    "OC_OPENCODE_MODEL_STRONG",
    "OC_OPENCODE_MODEL_STANDARD",
    "OC_OPENCODE_MODEL_CHEAP",
    ...MODEL_ENV_KEYS,
  ] as const;
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value && value.includes("/")) {
      return value;
    }
  }
  return undefined;
}

export function getDefaultOpencodeModelRef(authPath?: string): string | undefined {
  if (
    process.env.NODE_ENV === "test" &&
    !process.env.OC_OPENCODE_INTEGRATION &&
    !authPath
  ) {
    return undefined;
  }

  const fromEnv = modelRefFromEnv();
  if (fromEnv) {
    return fromEnv;
  }

  const localAuth = readLocalOpencodeAuth(authPath);
  for (const providerID of LOCAL_AUTH_PROVIDER_PRIORITY) {
    const credential = localAuth[providerID];
    if (credential?.type === "api" && credential.key) {
      const modelID = DEFAULT_MODEL_BY_PROVIDER[providerID];
      return modelID ? `${providerID}/${modelID}` : undefined;
    }
  }

  const explicitProvider = process.env.OC_OPENCODE_PROVIDER?.trim();
  if (explicitProvider) {
    const normalized = normalizeProviderId(explicitProvider);
    const key = resolveProviderApiKey(normalized, [normalized], localAuth);
    if (key) {
      const modelID = DEFAULT_MODEL_BY_PROVIDER[normalized] ?? "gpt-4.1-mini";
      return `${normalized}/${modelID}`;
    }
  }

  if (managedOpenAiKeyForOpencode()) {
    return "openai/gpt-4.1-mini";
  }

  return undefined;
}

function getCandidateProviderIds(
  preferredProviderIDs: string[] = [],
  localAuth: Record<string, LocalOpencodeCredential> = readLocalOpencodeAuth(),
): string[] {
  const providers = new Set<string>();
  const explicit = process.env.OC_OPENCODE_PROVIDER;
  if (explicit) {
    providers.add(normalizeProviderId(explicit));
  }
  for (const providerID of preferredProviderIDs) {
    if (providerID) {
      providers.add(normalizeProviderId(providerID));
    }
  }
  for (const key of MODEL_ENV_KEYS) {
    const providerID = parseProviderFromModelRef(process.env[key]);
    if (providerID) {
      providers.add(normalizeProviderId(providerID));
    }
  }
  for (const providerID of Object.keys(localAuth)) {
    providers.add(normalizeProviderId(providerID));
  }
  return [...providers];
}

function buildApiKeyEnvCandidates(providerID: string): string[] {
  const token = providerIdToEnvToken(providerID);
  const aliases = PROVIDER_API_KEY_ALIASES[providerID] ?? [];
  return [
    `OC_OPENCODE_${token}_API_KEY`,
    `OC_OPENCODE_API_KEY_${token}`,
    `${token}_API_KEY`,
    ...aliases,
  ];
}

function resolveLocalProviderApiKey(
  providerID: string,
  localAuth: Record<string, LocalOpencodeCredential>,
): string | undefined {
  const normalized = normalizeProviderId(providerID);
  const direct = localAuth[normalized];
  if (direct?.type === "api" && direct.key) {
    return direct.key;
  }
  for (const alias of PROVIDER_ID_ALIASES[normalized] ?? []) {
    const credential = localAuth[normalizeProviderId(alias)];
    if (credential?.type === "api" && credential.key) {
      return credential.key;
    }
  }
  return undefined;
}

function resolveProviderApiKey(
  providerID: string,
  allCandidates: string[],
  localAuth: Record<string, LocalOpencodeCredential>,
): string | undefined {
  const normalized = normalizeProviderId(providerID);
  const genericProvider = process.env.OC_OPENCODE_PROVIDER
    ? normalizeProviderId(process.env.OC_OPENCODE_PROVIDER)
    : undefined;
  const genericApiKey = process.env.OC_OPENCODE_API_KEY;
  if (
    genericApiKey &&
    (genericProvider === normalized || (!genericProvider && allCandidates.length <= 1))
  ) {
    return genericApiKey;
  }

  for (const envName of buildApiKeyEnvCandidates(normalized)) {
    const key = process.env[envName];
    if (key) {
      return key;
    }
  }

  const localKey = resolveLocalProviderApiKey(normalized, localAuth);
  if (localKey) {
    return localKey;
  }

  if (normalized === "openai") {
    return managedOpenAiKeyForOpencode();
  }

  return undefined;
}

function resolveProviderTarget(
  providerID: string,
  availableProviders?: Set<string>,
): string | undefined {
  const normalized = normalizeProviderId(providerID);
  const candidates = [normalized, ...(PROVIDER_ID_ALIASES[normalized] ?? [])].map((id) =>
    normalizeProviderId(id),
  );
  if (!availableProviders) {
    return candidates[0];
  }
  return candidates.find((candidate) => availableProviders.has(candidate));
}

export async function injectOpencodeAuth(
  client: OpencodeClient,
  options: InjectOpencodeAuthOptions = {},
): Promise<string[]> {
  const localAuth = readLocalOpencodeAuth();
  const candidateProviderIDs = getCandidateProviderIds(options.preferredProviderIDs, localAuth);
  if (candidateProviderIDs.length === 0) {
    return [];
  }

  let availableProviders: Set<string> | undefined;
  try {
    const listed = await client.provider.list({
      query: { directory: options.directory },
    });
    const all = listed.data?.all ?? [];
    availableProviders = new Set(all.map((provider) => normalizeProviderId(provider.id)));
  } catch {
    // Continue best-effort with candidate providers.
  }

  const injectedProviders: string[] = [];
  const injectedProviderSet = new Set<string>();
  for (const providerID of candidateProviderIDs) {
    const targetProviderID = resolveProviderTarget(providerID, availableProviders);
    if (!targetProviderID || injectedProviderSet.has(targetProviderID)) {
      continue;
    }

    const key = resolveProviderApiKey(providerID, candidateProviderIDs, localAuth);
    if (!key) {
      continue;
    }

    await client.auth.set({
      path: { id: targetProviderID },
      query: { directory: options.directory },
      body: { type: "api", key },
    });
    injectedProviderSet.add(targetProviderID);
    injectedProviders.push(targetProviderID);
  }

  return injectedProviders;
}
