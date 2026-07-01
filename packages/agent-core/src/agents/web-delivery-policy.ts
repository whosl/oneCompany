/** Shared delivery policy: every generated project ships a browser-accessible Web UI. */
export const WEB_DELIVERY_POLICY = [
  "交付形态必须是可在浏览器中访问的 Web 应用（除非用户原始需求明确只要 CLI/API 库且 appType 为 cli/api）。",
  "禁止只交付 TypeScript service/model 层而无页面——用户必须在 Preview URL 看到可交互的产品界面。",
  "页面须包含 data-testid（至少 app-shell / app-page / app-title），便于 E2E 与 Playwright 验证。",
  "package.json 必须提供 dev 或 preview 脚本，用于本地与 Preview 服务器启动 Web 应用。",
  "不得将平台 scaffold 占位页（标题 generated-app）作为最终交付。",
].join("\n");

export const WEB_REQUIREMENT_GUIDANCE = [
  "默认 appType 为 web；识别目标用户、核心页面与操作流程（pagesAndFlows 至少列出 1 个用户可见页面）。",
  "PRD 与验收标准必须包含可在浏览器中验证的 UI 行为（表单、列表、按钮、导航等），不能只有后端逻辑描述。",
].join("\n");

export const WEB_DEVELOPMENT_GUIDANCE = [
  "技术栈须包含前端（静态 HTML+CSS、或 React/Vue 等 SPA）与可启动的 dev/preview 服务器。",
  "每个功能切片的 expectedFiles 是规划提示（须与技术方案目录一致，并包含页面或前端入口）；权威验收以 vitest 通过 + 真实 Web UI 为准。",
  "每个切片的 acceptanceChecks 至少一条须描述用户在浏览器中可见/可操作的行为。",
  "编码时须创建或更新 Web 页面，将业务功能暴露为 UI，而非仅写 src/services 下的纯逻辑。",
  "第一个切片完成后，Preview 即应展示真实产品壳（非 generated-app 占位页）。",
  "SPA 路由须兼容 Preview base path：如果使用 BrowserRouter，必须设置 basename={import.meta.env.BASE_URL}，否则在 /preview/<id>/ 路径下页面会空白。",
].join("\n");

export const WEB_DEPLOYMENT_GUIDANCE = [
  "交付说明须写明如何在浏览器打开应用（pnpm dev / npm run dev 与访问地址）。",
  "部署前确认 Preview URL 展示的是产品界面，而非 scaffold 占位页。",
  "previewHints 应提示用户打开浏览器验证关键页面。",
].join("\n");
