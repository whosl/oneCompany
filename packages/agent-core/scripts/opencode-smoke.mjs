import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createOpencodeClient, createOpencodeServer } from "@opencode-ai/sdk";

const repoPath = process.cwd();
const timeoutMs = Number(process.env.OC_OPENCODE_SLICE_TIMEOUT_MS ?? 120_000);

const MODEL_ENV_KEYS = ["OC_MODEL_CHEAP", "OC_MODEL_STANDARD", "OC_MODEL_STRONG"];

const PROVIDER_API_KEY_ALIASES = {
  openai: ["OPENAI_API_KEY", "OC_OPENAI_API_KEY", "OC_LLM_API_KEY"],
  zhipu: ["ZHIPU_API_KEY", "GLM_API_KEY", "ZHIPUAI_API_KEY"],
  zhipuai: ["ZHIPU_API_KEY", "GLM_API_KEY", "ZHIPUAI_API_KEY"],
  zai: ["ZAI_API_KEY"],
  "zai-coding-plan": ["ZAI_API_KEY"],
  "zhipuai-coding-plan": ["ZHIPU_API_KEY", "GLM_API_KEY", "ZHIPUAI_API_KEY"],
};

const PROVIDER_ID_ALIASES = {
  zhipu: ["zhipuai", "zhipuai-coding-plan"],
  zhipuai: ["zhipu", "zhipuai-coding-plan"],
  "zhipuai-coding-plan": ["zhipuai", "zhipu"],
};

function parseModelRef(model) {
  const slash = model.indexOf("/");
  if (slash > 0) {
    return { providerID: model.slice(0, slash), modelID: model.slice(slash + 1) };
  }
  return { providerID: "openai", modelID: model };
}

function normalizeProvider(providerID) {
  return providerID.trim().toLowerCase();
}

function providerToEnvToken(providerID) {
  return normalizeProvider(providerID)
    .replace(/[^a-z0-9]/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

function providersFromEnv(preferred = []) {
  const providers = new Set();
  const explicit = process.env.OC_OPENCODE_PROVIDER;
  if (explicit) {
    providers.add(normalizeProvider(explicit));
  }
  for (const providerID of preferred) {
    providers.add(normalizeProvider(providerID));
  }
  for (const modelEnv of MODEL_ENV_KEYS) {
    const value = process.env[modelEnv];
    if (!value) {
      continue;
    }
    providers.add(parseModelRef(value).providerID);
  }
  return [...providers];
}

function apiKeyCandidates(providerID) {
  const token = providerToEnvToken(providerID);
  return [
    `OC_OPENCODE_${token}_API_KEY`,
    `OC_OPENCODE_API_KEY_${token}`,
    `${token}_API_KEY`,
    ...(PROVIDER_API_KEY_ALIASES[providerID] ?? []),
  ];
}

function readLocalAuth() {
  try {
    const dataHome = process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share");
    const authPath = path.join(dataHome, "opencode", "auth.json");
    return JSON.parse(fs.readFileSync(authPath, "utf8"));
  } catch {
    return {};
  }
}

function resolveApiKey(providerID, allProviders, localAuth) {
  const genericProvider = process.env.OC_OPENCODE_PROVIDER
    ? normalizeProvider(process.env.OC_OPENCODE_PROVIDER)
    : undefined;
  const genericApiKey = process.env.OC_OPENCODE_API_KEY;
  if (
    genericApiKey &&
    (genericProvider === providerID || (!genericProvider && allProviders.length <= 1))
  ) {
    return genericApiKey;
  }
  for (const keyName of apiKeyCandidates(providerID)) {
    if (process.env[keyName]) {
      return process.env[keyName];
    }
  }
  const normalized = normalizeProvider(providerID);
  const direct = localAuth[normalized];
  if (direct?.type === "api" && direct.key) {
    return direct.key;
  }
  for (const alias of PROVIDER_ID_ALIASES[normalized] ?? []) {
    const credential = localAuth[normalizeProvider(alias)];
    if (credential?.type === "api" && credential.key) {
      return credential.key;
    }
  }
  return undefined;
}

function defaultModelRef() {
  const localAuth = readLocalAuth();
  for (const providerID of ["zhipuai-coding-plan", "zai-coding-plan"]) {
    const credential = localAuth[providerID];
    if (credential?.type === "api" && credential.key) {
      return `${providerID}/glm-5.1`;
    }
  }
  return "gpt-4.1-mini";
}

function resolveProviderTarget(providerID, availableProviders) {
  const normalized = normalizeProvider(providerID);
  const candidates = [normalized, ...(PROVIDER_ID_ALIASES[normalized] ?? [])].map((item) =>
    normalizeProvider(item),
  );
  if (!availableProviders) {
    return candidates[0];
  }
  return candidates.find((candidate) => availableProviders.has(candidate));
}

async function injectAuth(client, directory, preferredProviders) {
  const localAuth = readLocalAuth();
  const providerIDs = [...new Set([...providersFromEnv(preferredProviders), ...Object.keys(localAuth)])];
  if (providerIDs.length === 0) {
    return [];
  }

  let available;
  try {
    const providers = await client.provider.list({ query: { directory } });
    available = new Set((providers.data?.all ?? []).map((provider) => normalizeProvider(provider.id)));
  } catch {
    available = undefined;
  }

  const injected = [];
  const seenTargets = new Set();
  for (const providerID of providerIDs) {
    const targetProvider = resolveProviderTarget(providerID, available);
    if (!targetProvider || seenTargets.has(targetProvider)) {
      continue;
    }
    const key = resolveApiKey(providerID, providerIDs, localAuth);
    if (!key) {
      continue;
    }
    await client.auth.set({
      path: { id: targetProvider },
      query: { directory },
      body: { type: "api", key },
    });
    seenTargets.add(targetProvider);
    injected.push(targetProvider);
  }
  return injected;
}

async function hasAssistantMessage(client, sessionId, directory) {
  const messages = await client.session.messages({
    path: { id: sessionId },
    query: { directory },
  });
  return (messages.data ?? []).some(
    (message) =>
      message.info.role === "assistant" &&
      message.parts?.some((part) => part.type === "text" && part.text?.trim()),
  );
}

async function waitForAssistantReply(client, sessionId, directory, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await hasAssistantMessage(client, sessionId, directory)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(`assistant reply timeout after ${timeoutMs}ms`);
}

async function main() {
  console.log("1. starting server...");
  const t0 = Date.now();
  const server = await createOpencodeServer({
    hostname: "127.0.0.1",
    port: 4521,
    timeout: 20_000,
    config: { permission: { edit: "ask", bash: "ask" } },
  });
  console.log("server url:", server.url, "in", Date.now() - t0, "ms");
  try {
    const client = createOpencodeClient({ baseUrl: server.url });

    console.log("2. creating session...");
    const sess = await client.session.create({ query: { directory: repoPath } });
    console.log("session:", sess.data?.id);

    console.log("3. status before prompt...");
    const st1 = await client.session.status({ query: { directory: repoPath } });
    console.log("status:", JSON.stringify(st1.data));

    const model = process.env.OC_MODEL_CHEAP || defaultModelRef();
    const { providerID, modelID } = parseModelRef(model);

    const injected = await injectAuth(client, repoPath, [providerID]);
    console.log("auth injected for providers:", injected.join(", ") || "(none)");

    console.log("4. promptAsync with", providerID, modelID);

    const prompt = client.session.promptAsync({
      path: { id: sess.data.id },
      query: { directory: repoPath },
      body: {
        model: { providerID, modelID },
        parts: [{ type: "text", text: "Reply with exactly: pong" }],
      },
    });
    const promptTimeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("promptAsync timeout 90s")), 90_000),
    );
    const promptRes = await Promise.race([prompt, promptTimeout]);
    console.log("prompt response:", JSON.stringify(promptRes, null, 2).slice(0, 2000));

    await waitForAssistantReply(client, sess.data.id, repoPath, timeoutMs);
    console.log("assistant message observed");

    const providers = await client.provider.list();
    const providerIds = providers.data?.all?.map((p) => p.id) ?? [];
    console.log("provider ids:", providerIds.join(", "));

    const auth = await client.provider.auth();
    console.log("provider auth:", JSON.stringify(auth.data, null, 2).slice(0, 2000));

    const messages = await client.session.messages({
      path: { id: sess.data.id },
      query: { directory: repoPath },
    });
    console.log("messages after prompt:", JSON.stringify(messages.data, null, 2).slice(0, 3000));

    console.log("done");
  } finally {
    server.close();
  }
}

main().catch((error) => {
  console.error("ERROR:", error);
  process.exit(1);
});
