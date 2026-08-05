# Codex Surface 无对话模式设计

## 目标

在现有 `@axhub/make` npm 包中增加 Codex 专用页面模式。无论用户通过 Codex++ 还是官方 Codex 打开的左侧 `Axhub Make` 入口，均打开：

```text
http://127.0.0.1:53817/?surface=codex
```

该页面不提供 Make 自带的对话 AI，避免与 Codex 的任务和对话体验重复。普通浏览器继续打开根地址，保留现有完整 Make。两种页面可以同时连接同一个 Make 服务和项目数据。

本次不拆分 npm 包，不启动第二个服务端口，也不维护第二套 Admin UI 构建产物。

## 产品边界

Codex 页面移除以下会话体验：

- 右侧对话面板，以及打开、关闭和自动弹出对话面板的行为；
- 整个“打开”菜单，包括 IDE、Web AI、CLI Agent 和本地 AI 应用入口；
- 画布中的“打开对话 AI”与添加元素、截图或图片到对话上下文；
- 原型预览编辑器中的打开 AI、发送给 AI、唤醒 Agent 和停止 AI 修改动作；
- 对话通知、对话恢复状态和聊天专属设置；
- 提示词操作中的“AI 执行”或“发送到 AI 侧栏”分支；
- 新建项目弹窗中的“AI 执行”选项。

普通资源卡片目前没有统一、常驻的“AI 执行 / 发送给 AI”入口，因此不把“隐藏资源卡片入口”列为单独改造项。现有 `PromptActionButton` 分散用于导入、导出、规格、引用处理等场景；Codex 页面保留其复制提示词能力，但不提供会话执行的默认动作或下拉动作。

Codex 页面继续保留以下直接执行能力：

- AI 图片生成；
- AI 原型生成；
- 画布中的文档、流程图、页面等直接生成；
- 标注直接执行与页面快速修改；
- 提示词优化；
- 版本说明生成；
- 单纯的复制提示词；
- 所有非 AI 的项目管理、编辑、预览、标注、导入导出和发布功能。

这些直接执行能力可以继续复用现有 Assistant/ACP 服务端运行时，但不得挂载对话 iframe，也不得自动打开对话面板。

## 页面能力模型

增加统一页面类型：

```ts
type MakeSurface = 'standard' | 'codex';
```

Admin UI 启动时只解析一次当前 URL，并从页面类型派生不可变能力表：

```ts
interface MakeSurfaceCapabilities {
  conversationUi: boolean;
  externalOpenMenu: boolean;
  directAiTools: boolean;
}
```

能力矩阵固定为：

| 页面 | `conversationUi` | `externalOpenMenu` | `directAiTools` |
| --- | --- | --- | --- |
| `standard` | `true` | `true` | `true` |
| `codex` | `false` | `false` | `true` |

页面组件读取能力表，不在不同组件内重复解析 `location.search`。未知或缺失的 `surface` 值一律回退到 `standard`，避免改变现有用户行为。

`surface=codex` 是产品界面能力边界，不是服务端安全权限边界。它不会用于鉴权，也不会宣称阻止用户直接调用本地 API。

## 前端集成

在 Admin UI 根层创建并注入 surface 能力，使功能在组件树源头关闭：

- Codex 页面不挂载 `AssistantPanel`，也不初始化对话 iframe 池、自动打开或通知订阅；
- `OpenInDropdown` 所在位置不渲染整个“打开”菜单；
- 向 `PromptActionButton` 传入的会话执行函数在 Codex 页面为 `undefined`，按钮只呈现复制提示词；
- 画布和预览页不接收添加到对话上下文、打开对话或发送给 Agent 的回调；
- 设置对话框不显示聊天专属配置，但保留图片生成和直接执行所需配置；
- 直接生成工具继续接收其现有运行时与提交函数。

功能关闭必须通过 React 属性和组件挂载边界完成，不使用 CSS 隐藏，也不依赖 Codex++ 用户脚本删除 DOM。

## 事件降级

历史原型页面或旧版编辑器仍可能向宿主页发送会话动作。Codex 页面按以下规则处理：

- `copy-prompt`：正常复制并反馈成功；
- `send-to-agent`、`wake-agent` 及等价的对话打开动作：不打开会话，不启动外部 Agent；如果事件同时包含可复制的提示词，则降级为复制提示词，否则返回明确的“不支持”结果；
- 直接执行协议：继续按现有路径运行，不转换为对话动作；
- 未知动作：沿用现有拒绝逻辑。

事件处理不得因为对话不可用而静默失败，也不得自动切回 `standard` 页面。

## Codex++ 与官方 Codex 启动链路

伴随服务仍启动或复用固定的 Make 服务：

```text
npx --yes --package @axhub/make@<version> axhub-make \
  --host 127.0.0.1 --port 53817 --no-open
```

两类用户共享同一个固定本地 CDP 端口 `9229` 与同一个 Axhub Companion：

- Codex++ 用户仍直接打开 Codex++；Codex++ 负责使 CDP 端口可用；
- 只有官方 Codex 的用户运行 `npx -y @axhub/make@latest codex open`；该命令检查端口、以 `--remote-debugging-port=9229` 和受控的 `--remote-allow-origins` 参数启动官方 Codex，并等待 `app://` CDP target 出现；
- 如果官方 Codex 已按普通方式运行而端口不可用，`codex open` 只提示用户退出该实例后重试，绝不强制结束用户进程。

Companion 连接端口后，对当前 `app://` renderer 执行 `Runtime.evaluate`，并注册 `Page.addScriptToEvaluateOnNewDocument`，使后续 renderer 也获得同一侧边栏入口。它不使用 Codex++ 的 `user_scripts` 目录，不修改 Codex 或 Codex++ 应用文件，也不启动第二个 Codex 进程。

健康检查仍使用固定根源 `http://127.0.0.1:53817`。服务健康后，CDP 注入的侧边栏源只把内置浏览器打开地址设为：

```text
http://127.0.0.1:53817/?surface=codex
```

安装、更新、诊断和卸载对两类用户相同：

```bash
npx -y @axhub/make@latest codex install
npx -y @axhub/make@latest codex doctor
npx -y @axhub/make@latest codex uninstall
```

日常启动按用户已有客户端选择：

```bash
# 已安装 Codex++：正常从 Codex++ 启动，无额外命令

# 只有官方 Codex：用这一条替代日常打开 Codex
npx -y @axhub/make@latest codex open
```

## 错误处理与兼容性

- 普通根地址的现有行为必须保持不变，包括对话面板、打开菜单和提示词执行动作；
- Codex 页面无法初始化某个直接执行工具时，沿用该工具现有的错误提示，不回退到聊天；
- 已有 Make 服务无论由普通终端、Codex++ 或官方 Codex 启动器触发，都能同时服务两种页面；
- 页面刷新和项目切换不得丢失 `surface=codex`，Admin UI 内部构造页面 URL 时需要保留 surface 参数；
- CDP 注入的侧边栏源只接受固定 loopback origin，并固定追加受控的 `surface=codex` 查询参数；
- Codex 或 Codex++ 更新导致侧边栏脚本失效时，现有 `codex doctor` 与重新安装流程保持不变；
- `codex doctor` 分别报告 Codex++ 与官方 Codex 默认安装路径，并报告 `9229` 上实际可见的 `app://` target；缺失任一客户端只产生 warning，两个候选都缺失时安装仍可用于自定义路径或随后安装客户端。

## 测试设计

增加以下自动化覆盖：

1. Surface 解析单元测试：缺失、未知和 `standard` 返回完整能力，`codex` 关闭会话与打开菜单但保留直接 AI 工具。
2. 根组件测试或源码契约测试：Codex 页面不挂载 `AssistantPanel`，普通页面仍挂载。
3. 提示词按钮测试：Codex 页面只有复制动作，没有隐藏在下拉菜单中的执行动作；普通页面行为不变。
4. 菜单与设置测试：Codex 页面不渲染整个“打开”菜单和聊天专属设置，图片生成与直接执行配置仍存在。
5. 画布与预览事件测试：对话动作被拒绝或降级复制，直接执行动作继续运行。
6. CDP 注入测试：当前 renderer 与后续 renderer 均获得同一个入口；打开地址必须精确包含 `?surface=codex`，并继续使用 Codex 内置浏览器。
7. 官方 Codex 启动器测试：macOS 与 Windows 的候选路径、参数数组、已有 CDP target、普通实例冲突和启动等待均有覆盖。
8. 回归测试：普通根地址的会话功能、现有 Make CLI、`codex install/open/doctor/uninstall` 与 npm 发布包保持通过。
9. 浏览器冒烟：分别打开根地址和 `?surface=codex`，验证普通页存在对话入口、Codex 页不存在，并验证至少一项图片或画布直接生成入口仍可见。

## 非目标

- 不删除 Assistant/ACP 服务端模块或 API；
- 不移除直接 AI 执行能力；
- 不创建 `@axhub/make-codex` 等新 npm 包；
- 不创建独立 `/codex` 构建入口或第二套静态资源；
- 不使用 CSS 或 DOM 删除脚本来隐藏 Make 功能；CDP 注入仅用于添加 Axhub 侧边栏入口，不用于隐藏 Make 页面功能；
- 不把 `surface=codex` 当成权限或安全隔离机制；
- 不清理本次边界之外的历史 AI 文案或未显示代码。

## 验收标准

- 用户通过 Codex++ 直接启动，或通过 `codex open` 启动官方 Codex，点击 `Axhub Make` 后都在 Codex 内置浏览器打开 `?surface=codex`；
- Codex 页面没有 Make 对话面板、打开菜单、对话上下文动作或聊天执行动作；
- Codex 页面仍可看到并使用页面/画布直接执行能力以及复制提示词；
- 普通根地址的完整 Make 行为没有变化；
- 普通页面和 Codex 页面可以同时使用同一个本地服务；
- Codex++ 用户的 macOS 与 Windows 日常点击流程没有新增步骤；官方 Codex 用户只需把日常启动动作替换为 `codex open`。
