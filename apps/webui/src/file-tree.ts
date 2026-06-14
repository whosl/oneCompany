export type FileTreeNode = {
  name: string;
  path: string;
  kind: "file" | "dir";
  children: FileTreeNode[];
};

export type FileTreeRow =
  | { kind: "dir"; path: string; name: string; depth: number; expanded: boolean; childCount: number }
  | { kind: "file"; path: string; name: string; depth: number };

const compareNodes = (a: FileTreeNode, b: FileTreeNode) => {
  if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
};

const countDescendants = (node: FileTreeNode): number => node.children.reduce(
  (count, child) => count + 1 + (child.kind === "dir" ? countDescendants(child) : 0),
  0,
);

export function buildFileTree(paths: string[]): FileTreeNode {
  const root: FileTreeNode = { name: "", path: "", kind: "dir", children: [] };
  for (const filePath of paths) {
    const parts = filePath.split("/").filter(Boolean);
    let current = root;
    let currentPath = "";
    parts.forEach((part, index) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isLeaf = index === parts.length - 1;
      let child = current.children.find((node) => node.name === part);
      if (!child) {
        child = { name: part, path: currentPath, kind: isLeaf ? "file" : "dir", children: [] };
        current.children.push(child);
      } else if (!isLeaf) {
        child.kind = "dir";
      }
      if (!isLeaf) current = child;
    });
  }
  return root;
}

export function flattenFileTree(root: FileTreeNode, expandedDirs: ReadonlySet<string>): FileTreeRow[] {
  const rows: FileTreeRow[] = [];
  const walk = (node: FileTreeNode, depth: number) => {
    for (const child of [...node.children].sort(compareNodes)) {
      if (child.kind === "file") {
        rows.push({ kind: "file", path: child.path, name: child.name, depth });
        continue;
      }
      const expanded = expandedDirs.has(child.path);
      rows.push({ kind: "dir", path: child.path, name: child.name, depth, expanded, childCount: countDescendants(child) });
      if (expanded) walk(child, depth + 1);
    }
  };
  walk(root, 0);
  return rows;
}

export const filterRepoPaths = (paths: string[]) => paths.filter(
  (path) => !path.includes("node_modules") && !path.startsWith("dist/"),
);
