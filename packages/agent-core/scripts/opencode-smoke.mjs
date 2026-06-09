import { createOpencodeClient, createOpencodeServer } from "@opencode-ai/sdk";

const repoPath = process.cwd();

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

  const client = createOpencodeClient({ baseUrl: server.url });

  console.log("2. creating session...");
  const sess = await client.session.create({ query: { directory: repoPath } });
  console.log("session:", sess.data?.id);

  console.log("3. status before prompt...");
  const st1 = await client.session.status({ query: { directory: repoPath } });
  console.log("status:", JSON.stringify(st1.data));

  const model = process.env.OC_MODEL_CHEAP || "gpt-4.1-mini";
  const slash = model.indexOf("/");
  const providerID = slash > 0 ? model.slice(0, slash) : "openai";
  const modelID = slash > 0 ? model.slice(slash + 1) : model;
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

  for (let i = 0; i < 3; i++) {
    const stDir = await client.session.status({ query: { directory: repoPath } });
    const stNoDir = await client.session.status();
    const sessGet = await client.session.get({
      path: { id: sess.data.id },
      query: { directory: repoPath },
    });
    console.log("status(dir):", JSON.stringify(stDir.data));
    console.log("status(no dir):", JSON.stringify(stNoDir.data));
    console.log("session.get:", JSON.stringify(sessGet.data));
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  server.close();
  console.log("done");
}

main().catch((error) => {
  console.error("ERROR:", error);
  process.exit(1);
});
