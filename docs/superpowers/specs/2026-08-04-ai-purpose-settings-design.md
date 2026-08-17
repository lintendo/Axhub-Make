# AI 用途配置与检测折叠设计

## 背景

当前 AI 设置把本地 ACP 服务状态、Agent 版本与连接测试、默认 Agent 选择和批注专用配置放在同一条纵向流程中。现有 `defaultPromptClient` 同时被新建初始页、右侧对话面板和画布任务复用，而部分画布直接执行又借用了批注配置。用户无法从设置页判断每个入口最终会使用哪个 Agent 和模型。

随着支持的 Agent 增加，完整检测表也占用了过多空间。本地 ACP 已链接后，地址、检测结果和修复详情的日常价值较低，但仍长期占据首屏。

## 目标

- 将对话 AI、批注 AI、画布 AI 拆成三组独立的 Agent 和模型配置。
- 配置候选只来源于本机检测为 `installed` 的 Agent，不要求连接测试通过。
- 将 Agent 检测与用途配置分开，测试结果不再决定配置资格。
- 本地 ACP 已链接时大幅收起状态区，异常时自动展示修复信息。
- 缩短 Agent 检测列表的默认高度，同时保留版本刷新和连接测试能力。
- 移除画布底部由滑杆按钮打开的旧画布 AI 输入框，只保留“根据当前画布生成”。
- 迁移现有项目的默认 Agent，不中断升级后的既有 AI 入口。

## 非目标

- 不增加 Agent 安装器或认证配置。
- 不从 ACP 动态发现模型列表；模型继续使用可选的自定义模型 ID。
- 不要求 Agent 必须先通过消息测试才能用于某个 AI 场景。
- 不删除旧画布输入框留下的浏览器草稿缓存。
- 不改变独立的图片生成 API、API Key 和图片模型配置。

## 界面结构

AI 设置页按以下顺序组织：

1. AI 用途配置
2. 本地 ACP 服务
3. 本地 CLI Agent
4. 声音通知
5. 图片生成 API

### AI 用途配置

使用一张紧凑表格固定展示三行配置，可见列为“用途 / Agent / 模型”：

| 用途 | Agent | 模型 |
| --- | --- | --- |
| 对话 AI | 已安装 Agent 下拉 | 可选文本输入 |
| 批注 AI | 已安装 Agent 下拉 | 可选文本输入 |
| 画布 AI | 已安装 Agent 下拉 | 可选文本输入 |

桌面宽度的表头和数据行统一使用 `88px / minmax(0, 1fr) / minmax(0, 1fr)` 三列，两个控件列必须可收缩。表格外框和行分隔线统一使用设计系统的 `border-border`，表头使用轻量 `bg-muted/30`，不使用水平滚动容器。

模型输入留空时使用 Agent 或 ACP 自己的默认模型。未选择 Agent 时禁用对应模型输入，避免保存孤立模型值。

批注并发数保留在表格下方，与表格保持 12px 垂直间距，继续只影响批量批注执行，不放入本地 CLI Agent 区。

候选列表只包含版本检测状态严格等于 `installed` 的 Agent。`missing` 和 `unknown` 都不作为新选择出现。若已保存的 Agent 后来不可用，该值不被静默清除；当前行显示不可用状态，并允许用户改选已安装 Agent 或清空。保存其他设置不会自动覆盖该旧值。

### 本地 ACP 服务

服务区使用可折叠状态栏：

- `ready` 时默认折叠，只显示“已链接”、服务地址、上次检测时间、刷新按钮和展开按钮。
- 未检测、未链接、跨域失败或其他异常时自动展开。
- 展开内容沿用现有状态、检测结果、修复说明、启动命令、“复制启动命令”和“复制给 AI 处理”。
- 用户可通过带 `aria-expanded` 的按钮手动展开或收起，刷新动作与展开动作保持独立。
- 状态由异常变为 `ready` 后自动回到折叠摘要；用户在当前打开周期内主动展开时，不因普通重渲染被强制关闭。

### 本地 CLI Agent

本地 CLI Agent 独立为第二个可折叠区域，内部继续承担安装状态和连接测试：

- 折叠摘要显示已安装数量、Agent 总数和当前测试概况。
- 默认折叠；开始测试或出现测试失败时保持展开。
- 展开后的主列表只显示已安装 Agent，列出 Agent、版本、刷新动作、上次测试状态和测试动作。
- 未安装或检测未知的 Agent 收进一条次级摘要，不逐项占据主列表高度。
- 提供全量重新检测入口；单个已安装 Agent 仍可刷新版本。
- 测试状态只属于当前设置会话，不写入用途配置，也不作为下拉候选过滤条件。

## 配置模型

`automation` 使用三组显式字段：

```ts
interface AutomationAiPreferences {
  conversationPromptClient: PromptClientPreference;
  conversationModel: string | null;
  annotationPromptClient: PromptClientPreference;
  annotationModel: string | null;
  canvasPromptClient: PromptClientPreference;
  canvasModel: string | null;
  agentRunConcurrency: number;
}
```

`defaultPromptClient` 只作为旧配置的读取来源，不再作为新配置的运行字段或双写字段。这样兼容逻辑集中在配置规范化边界，业务代码只消费三组明确配置。

### 旧配置迁移

读取尚未包含新字段的项目时：

- `conversationPromptClient` 使用旧 `defaultPromptClient`。
- `canvasPromptClient` 使用旧 `defaultPromptClient`。
- `annotationPromptClient` 优先使用旧 `annotationPromptClient`；其为空时使用旧 `defaultPromptClient`，保持过去批注未单配时跟随默认 Agent 的实际行为。
- `annotationModel` 沿用旧值。
- 对话和画布模型初始化为空，继续使用各 Agent 默认模型。

迁移先发生在配置规范化结果中，并在用户下一次保存设置时持久化为三组新字段。保存结果不继续写入旧 `defaultPromptClient`，避免两套配置长期漂移。

## 运行入口映射

### 对话 AI

- 新建原型、资源、设计的 `StartGuide` composer 接收对话 Agent 和模型作为默认选择。
- 右侧 ACP UI iframe URL 使用 ACP 支持的 `provider` 和 `model` 查询参数传入默认选择。
- 画布右上角打开的侧边栏仍使用对话配置，因为它的产品语义是对话面板，而不是画布直接生成。
- 用户在具体 composer 中显式改选 provider/model 时，本次请求使用显式值；设置页值只提供默认值。

### 批注 AI

- 单条批注、批量批注和原型评审显式发送批注 provider/model。
- 批注并发数继续随批注直接执行请求发送。

### 画布 AI

- “根据当前画布生成”显式使用画布 provider/model。
- 其他仍保留的画布生成、画布图片提示词处理和画布提示词优化默认使用画布 provider/model。
- 画布请求中显式选择的 provider/model 优先于设置页默认值。

### 服务端兜底

前端直接执行请求应显式发送 provider/model。服务端按场景选择同类配置作为防漏兜底：批注与评审场景使用批注配置，`canvas-*` 场景使用画布配置，其他对话或直接场景使用对话配置。Agent 连接测试始终使用测试请求显式指定的 provider，不受三组默认值影响。

## 移除旧画布输入框

从 `CanvasAiGenerationTool` 移除以下旧交互与仅为它服务的状态和提交链路：

- 底部滑杆图标按钮。
- “画布 AI 输入”展开 composer。
- composer 内的生成类型切换、提示词输入、复制、优化和提交入口。

保留底部 Sparkles 按钮和“根据当前画布生成”流程，包括运行中状态、取消动作、画布截图、会话复用、结果回写和错误反馈。旧草稿缓存不主动删除。

## 状态与错误处理

- ACP 未链接不阻止用户预先配置三类用途；实际执行时继续打开 AI 设置并显示展开的服务修复区。
- Agent 版本检测失败时保留已加载的配置，不自动清空任何用途。
- 当前配置不可用时提供行级提示；只有用户明确改选或清空后才改变保存值。
- 某个 Agent 测试失败只更新检测区，不撤销它在用途表中的选择。
- 模型 ID 只做首尾空白清理；空字符串持久化为 `null`。
- 三类入口缺少有效 Agent 时，错误文案指出具体用途，例如“请先配置画布 AI Agent”。

## 可访问性与响应式

- 折叠触发器使用按钮、可见焦点和 `aria-expanded`。
- 图标按钮提供明确的 `aria-label` 与 Tooltip。
- 桌面宽度使用三列表格；窄屏时隐藏公共表头，每个用途行改为带字段标签的纵向布局，Agent 和模型输入不发生水平溢出。
- 状态摘要中的地址允许截断并通过 `title` 查看完整值。

## 验证

### 配置与服务端

- 覆盖旧 `defaultPromptClient` 到对话、批注兜底和画布配置的规范化迁移。
- 覆盖新字段优先于旧字段，以及保存后不再依赖旧字段。
- 覆盖模型空值规范化和并发数边界。
- 覆盖服务端按对话、批注、评审、画布场景选择正确 provider/model。

### 设置页

- 候选下拉只包含 `installed` Agent，不依赖测试通过状态。
- 已保存但不可用的 Agent 保留并显示提示。
- ACP `ready` 默认折叠，异常默认展开，手动切换和刷新互不干扰。
- Agent 检测默认折叠，测试中或失败保持展开。
- 三行配置和模型输入保存到对应字段。

### 运行入口

- 新建初始页和右侧面板收到对话默认 provider/model。
- 批注与评审请求收到批注 provider/model。
- 画布一键生成与画布提示词优化收到画布 provider/model。
- 显式 provider/model 继续覆盖用途默认值。

### 画布回归

- 不再渲染“打开画布 AI 输入框”、滑杆按钮或 `data-axhub-canvas-start-composer`。
- “根据当前画布生成”和取消运行仍可用。
- 桌面和窄屏视口中设置表格、折叠摘要、提示文案和按钮无重叠或溢出。

运行 `@axhub/make` 的针对性 Vitest、TypeScript/构建检查，并通过浏览器实际打开 AI 设置页验证桌面与窄屏布局。
