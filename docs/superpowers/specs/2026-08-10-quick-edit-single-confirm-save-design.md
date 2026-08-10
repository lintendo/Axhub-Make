# 快速编辑单次确认保存设计

## 状态

- 日期：2026-08-10
- 状态：设计已确认，等待书面规格复核
- 范围：Make 宿主顶部工具栏触发的原型、主题和 HTML 资源快速编辑保存

## 背景与根因

本地文本计数、替换和样式落盘接口已经恢复。当前异常发生在 Make 宿主与预览 iframe
之间的控制协议，而不是保存接口本身。

跨域预览无法直接读取 `DevTemplateBootstrap` 或 `HtmlTemplateBootstrap`，宿主会通过
`postMessage` 发送保存动作。通用消息请求当前会在 0、160、520、1200 和 2500ms
重复投递，并在 3 秒后超时。iframe 收到每一次保存动作后都会重新执行保存流程；保存流程
又必须等待用户操作确认框，因而同一次点击可能叠加多个确认框。用户未在 3 秒内完成确认时，
宿主把超时误判成“未接入快速编辑保存能力”。

分屏模式还会并行向两个 iframe 发起保存，使确认框数量进一步增加。现有
`WEB_EDITOR_DIALOG_ACK` 只确认 iframe 内部的弹窗请求已被宿主接收，不能停止外层保存动作的
重试，也不能表示保存能力已经接管。

## 目标

1. 单画面或分屏模式下，一次顶部保存操作最多出现一个确认框。
2. 分屏模式合并两个画面的修改；同一资源只进行一次预检和一次落盘。
3. 保存写操作至多执行一次，重复消息不能产生重复弹窗或重复写入。
4. 用户可以不限于 3 秒完成确认；等待和取消都不得触发“未接入”警告。
5. 保留 React 原型/主题的文本替换协议和 HTML 资源的精确定位、revision 校验协议。
6. 保存文本、保存样式和清空强制样式使用相同的单次协调边界。

## 非目标

- 不修改本地编辑 API 的路径、文件扫描边界或原子写入实现。
- 不改变 Commentary 的 DOM 编辑、撤销/重做或提示词 API。
- 不增加旧版本 bootstrap 协议兼容分支。
- 不让 Make 宿主直接跨源请求客户端 Runtime API。
- 不把不同项目、不同资源或不同 revision 的修改合并为一次保存。

## 方案比较

### 方案 A：取消重试并延长超时

改动最小，但分屏仍会分别弹窗；人工确认仍受固定超时约束，消息丢失时也没有可靠接管信号。
不采用。

### 方案 B：只保存主画面

可以只弹一次确认，但会静默忽略副画面产生的修改，不符合分屏保存预期。不采用。

### 方案 C：宿主协调 prepare / confirm / commit

每个 iframe 先返回无副作用的保存草稿，宿主合并草稿并选择一个协调 iframe 完成预检；
宿主只显示一次确认框，确认后再向协调 iframe 发送一次提交。提交按 request id 去重。
该方案同时满足单次确认、分屏合并和至多一次写入，作为本次实现方案。

## 架构

### iframe 保存适配器

`DevTemplateBootstrap.editors` 和 `HtmlTemplateBootstrap.editors` 在现有一体化保存方法之外，
增加宿主协调所需的三个职责：

1. `prepare`：读取当前编辑快照，生成不带副作用的保存草稿，不弹窗、不写文件。
2. `preflight`：对合并后的草稿执行目标校验和数量统计，不弹窗、不写文件。
3. `commit`：提交已经预检并由宿主确认的草稿，不再自行弹窗。

现有 `saveWebEditorTextChanges()`、`saveWebEditorStyleChanges()` 和
`clearWebEditorForcedStyles()` 继续供 iframe 自主调用，但内部复用同一套 prepare、preflight、
commit 能力，避免产生两套保存语义。

### 宿主保存协调器

新增聚焦的保存协调模块，职责为：

1. 收集当前有效预览 iframe 的保存草稿。
2. 按规范化资源标识验证所有草稿属于同一项目和同一资源。
3. 合并文本或样式草稿并检测冲突。
4. 选择主画面优先的一个可用 iframe 作为协调 iframe。
5. 通过协调 iframe 进行一次预检。
6. 使用 Make 的 `appDialog` 显示一次确认。
7. 确认后发送一次 commit，并根据最终结果提示成功或失败。

`useIndexPagePreviewActions` 只负责把工具栏动作交给协调器。它不再对每个 iframe 直接调用
一体化保存方法，也不再根据人工交互期间的短超时判断保存能力。

### 消息协议

跨域 iframe 使用三类明确消息：

- `AXHUB_PROTOTYPE_EDITOR_PREPARE_SAVE`：只读，可安全重试。
- `AXHUB_PROTOTYPE_EDITOR_PREFLIGHT_SAVE`：只读，可安全重试。
- `AXHUB_PROTOTYPE_EDITOR_COMMIT_SAVE`：有副作用，不使用通用定时重投。

响应使用对应的 result 类型并保留同一个 request id。commit 接收端维护有界的 in-flight /
completed request 表；相同 request id 再次到达时复用第一次执行的 Promise 或结果，不再次写入。
请求在 iframe reload 后自然失效，不跨页面持久化。

## 草稿与合并规则

### 保存文本

React 原型和主题草稿包含资源标识以及 `before` / `after` 文本对。宿主按 `before` 分组：

- 完全相同的 `before` / `after` 去重。
- 同一 `before` 对应不同 `after` 时视为冲突，停止保存并显示冲突提示。
- 合并完成后只由协调 iframe 调用一次 `/api/text-replace/count`。
- 确认后只调用一次 `/api/text-replace/replace`。

HTML 草稿包含资源标识、revision 和精确文本 key 对应的 edits：

- 相同 key、before、after 的编辑去重。
- 相同 key 出现不同 before 或 after 时视为冲突。
- 所有草稿必须具有相同 revision；revision 不一致时要求刷新，不进入确认。
- 确认后只调用一次 `/api/html-review/text-edits`。

### 保存样式

每个画面返回当前资源的强制样式文本。宿主按主画面、副画面的稳定顺序合并非空文本块，
完全相同的文本块去重。合并结果由协调 iframe 保存一次：React 原型/主题写入 `hack.css`，
HTML 资源写入 `/api/html-review/style-hack`。若同一资源的 HTML revision 不一致则停止保存。

### 清空强制样式

清空操作没有画面级 payload。宿主只验证至少一个 iframe 支持该资源的清空能力，显示一次确认，
再由协调 iframe 执行一次清空。

## 交互与状态

- prepare 阶段没有可保存内容：显示一次“当前没有可保存的修改”，不显示确认框。
- 草稿冲突或资源不一致：显示一次明确错误，不进入 preflight 或 commit。
- preflight 成功：确认框展示合并后的修改组数和实际影响数量。
- 用户取消：正常结束，保留所有编辑状态，不提示错误或“未接入”。
- commit 成功：显示一次成功提示；现有源码刷新或 iframe reload 使两个画面同步到落盘结果。
- commit 失败：显示服务端返回的明确错误，保留编辑状态，不重试写操作。
- 只有没有任何有效 iframe 能返回 prepare 能力时，才显示“未接入快速编辑保存能力”。

保存操作期间，同一工具栏动作禁用重复触发；不同保存动作也串行执行，避免文本、样式写入和
页面刷新互相打断。

## 安全与一致性

- 跨窗响应继续校验 iframe window、动态 origin、request id、目标 URL 和 iframe generation。
- prepare 返回的数据只允许提交回同一项目、资源和协调 iframe 的当前 generation。
- commit 前再次校验草稿资源标识与当前 iframe context；不信任宿主传入的任意路径。
- commit request id 去重是写操作的最后一道防线，不能仅依赖宿主按钮防抖。
- HTML 保存保留 revision 乐观锁；React 原型/主题保留 Runtime 的路径和文件类型边界。

## 测试策略

### 单元测试

- 单画面文本草稿只产生一个确认和一个 commit。
- 分屏文本草稿合并、完全重复项去重，并只确认一次。
- 同一原文被修改为不同内容时在确认前失败。
- HTML key 冲突或 revision 不一致时在确认前失败。
- 分屏样式按稳定顺序合并并去重，清空样式只提交一次。
- 用户等待超过 3 秒后确认，仍不显示“未接入”警告。
- 用户取消后没有 commit，编辑状态不被确认。
- 同一 commit request id 被重复投递时，底层写方法只调用一次。
- stale window、origin、URL 或 generation 的响应不会被接受。
- 保存进行中重复点击不会启动第二个协调流程。

### 集成测试

- React 原型文本保存只请求一次 count 和一次 replace。
- HTML 文本保存只请求一次精确编辑 API，并保留 revision 校验。
- 保存样式和清空样式分别只产生一次写请求。
- commit 失败时不确认已保存状态，也不自动重试。

### 浏览器验收

1. 单画面修改文本，等待超过 3 秒后取消，确认只有一个弹窗且没有误警告。
2. 单画面再次保存并确认，确认源码只更新一次。
3. 分屏在两个画面分别修改文本，顶部保存只出现一次汇总确认，刷新后两个画面一致。
4. 分屏制造同一原文的冲突修改，确认在写入前给出冲突提示。
5. 保存和清空样式各只出现一个确认框，按钮点击立即响应。

## 验收标准

- 一次工具栏保存动作最多出现一个确认框。
- 单画面与分屏的每个资源最多执行一次落盘请求。
- 等待或取消确认不会出现“未接入快速编辑保存能力”。
- 分屏文本和样式修改不会被静默遗漏；冲突必须在写入前被阻止。
- React 原型/主题和 HTML 资源原有保存边界、revision 校验和错误提示保持有效。
- 相关单元、集成和浏览器回归验证通过。
