/** Build a hierarchical file tree from flat repo paths. */

export type FileTreeNode = {
  name: string;
  path: string;
  kind: "file" | "dir";
  children: FileTreeNode[];
};

export type FileTreeRow =
  | {
      kind: "dir";
      path: string;
      name: string;
      depth: number;
      expanded: boolean;
      childCount: number;
    }
  | {
      kind: "file";
      path: string;
      name: string;
      depth: number;
    };

function compareNodes(a: FileTreeNode, b: FileTreeNode): number {
  if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

function countDescendants(node: FileTreeNode): number {
  let count = 0;
  for (const child of node.children) {
    count += 1;
    if (child.kind === "dir") count += countDescendants(child);
  }
  return count;
}

export function buildFileTree(paths: string[]): FileTreeNode {
  const root: FileTreeNode = { name: "", path: "", kind: "dir", children: [] };

  for (const filePath of paths) {
    if (!filePath) continue;
    const parts = filePath.split("/").filter(Boolean);
    let current = root;
    let currentPath = "";

    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i]!;
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isLeaf = i === parts.length - 1;

      let child = current.children.find((node) => node.name === part);
      if (!child) {
        child = {
          name: part,
          path: currentPath,
          kind: isLeaf ? "file" : "dir",
          children: [],
        };
        current.children.push(child);
      }

      if (isLeaf) {
        child.kind = "file";
      } else if (child.kind === "file") {
        child.kind = "dir";
      }

      if (!isLeaf) {
        current = child;
      }
    }
  }

  return root;
}

export function flattenFileTree(
  root: FileTreeNode,
  expandedDirs: ReadonlySet<string>,
): FileTreeRow[] {
  const rows: FileTreeRow[] = [];

  const walk = (node: FileTreeNode, depth: number): void => {
    const sorted = [...node.children].sort(compareNodes);
    for (const child of sorted) {
      if (child.kind === "file") {
        rows.push({ kind: "file", path: child.path, name: child.name, depth });
        continue;
      }

      const expanded = expandedDirs.has(child.path);
      rows.push({
        kind: "dir",
        path: child.path,
        name: child.name,
        depth,
        expanded,
        childCount: countDescendants(child),
      });
      if (expanded) {
        walk(child, depth + 1);
      }
    }
  };

  walk(root, 0);
  return rows;
}

export function filterRepoPaths(paths: string[]): string[] {
  return paths.filter((file) => !file.includes("node_modules") && !file.startsWith("dist/"));
}
