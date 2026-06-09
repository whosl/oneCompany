import path from "node:path";
import { createOpencodeClient, createOpencodeServer } from "@opencode-ai/sdk";

const repoPath = process.argv[2];
const timeoutMs = 120000;

function parseModelRef(model) {
  const slash = model.indexOf("/");
  if (slash > 0) return { providerID: model.slice(0, slash), modelID: model.slice(slash + 1) };
  return { providerID: "openai", modelID: model };
}

async function injectAuth(client, directory) {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const authPath = path.join(os.homedir(), ".local/share/opencode/auth.json");
  const localAuth = JSON.parse(fs.readFileSync(authPath, "utf8"));
  for (const providerID of ["zhipuai-coding-plan"]) {
    const key = localAuth[providerID]?.key;
    if (key) {
      await client.auth.set({ path: { id: providerID }, query: { directory }, body: { type: "api", key } });
      console.log("injected", providerID);
    }
  }
}

const prompt = `Implement slice "add-todo" using strict TDD.
Goal: Add Todo Command with File Persistence
Scoped test command: pnpm vitest run src/add.test.ts --reporter=json
Write failing tests first, then implement until the scoped tests would pass, then stop.`;

const server = await createOpencodeServer({
  hostname: "127.0.0.1", port: 4533, timeout: 20000,
  config: { permission: { edit: "ask", bash: "ask" } },
});
const client = createOpencodeClient({ baseUrl: server.url });
const directory = path.resolve(repoPath);
await injectAuth(client, directory);
const sess = await client.session.create({ body: { title: "slice:add-todo" }, query: { directory } });
console.log("session", sess.data?.id, "err", sess.error);

let idle = false;
let assistant = false;
const events = [];
void (async () => {
  const stream = await client.event.subscribe({ query: { directory } });
  for await (const ev of stream.stream) {
    events.push(ev.type);
    if (ev.type === "session.idle" && ev.properties.sessionID === sess.data.id) idle = true;
    if (ev.type === "message.part.updated" && ev.properties.part?.sessionID === sess.data.id && ev.properties.part?.type === "text") assistant = true;
    if (ev.type === "permission.updated" && ev.properties.sessionID === sess.data.id) console.log("PERMISSION", JSON.stringify(ev.properties).slice(0,300));
    if (ev.type === "session.error") console.log("SESSION_ERROR", JSON.stringify(ev.properties).slice(0,500));
  }
})();

const model = parseModelRef("zhipuai-coding-plan/glm-5.1");
await client.session.promptAsync({ path: { id: sess.data.id }, query: { directory }, body: { model, parts: [{ type: "text", text: prompt }] } });

const start = Date.now();
while (Date.now() - start < timeoutMs) {
  if (assistant) { console.log("exit: assistant at", Date.now()-start); break; }
  if (idle) { console.log("exit: idle at", Date.now()-start); break; }
  await new Promise(r => setTimeout(r, 500));
}

const status = await client.file.status({ query: { directory } });
console.log("changed files", (status.data ?? []).map(f => f.path));
const messages = await client.session.messages({ path: { id: sess.data.id }, query: { directory } });
console.log("message count", messages.data?.length);
for (const m of messages.data ?? []) {
  console.log("role", m.info.role, "parts", m.parts?.map(p => p.type + (p.tool ? ':'+p.tool : '')).join(','));
}
console.log("event types sample", [...new Set(events)].join(','));
server.close();
