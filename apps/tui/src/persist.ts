import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Tiny on-disk store for gate decisions made in this TUI.
 *
 * The server keeps a gate row "open" until the resumed workflow yields (which
 * can take minutes for opencode coding slices), so without persistence the
 * gate card would reappear after leaving and re-entering the project.
 */

const FILE = path.join(os.tmpdir(), "onecompany-tui-dismissed-gates.json");
const YOLO_FILE = path.join(os.tmpdir(), "onecompany-tui-yolo.json");
const MAX_ENTRIES = 200;

type DismissedMap = Record<string, string[]>; // projectId -> gateIds

function readAll(): DismissedMap {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, "utf8")) as DismissedMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function loadDismissedGates(projectId: string): Set<string> {
  return new Set(readAll()[projectId] ?? []);
}

export function persistDismissedGate(projectId: string, gateId: string): void {
  try {
    const all = readAll();
    const list = all[projectId] ?? [];
    if (!list.includes(gateId)) list.push(gateId);
    all[projectId] = list.slice(-MAX_ENTRIES);
    fs.writeFileSync(FILE, JSON.stringify(all));
  } catch {
    // Best-effort cache; losing it only means a stale gate card may reappear.
  }
}

export function loadYoloMode(): boolean {
  try {
    const parsed = JSON.parse(fs.readFileSync(YOLO_FILE, "utf8")) as { enabled?: boolean };
    return parsed?.enabled === true;
  } catch {
    return false;
  }
}

export function persistYoloMode(enabled: boolean): void {
  try {
    fs.writeFileSync(YOLO_FILE, JSON.stringify({ enabled }));
  } catch {
    // Best-effort preference.
  }
}
