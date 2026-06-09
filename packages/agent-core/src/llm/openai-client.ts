import { EngineUnavailableError, getOpenAiApiKey } from "../engine-mode.js";

export async function callOpenAiChatJson(params: {
  model: string;
  system: string;
  user: string;
}): Promise<unknown> {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    throw new EngineUnavailableError("OPENAI_API_KEY is not configured");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: params.model,
      messages: [
        { role: "system", content: params.system },
        { role: "user", content: params.user },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new EngineUnavailableError(`OpenAI request failed (${response.status}): ${text}`);
  }

  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = body.choices?.[0]?.message?.content;
  if (!content) {
    throw new EngineUnavailableError("OpenAI response missing message content");
  }

  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new EngineUnavailableError("OpenAI response was not valid JSON");
  }
}
