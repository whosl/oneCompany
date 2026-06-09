import os from "node:os";
import path from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import {
  Annotation,
  Command,
  END,
  START,
  StateGraph,
  interrupt,
} from "@langchain/langgraph";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import { describe, expect, it } from "vitest";

describe("graph checkpointer — durability", () => {
  it("SqliteSaver resumes an interrupted graph across saver instances", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "oc-ckpt-"));
    const dbFile = path.join(dir, "ckpt.sqlite");

    const StateAnnotation = Annotation.Root({ n: Annotation<number> });
    const build = (saver: SqliteSaver) =>
      new StateGraph(StateAnnotation)
        .addNode("a", (s) => ({ n: (s.n ?? 0) + 1 }))
        .addNode("wait", (s) => {
          const resume = interrupt({ ask: "x" }) as string;
          return { n: s.n + Number(resume) };
        })
        .addEdge(START, "a")
        .addEdge("a", "wait")
        .addEdge("wait", END)
        .compile({ checkpointer: saver });

    const cfg = { configurable: { thread_id: "t1" } };
    try {
      const g1 = build(SqliteSaver.fromConnString(dbFile));
      const r1 = (await g1.invoke({ n: 0 }, cfg)) as { n: number };
      expect(r1.n).toBe(1);

      // A brand-new saver from the same DB file simulates a process restart.
      const g2 = build(SqliteSaver.fromConnString(dbFile));
      const r2 = (await g2.invoke(new Command({ resume: "10" }), cfg)) as {
        n: number;
      };
      expect(r2.n).toBe(11);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
