import fs from "node:fs";
import path from "node:path";
import { SkillPackSchema, type SkillPack } from "@oc/shared";

const MAX_ANCESTOR_DEPTH = 12;

function findSkillPacksDirectory(startDir: string): string | null {
  let current = path.resolve(startDir);
  for (let depth = 0; depth < MAX_ANCESTOR_DEPTH; depth += 1) {
    const candidate = path.join(current, "skill-packs");
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return null;
}

export function resolveSkillPacksRoot(explicitRoot?: string): string {
  if (explicitRoot) {
    return path.resolve(explicitRoot);
  }
  if (process.env.OC_SKILL_PACKS_ROOT) {
    return path.resolve(process.env.OC_SKILL_PACKS_ROOT);
  }
  const fromCwd = findSkillPacksDirectory(process.cwd());
  if (fromCwd) {
    return fromCwd;
  }
  return path.resolve(process.cwd(), "skill-packs");
}

export function loadSkillPack(packId: string, root?: string): SkillPack {
  const packRoot = path.join(resolveSkillPacksRoot(root), packId);
  const manifestPath = path.join(packRoot, "skill.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Skill pack manifest not found: ${manifestPath}`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as unknown;
  return SkillPackSchema.parse(manifest);
}

export function readSkillPackDoc(packId: string, relativeDoc: string, root?: string): string {
  const pack = loadSkillPack(packId, root);
  const docPath = path.join(resolveSkillPacksRoot(root), packId, pack.docsPath, relativeDoc);
  if (!fs.existsSync(docPath)) {
    throw new Error(`Skill pack doc not found: ${docPath}`);
  }
  return fs.readFileSync(docPath, "utf8");
}

export function listInstalledSkillPacks(root?: string): SkillPack[] {
  const packsRoot = resolveSkillPacksRoot(root);
  if (!fs.existsSync(packsRoot)) {
    return [];
  }
  return fs
    .readdirSync(packsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => loadSkillPack(entry.name, root))
    .sort((a, b) => a.id.localeCompare(b.id));
}
