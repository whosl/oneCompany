/** Tool call presentation helpers, ported from apps/tui/src/catalog.ts. */

const TOOL_VERBS: Record<string, string> = {
  bash: "运行命令",
  shell: "运行命令",
  write: "写入文件",
  edit: "编辑文件",
  multiedit: "编辑文件",
  patch: "编辑文件",
  read: "读取文件",
  glob: "搜索文件",
  grep: "搜索代码",
  list: "浏览目录",
  todowrite: "更新任务清单",
  todoread: "查看任务清单",
  webfetch: "抓取网页",
  task: "派发子任务",
};

const WRITE_TOOL_NAMES = new Set(["write", "edit", "multiedit", "patch"]);

export function isWriteTool(toolName: string): boolean {
  return WRITE_TOOL_NAMES.has(toolName.toLowerCase());
}

/** In-progress suffix for tool rows in the activity stream. */
export function toolInProgressSuffix(toolName?: string): string {
  return isWriteTool(toolName ?? "") ? "写入中…" : "…";
}

/** Human-readable Chinese verb for a tool call ("运行命令" / "写入文件" …). */
export function toolVerb(toolName: string): string {
  const key = toolName.toLowerCase();
  if (TOOL_VERBS[key]) return TOOL_VERBS[key];
  if (key.startsWith("oc_") || key.includes(":")) return `调用集成 ${toolName}`;
  if (key.includes("requirement-context")) return "读取需求上下文";
  if (key.includes("read-artifact")) return "读取产物";
  if (key.includes("workspace-read")) return "读取工作区";
  return toolName;
}
