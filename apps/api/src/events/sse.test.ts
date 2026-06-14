import { describe, expect, it } from "vitest";
import { setupTestApp } from "../test-utils.js";

async function readFirstSseData(body: ReadableStream<Uint8Array>): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value);
    const match = buffer.match(/^data: (.+)$/m);
    if (match?.[1]) {
      return match[1];
    }
  }

  throw new Error(`No SSE data frame found in buffer: ${buffer}`);
}

describe("SSE stream — M1", () => {
  it("replays events after afterSeq in order", async () => {
    const { app, projects, cleanup } = setupTestApp();
    try {
      const project = projects.createProject("SSE Replay");
      projects.setStatus(project.id, "Asking Questions", "analysis_started");

      const response = await app.request(
        `/projects/${project.id}/events/stream?afterSeq=1`,
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/event-stream");

      const data = await readFirstSseData(response.body!);
      const envelope = JSON.parse(data) as { seq: number; payload: { type: string } };
      expect(envelope.seq).toBe(2);
      expect(envelope.payload.type).toBe("project.status_changed");
    } finally {
      cleanup();
    }
  });

  it("does not duplicate replayed events", async () => {
    const { app, projects, cleanup } = setupTestApp();
    try {
      const project = projects.createProject("SSE Dedupe");
      projects.setStatus(project.id, "Asking Questions", "analysis_started");
      projects.setStatus(project.id, "PRD Ready", "analysis_complete");

      const response = await app.request(
        `/projects/${project.id}/events/stream?afterSeq=0`,
      );
      expect(response.status).toBe(200);

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const seqs: number[] = [];

      while (seqs.length < 3) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value);
        const matches = [...buffer.matchAll(/^data: (.+)$/gm)];
        for (const match of matches.slice(seqs.length)) {
          const envelope = JSON.parse(match[1]!) as { seq: number };
          seqs.push(envelope.seq);
        }
      }

      expect(seqs).toEqual([1, 2, 3]);
      expect(new Set(seqs).size).toBe(seqs.length);
    } finally {
      cleanup();
    }
  });

  it("streams a live event after the client connects", async () => {
    const { app, projects, cleanup } = setupTestApp();
    try {
      const project = projects.createProject("SSE Live");
      const response = await app.request(
        `/projects/${project.id}/events/stream?afterSeq=1`,
      );

      const readPromise = readFirstSseData(response.body!);
      setTimeout(() => {
        projects.setStatus(project.id, "Asking Questions", "live_update");
      }, 50);

      const data = await readPromise;
      const envelope = JSON.parse(data) as { payload: { type: string; status: string } };
      expect(envelope.payload.type).toBe("project.status_changed");
      expect(envelope.payload.status).toBe("Asking Questions");
    } finally {
      cleanup();
    }
  });
});
