# HTML 规格生产 Bootstrap 与 iframe 消息桥设计

## 目标

修复 HTML 格式原型规格在生产构建中无法加载编辑器的问题，并让 iframe 消息在 Make 管理页与动态端口原型运行时之间可靠传递。端口不是协议的一部分：所有 target origin 必须由每个会话的目标 URL 推导。

## 已确认事实

- html-template-bootstrap.js 的生产依赖图会在 spec-template-vendor、vendor-common、vendor-antd 之间形成循环；Keyframe 在初始化前被读取，报出 Cannot access 'Oi' before initialization。
- HTML 规格内容由 /api/projects/:projectId/prototypes/:prototypeId/spec/content 注入 /assets/html-template-bootstrap.js，编辑器提示是 bootstrap 执行失败后的症状。
- 51728 是当次 client runtime 的动态 origin。浏览器报错显示 iframe.src 已指向 client，但 contentWindow 还处于旧文档或继承宿主 origin 的初始文档。
- AI iframe 已通过动态 target URL、event.source + event.origin 验证以及 ACK/有限重试处理同类竞态；通知音由 Make 宿主执行，避免跨 iframe 回调播放音频。

## 方案比较

### 方案 A：最小单点补丁

仅改 manual chunk 规则，并在当前 postMessage 调用前增加延时。优点是 diff 小；缺点是依赖固定时长、复制现有桥接逻辑，无法证明动态端口或 iframe 重建后仍正确。

### 方案 B：定向可靠桥接（采用）

修正 manual chunk 归类；新增可测试的 iframe 请求会话工具；只迁移 HTML/原型编辑器桥与确认存在竞态的快速编辑握手。AI 与通知保留既有稳定实现，只对其协议规则做回归测试。该方案既消除当前故障，又避免全仓重构。

### 方案 C：一次性统一所有 postMessage

把 AI、通知、预览、导出、编辑器都迁移到全新总线。长期最一致，但当前工作区已有大量并行改动，风险远高于本次故障的必要范围。

## 构建修复设计

@ant-design/x 与 @ant-design/x-markdown 必须按照 @ant-design/ 规则归入 vendor-antd，不能由 SPEC_TEMPLATE_PACKAGES 抢先归入 spec-template-vendor。HTML parser、语法高亮和 Markdown parser 仍保留在 spec-template-vendor。

构建验证不以文件存在为准，而以执行为准：在 dist/admin/assets/html-template-bootstrap.js 上运行全新 Node ESM import。该入口在 Node 环境不会挂载 window，但会执行完整 ESM 初始化图，故可稳定捕获 TDZ 循环。浏览器测试再验证它实际挂载 HtmlTemplateBootstrap.editors。

## iframe 消息会话设计

新增 iframeMessageRequest.ts，暴露受限的 postIframeMessageRequest 接口，输入 iframe、targetUrl、request、successTypes、errorTypes、timeoutMs、retryDelaysMs 和 isCurrent。

它的职责仅限于：

1. 从 targetUrl 推导严格 target origin；无效 URL 立即失败，不退化为星号。
2. 记录请求开始时的 contentWindow，每次重发与接收时都要求该 window 和 isCurrent 未变化。
3. 使用唯一 requestId；只接受同一 ID、允许的 success/error type、正确 source 和正确 origin 的响应。
4. 在 0、160、520、1200、2500ms 尝试发送，收到 ACK、目标过期或超时后清理 listener 和定时器。
5. 不通过 contentWindow.location.origin 猜测目标，因为初始 about:blank 会继承 Make origin；真正的动态 origin 来自资源或会话 URL。

usePrototypeEditorBridgeActions 使用该工具发送 AXHUB_PROTOTYPE_EDITOR 请求，并将响应处理收敛到该工具。直接同源 API 和 HTML bootstrap 注入仍优先；只有 API 不存在时才走消息桥。

usePreviewIframeActions 继续从 iframe 的动态 src 解析 origin，但其 iframe generation/readiness 信息只用于拒绝过期窗口，不能把固定端口或当前宿主 origin 当作替代值。

## 失败与安全策略

- HTML bootstrap 导入异常：记录 chunk/资源诊断并显示编辑器不可用；不能继续把失败误报为客户端未接入。
- iframe 已切换：取消旧请求，不向新 iframe 接收旧 requestId 的响应。
- source 或 origin 不匹配：静默拒绝，保留可测试的诊断路径。
- 无 ACK：有限重试后返回 null，由调用方决定提示；不无限重发。
- 所有端口可动态变化；测试使用随机可用端口，禁止对 51728 或 53817 做断言。

## 测试架构

| 层 | 位置 | 覆盖 |
| --- | --- | --- |
| 单元 | src/chunking 和 iframe helper 测试 | chunk 所有权、origin 推导、ACK、超时、目标切换、伪造回包 |
| 构建产物 | scripts/regression | fresh dist 的 ESM import，阻止 TDZ 回归 |
| 浏览器 | 临时 .local/test-scripts | 两个随机端口、about:blank 到 runtime、HTML 规格打开/退出、控制台错误采集 |
| 发布包 | .release/make/npm-package | release prepare 后对 staged admin asset 重复 import，再执行本地发布包测试 |
| 既有回归 | Vitest 与 smoke | prototype spec API、Vite resource、editor bridge、AI bridge、通知 |

## 验收标准

- 新构建与 staged npm package 均可执行 HTML bootstrap，不再出现 Cannot access 'Oi' before initialization。
- 浏览器加载 HTML 规格后存在 window.HtmlTemplateBootstrap.editors.enable。
- 在任意随机 Make/client 端口组合下，规格打开、批注、退出与原型恢复不出现 target-origin mismatch。
- 错误 source、错误 origin、过期 iframe 的 ACK 必须被拒绝。
- 现有 AI 执行、通知、快速编辑和发布 smoke 不回退。

