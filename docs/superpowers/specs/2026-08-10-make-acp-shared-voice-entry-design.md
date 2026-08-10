# Make 与 ACP 共享语音入口设计

## 目标

Axhub Make 的批注语音助手默认不显示，只能由用户在批注工具栏的“更多”菜单中显式显示。显示后的语音控件、连接状态、启动/中断交互、缺少配置时的阻断和提示统一由本地 `@axhub/acp` 组件实现，Make 不再定义独立语音面板或复制 ACP 的交互状态机。

## 当前问题

- Make 在进入 Commentary Quick Edit 后始终挂载 `MakeVoiceAssistant` 入口，未提供默认隐藏状态或“更多”菜单开关。
- ACP 对外的 `MakeVoiceAssistant` 仍是独立的 launcher + conversation panel；ACP 首页实际使用的是 `HomeLiveKitVoiceAgent`、官方 assistant-ui `VoiceOrb`、连接反馈和配置前置检查，两者已经分叉。
- Make 新增的全局语音配置当前只由设置页保存，现有语音入口点击时不会检查豆包基础配置，因此缺少 App ID 或 Access Key 时仍会尝试启动。

## 方案

采用 ACP 共享 surface 方案。

ACP 抽取一套语音控件 surface，作为 ACP 首页语音入口和 Make 对外语音组件的共同视图与交互实现。该 surface 统一负责：

- 渲染 ACP 当前使用的 assistant-ui `VoiceOrb` 和状态反馈。
- 处理开始、连接中、监听、播报、打断、断开和错误状态。
- 在首次启动前执行异步配置检查。
- 配置不完整或读取失败时阻止连接，并请求宿主打开设置。
- 组件卸载时停止监听、断开连接并清理订阅。

`@axhub/acp/voice` 继续提供完整的 Make 语音组件和类型入口。Make 只注入已有的 conversation bridge、speech adapter、工具注册、prompt，以及两个宿主能力：读取脱敏后的配置状态和打开 Make 设置。Make 不渲染麦克风按钮、转写面板、状态提示、配置提示或确认对话框。

不直接把 `HomeLiveKitVoiceAgent` 原样导入 Make。该组件绑定 ACP 自己的 LiveKit session、配置 API、workspace 和工具集合，直接复用会绕开 Make 现有的九个 Commentary 工具、批注持久化和任务事实源。

## Make 菜单与可见性

Make 的批注“更多”菜单增加语音助手显隐项：

- 未显示时文案为“显示语音助手”。
- 已显示时文案为“隐藏语音助手”。
- 每次新进入 Quick Edit 或批注会话时初始值为隐藏。
- 退出批注、切换离开有效预览或关闭该菜单项时立即卸载 ACP 语音组件。
- 不把显隐状态写入全局设置或本地持久化，避免下次进入批注时自动恢复为显示。

该菜单只控制 ACP 组件是否挂载，不实现语音组件内部交互。

## 配置检查与设置引导

启动所需的豆包基础配置与 ACP 当前规则保持一致：App ID 非空且 Access Key 已配置。Make 通过现有项目作用域接口 `GET /api/config/voice-assistant` 读取脱敏配置，只使用 `doubao.appId` 和 `doubao.hasAccessKey` 判断状态，不接触真实密钥。

点击 ACP 语音组件时的数据流为：

1. ACP 组件进入“正在检查语音配置”状态。
2. ACP 调用 Make 注入的异步配置检查能力。
3. 配置完整时，ACP 才继续连接 speech/session，并沿用 Make 注入的 bridge、tools 和 prompt。
4. 配置缺失时，ACP 不连接、不创建临时会话，并调用宿主的打开设置能力。
5. Make 打开现有“设置 > AI”，复用现有豆包语音配置区域，不增加新的 UI 面板。
6. 配置读取失败时采用同一阻断路径，并由 ACP 显示可恢复的提示。

保存设置后不自动启动语音。用户关闭设置并再次点击语音入口时重新检查配置。

## 组件边界

### ACP

- 共享语音 surface、VoiceOrb、状态文案、配置检查时机和所有点击行为。
- 将 ACP 首页适配器和 Make session 适配器映射到同一 surface 状态与动作契约。
- 通过 `@axhub/acp/voice` 导出 Make 可直接消费的完整组件及配置检查相关类型。
- 保持 conversation、speech、tool 和 prompt 的宿主注入契约，不在 Make 集成路径中创建第二套 ACP session 或 task store。

### Make

- 在批注“更多”菜单维护非持久化的显示/隐藏状态。
- 提供脱敏配置检查函数和打开现有 AI 设置的回调。
- 继续提供现有 Make bridge、speech adapter、九个工具和 prompt。
- 只决定组件的产品位置和生命周期，不实现语音 UI 或交互状态。

## 错误与清理

- 配置缺失和配置读取失败都必须在连接前终止，不允许先申请麦克风权限或创建会话。
- ACP 组件负责展示检查中、连接中和错误反馈；Make 不重复弹出新的提示面板。
- 隐藏入口、退出 Quick Edit、切换资源或卸载页面时，ACP 必须中断当前播报/监听并释放订阅。
- 设置回调失败时组件保持未连接状态，用户可再次点击重试。

## 测试

ACP 回归覆盖：

- ACP 首页和 Make 对外组件使用同一共享语音 surface 与 `VoiceOrb`。
- 配置完整前不会调用 connect 或创建会话。
- 配置缺失和读取失败会请求打开设置，并保持 idle/disconnected。
- 隐藏或卸载会执行断开和清理。
- `@axhub/acp/voice` 的构建产物和声明文件包含新的共享契约。

Make 回归覆盖：

- 进入 Quick Edit 时语音组件默认不挂载。
- “更多”菜单可以显示和隐藏语音助手，并反映当前状态。
- 退出批注或切换离开有效预览后恢复为隐藏。
- 配置检查只读取脱敏接口，App ID 或 Access Key 缺失时返回未就绪。
- 设置引导打开现有 AI 设置，不创建新的设置面板。
- Make wrapper 不包含麦克风、VoiceOrb、转写、连接或错误状态 UI。

## 非目标

- 不改变 Make 的九个语音工具、批注持久化、任务生命周期或 direct-run 行为。
- 不让 Make 读取 ACP 自己的 `voice-settings.json`。
- 不新增语音配置面板、独立弹窗或另一套语音状态机。
- 不自动显示、自动连接或在保存配置后自动启动语音助手。
- 不直接复用 ACP 首页的 workspace、LiveKit session 或内部工具集合。

## 备选方案

1. 直接导出 `HomeLiveKitVoiceAgent`。拒绝，因为它绑定 ACP 自己的服务和工具生命周期。
2. 只导出 `VoiceOrb`，由 Make 实现交互。拒绝，因为会继续形成两套状态机。
3. 继续维护 Make 专用 conversation panel。拒绝，因为与 ACP 当前组件不一致，且用户明确要求不新增或维护独立 UI 面板。
