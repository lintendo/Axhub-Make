# 跨域批注 AI 执行状态同步设计

## 背景与根因

Axhub Make 管理页通过宿主工具栏执行原型批注。开发环境中的管理页运行在 `localhost:53817`，原型 iframe 运行在 `localhost:51720`，两者不同源，因此宿主无法直接读取 iframe 上的 `DevTemplateBootstrap.editors`。

当前跨域回退链路会通过 `AXHUB_PROTOTYPE_EDITOR_HOST_TOOLBAR_ACTION` 获取批注提示词，但桥接响应只包含 `promptText`，不包含 `getEditedSnapshot().modifiedElements`。宿主随后以空的 `editingTargets` 启动直接执行。ACP 请求能够正常发出，连接提示也会出现，但任务生命周期没有目标节点可更新，所以批注标记不会进入进行中、完成或失败状态。

现有测试分别覆盖了直接执行任务生命周期、节点状态渲染和同源编辑器 API 分支，没有覆盖“跨域 iframe 通过 postMessage 同时返回提示词与批注节点”的真实运行路径。

## 目标行为

- 点击顶部“AI 执行”后，当前页面所有未完成、可执行的批注节点立即进入“进行中”。
- ACP 建立任务后，节点保存正式的 provider、thread ID 和 run ID；终态继续由现有任务状态链路更新为“已完成”或“处理失败”。
- 同源直接 API、跨域 postMessage、单窗口和分屏预览使用相同的目标节点语义。
- 单节点执行仍只更新对应节点；顶部执行更新当前页面快照中的全部可执行节点。
- 不恢复旧 WebSocket bridge，不新增第二套任务状态存储，也不增加旧版本兼容分支。

## 方案决策

采用现有宿主工具栏桥接的一次往返扩展，而不是新增独立查询请求或把任务状态机下放到 iframe。

`AXHUB_PROTOTYPE_EDITOR_STATE` 响应增加可选的 `modifiedElements` 字段。iframe 在处理复制提示词或顶部 AI 执行动作时，从同一个编辑器实例读取：

1. `getCopyPromptText()` 生成的提示词。
2. `getEditedSnapshot().modifiedElements` 返回的当前可执行节点快照。

宿主收到响应后，把 `modifiedElements` 映射为现有 `AnnotationDirectRunEditingTarget`：

- `elementKey` 作为节点身份。
- `locator` 和 `label` 放入 `targetRef`，供跨域 `setNodeEditingState` 消息重新定位节点。
- `pane` 和 `iframe` 仍由宿主补齐。

同源分支继续直接读取编辑器 API；跨域分支使用桥接返回的节点。两条分支最终都进入 `runAnnotationAcpChatPrompt` 和现有 `AnnotationDirectRunRegistry`，不改变任务生命周期实现。

## 数据流

1. 用户点击顶部“AI 执行”。
2. 宿主尝试读取当前 iframe 编辑器 API；跨域时读取失败并进入 postMessage 回退。
3. iframe 在一次响应中返回 `promptText` 与 `modifiedElements`。
4. 宿主构造 prompt request 和 editing targets，并启动直接执行 registry。
5. registry 的 `started` 事件立即把所有目标节点更新为 `editing`。
6. `prepared` / `accepted` 用正式 ACP 引用刷新节点任务信息。
7. 现有终态监控将节点持久化为 `completed` 或 `error`。

提示词和节点来自同一次 iframe 响应，避免先查提示词、再查节点时批注内容发生变化造成的不一致。

## 错误处理

- 桥接超时、返回空提示词或执行入口未就绪时，维持现有反馈，不创建虚假的节点任务状态。
- 桥接有提示词但缺少 `modifiedElements` 时允许执行继续，兼容同一版本内部的暂时加载状态；同时不猜测节点身份。
- 无效或缺少 `elementKey` 的响应项在宿主映射时忽略。
- 节点状态写入继续采用 best-effort，不因单个不可定位节点阻断其他节点或 ACP 请求。
- 不把跨域通信失败伪装成 ACP 终态。

## 测试设计

先增加失败回归测试，再修改实现：

1. 桥接响应测试：验证 iframe 的顶部执行/复制提示词响应同时包含提示词和 `modifiedElements`。
2. 目标映射测试：验证宿主在没有同源 editor API 时，会使用 bridge `modifiedElements` 构造带 pane、iframe、locator 和 label 的 editing targets。
3. 空值测试：验证无效 element key 被忽略，缺失节点快照不会产生虚假目标。
4. 集成源测试：验证跨域 fallback 将桥接目标传入 `runAnnotationAcpChatPrompt`，而不是再次从不可访问的 editor API 读取空数组。
5. 回归验证：运行直接执行 manager、preview actions、dev-template bridge 相关测试，以及 `@axhub/make` 构建或类型检查。

## 修改范围

预计只修改以下 Axhub Make 文件及相邻测试：

- `src/dev-template/index.tsx`
- `src/dev-template/editorModeManager.ts`（仅在桥接读取接口类型需要补充时）
- `src/index/app/index-page/previewActions.helpers.ts`
- `src/index/app/index-page/usePrototypeEditorBridgeActions.ts`
- `src/index/app/index-page/useIndexPagePreviewActions.tsx`
- 对应的 `*.test.ts` / `*.test.tsx`

不修改 ACP API、Commentary 持久化格式、任务监控协议、原型源码或批注文案。

## 完成标准

- 在真实的 `53817` 管理页 + `51720` 原型 iframe 环境中，顶部执行后所有当前批注标记立即显示进行中状态。
- 执行完成或失败后，各节点显示对应终态。
- 同源、跨域、单节点和分屏路径的既有行为不回退。
- 相关测试、类型检查和构建通过，diff 无空白错误。
