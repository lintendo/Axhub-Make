# 设备预览批注 iframe 就绪态设计

## 目标

修复原型从桌面视图切换到手机、平板、自定义尺寸等会替换预览 iframe 的视图后，首次点击“批注”误报“当前客户端页面尚未接入真正的快速编辑器”的问题。

特殊视图中的批注能力应与桌面视图一致。若用户恰好在新 iframe 的 Runtime 加载期间点击“批注”，宿主应保留这次意图，并在当前 iframe 就绪后自动进入批注，而不是显示错误或要求用户再次点击。

## 已确认事实与根因

- 桌面预览直接渲染 iframe；手机、平板和自定义尺寸预览通过设备壳或缩放容器渲染 iframe。视图类型变化时，React 会卸载旧 iframe 并创建新 iframe，即使两者的 URL 相同。
- `quickEditRuntimeStatus` 当前只表达全局 `ready`，没有记录该状态属于哪个 iframe。
- 现有同 URL 快速路径用于同一 iframe 内的 hash 页面切换：当 URL 去除 hash 后没有变化且状态为 `ready` 时，宿主跳过新的 Runtime 握手。
- 设备切换也满足“URL 相同”，但 iframe 身份已经变化。宿主因此错误沿用旧 iframe 的 `ready` 状态，批注按钮保持可点击。
- 本地运行实例中，设备切换约 22ms 后已完成 iframe DOM 替换。此时立即点击“批注”可以稳定复现用户截图中的原始警告；稍后检查新 iframe 时 `DevTemplateBootstrap.editors.enable` 已存在，证明这是加载时序竞态，不是客户端永久缺少接入。

## 方案比较

### 方案 A：iframe 身份感知并排队用户意图（采用）

把 Runtime 就绪态绑定到具体 iframe。新 iframe 替换旧 iframe 后，即使 URL 相同也必须重新握手；加载期间的批注点击进入现有编辑器恢复队列，并在当前 iframe 发出 `runtimeReady` 后自动执行。

该方案直接修复生命周期状态建模错误，保留同一 iframe hash 切页优化，不需要修改客户端 Bootstrap 或预览布局。

### 方案 B：仅在设备切换时禁用批注按钮

设备操作触发时把全局状态改为 `pending`，等新 Runtime 就绪后重新启用。改动较小，但用户在过渡期的点击会被忽略，而且其他能替换 iframe 的路径仍可能再次暴露同类问题。

### 方案 C：设备切换时保留同一 iframe DOM

重构预览布局，只改变 iframe 外层设备壳和缩放样式。这样可避免 Runtime 重载，但会扩大 `ContentAreaView` 的布局与测量改动范围，并改变设备切换时的页面生命周期，不适合作为本次定向修复。

## 状态模型

宿主增加“最近确认就绪的 iframe”引用。`ready` 只有在下列条件同时成立时才可用于批注入口：

1. `quickEditRuntimeStatus === 'ready'`；
2. 当前主预览 iframe 存在；
3. 最近发送 `runtimeReady` 的消息来源正是当前主预览 iframe。

URL 相同不能证明 Runtime 可复用。只有 iframe 身份也相同，现有去除 hash 后 URL 相同的快速路径才成立。

iframe 的 load generation 继续用于拒绝过期的消息会话和判断新文档是否已加载；它不替代 iframe 身份，因为不同 iframe 的 generation 数值可能相同。

## 交互与数据流

### 正常设备切换

1. 用户选择手机、平板或自定义尺寸。
2. React 创建新的主预览 iframe，原有 `ready` 所属 iframe 与当前 iframe 不再一致。
3. 新 iframe 触发 `load` 后，宿主不再命中同 URL 快速路径，而是启动针对该 iframe 的 Runtime 握手，并将状态置为 `pending`。
4. 宿主只接受来自当前主 iframe 且 origin 正确的 `runtimeReady`。
5. 收到消息后，记录当前 iframe 为最近就绪 iframe并恢复 `ready`。

### 加载期间点击批注

1. 批注入口先校验 `ready` 是否属于当前 iframe，而不是只读取全局状态。
2. 若全局仍显示旧 iframe 的 `ready`，本次点击不显示“未接入编辑器”警告。
3. 宿主把当前启动参数写入既有 `pendingPrototypeEditorRestoreRef` 队列；若新 iframe 已加载则立即发起握手，否则由其 `load` 回调发起。
4. 当前 iframe 发出 `runtimeReady` 后，现有恢复流程自动调用 `enterPrototypeEditor`，进入批注状态。
5. 队列只保留最新一次进入意图，不产生重复编辑器实例。

### 同一 iframe 内 hash 切页

当 iframe 身份未变且去除 hash 后的文档 URL 未变时，继续复用已确认的 `ready` 状态，不增加重载或重复握手。

## 失败处理

- 当前 iframe 在等待期间再次被替换：旧 iframe 的消息与恢复结果必须被忽略，最新 iframe 重新接管等待队列。
- Runtime 真实缺失并超过现有握手超时：保留现有 `missing` 状态和接入提示；不得把永久缺失静默伪装成成功。
- iframe 已加载但编辑器桥仍不可用：继续使用现有严格 source/origin 校验与有限超时，最终走真实不可用提示。
- 用户退出、切换资源或编辑器上下文被重置：清除待恢复意图和就绪 iframe 引用，不能在新资源上意外打开旧批注会话。

## 实现边界

主要改动限定在 `src/index/app/index-page/useIndexPagePreviewActions.tsx`、`previewActions.helpers.ts` 及其测试。`previewActions.helpers.ts` 新增纯函数 `isQuickEditRuntimeReadyForIframe(status, readyIframe, currentIframe)`，集中表达“就绪状态是否属于当前 iframe”；iframe load 快速路径和批注入口都调用该函数，避免两处判断分叉。

复用当前已有的：

- `pendingPrototypeEditorRestoreRef` 与 `restorePendingPrototypeEditor`；
- `markPreviewIframeLoaded` / `getPreviewIframeGeneration`；
- `beginQuickEditRuntimeHandshake`；
- `runtimeReady` 的 source/origin 验证；
- `enterPrototypeEditor` 的同源 API 与跨域 bridge 路径。

本次不修改客户端模板、`DevTemplateBootstrap`、`HtmlTemplateBootstrap`、设备壳布局或编辑器协议，也不引入旧版本兼容分支。

## 测试设计

### 单元与源码回归

- 相同 `ready` 状态、相同 URL 但 iframe 不同：不得复用就绪态。
- `ready` 来源 iframe 与当前 iframe 相同：允许复用。
- 当前 iframe 不匹配时点击批注：写入待恢复意图，不调用缺失编辑器警告。
- 新 iframe load：即使文档 URL 与旧 iframe 相同也会重新握手。
- 当前 iframe `runtimeReady`：记录新 iframe并消费待恢复意图。
- 同一 iframe hash 切页：保留现有快速路径。
- 资源切换和退出：清除就绪引用与待恢复意图。

### 真实页面验证

在本地 Make 与 client Runtime 上依次验证桌面、手机、平板和自定义尺寸：

1. 每次切换后立即点击“批注”，不得出现客户端未接入警告。
2. Runtime 就绪后自动进入可点选批注/快速微调状态，不需要第二次点击。
3. 退出后再次进入正常。
4. 快速切换多个设备时，最终只对当前可见 iframe 启用编辑器。
5. 桌面视图和同一 iframe 内的页面切换没有回归。

## 验收标准

- 手机、平板、自定义尺寸等替换 iframe 的视图中，批注行为与桌面端一致。
- 设备切换与 Runtime 就绪之间的任意时刻点击批注，都不会显示错误的“未接入真正的快速编辑器”警告。
- 点击意图会在当前 iframe 就绪后自动完成，且只执行一次。
- 旧 iframe 的 `runtimeReady`、编辑器状态或桥接响应不能影响当前 iframe。
- Runtime 确实未接入时仍保留真实、可理解的失败提示。
