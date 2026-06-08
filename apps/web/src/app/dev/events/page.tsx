"use client";

import { useEffect, useMemo, useState } from "react";

type EventEnvelope = {
  eventId: string;
  seq: number;
  projectId: string;
  timestamp: string;
  payload: { type: string };
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001";

export default function DevEventsPage() {
  const [projectId, setProjectId] = useState("");
  const [events, setEvents] = useState<EventEnvelope[]>([]);
  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");

  const streamUrl = useMemo(() => {
    if (!projectId.trim()) {
      return "";
    }
    return `${API_BASE}/projects/${projectId.trim()}/events/stream?afterSeq=0`;
  }, [projectId]);

  useEffect(() => {
    if (!streamUrl) {
      setEvents([]);
      setStatus("idle");
      return;
    }

    setStatus("connecting");
    setEvents([]);

    const source = new EventSource(streamUrl);

    source.onopen = () => setStatus("connected");
    source.onerror = () => setStatus("error");
    source.onmessage = (message) => {
      const envelope = JSON.parse(message.data) as EventEnvelope;
      setEvents((current) => [...current, envelope]);
    };

    return () => {
      source.close();
    };
  }, [streamUrl]);

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">Dev Event Stream</h1>
      <p className="text-sm text-muted-foreground">
        Temporary M1 viewer. Paste a project id and watch SSE envelopes arrive live.
      </p>
      <label className="flex flex-col gap-2 text-sm">
        Project ID
        <input
          className="rounded-md border px-3 py-2"
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
          placeholder="project uuid"
        />
      </label>
      <p className="text-sm">Status: {status}</p>
      <ul className="flex flex-col gap-3">
        {events.map((event) => (
          <li key={event.eventId} className="rounded-md border bg-card p-3">
            <pre className="overflow-x-auto text-xs">{JSON.stringify(event, null, 2)}</pre>
          </li>
        ))}
      </ul>
    </main>
  );
}
