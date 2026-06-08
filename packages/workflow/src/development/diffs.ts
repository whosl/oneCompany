import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { diffs, emit, type Db, type DevState, type EventEnvelope } from "@oc/shared";

export function captureDiff(
  db: Db,
  state: DevState,
  sliceId: string,
  onEvent?: (envelope: EventEnvelope) => void,
): DevState {
  let summary = `Changes for slice ${sliceId}`;
  try {
    const commitCount = execFileSync("git", ["rev-list", "--count", "HEAD"], {
      cwd: state.repoPath,
      encoding: "utf8",
    }).trim();
    if (commitCount === "1") {
      summary = `Initial commit for slice ${sliceId}`;
    } else {
      const output = execFileSync("git", ["diff", "--stat", "HEAD~1", "HEAD"], {
        cwd: state.repoPath,
        encoding: "utf8",
      }).trim();
      if (output) {
        summary = output.split("\n").slice(-1)[0] ?? summary;
      }
    }
  } catch {
    summary = `Committed slice ${sliceId}`;
  }

  const diffId = `diff-${sliceId}-${randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();

  db.insert(diffs)
    .values({
      id: randomUUID(),
      project_id: state.projectId,
      diff_id: diffId,
      summary,
      path: state.repoPath,
      created_at: now,
    })
    .run();

  const envelope = emit(db, {
    projectId: state.projectId,
    payload: {
      type: "diff.created",
      projectId: state.projectId,
      diffId,
      summary,
    },
  });
  onEvent?.(envelope);

  return {
    ...state,
    diffs: [...state.diffs, { diffId, summary, path: state.repoPath }],
  };
}
