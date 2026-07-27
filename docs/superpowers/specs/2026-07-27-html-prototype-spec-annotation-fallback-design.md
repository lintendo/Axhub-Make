# HTML 原型规格批注失败返回设计

## 背景与根因

用户从原型工具栏进入 HTML 格式的规格文档后，管理页会在规格 iframe 加载完成时自动开启批注。当前开启流程在找不到 `DevTemplateBootstrap` 或 `HtmlTemplateBootstrap`、跨域桥接超时，或编辑器启动异常时，只显示警告并返回失败。

规格控制器仍保持打开，因此中央内容继续停留在 `prototype-spec` 模式。现有的 `prototypeSpec.close()` 只挂在已成功进入批注后的退出流程上；失败后工具栏仍显示“批注”入口，用户再次点击只会重复启动失败，无法回到原型。

普通 HTML 文档也使用同一套编辑器入口，但只有原型规格页具有“进入后必须自动批注，否则返回原型”的产品约束。因此修复应由规格页调用方处理失败结果，不应让底层编辑器桥接直接改变页面导航。

## 目标行为

- 从原型进入 HTML 规格后，自动开启批注成功时维持现有规格批注体验。
- 自动开启批注失败时，保留现有 warning 或 error 提示，并立即关闭规格视图、返回原型。
- 编辑器 API 缺失、桥接超时、桥接明确失败和启动异常都视为开启失败。
- 仅当前仍在等待结果的 HTML 规格可以触发返回；过期 iframe 的异步结果不能关闭用户随后打开的其他规格页面。
- Markdown 规格、普通 Markdown/HTML 文档以及原型自身的批注行为保持不变。

## 方案决策

采用“失败结果向规格调用方返回”的方案。

`handleEnableDocEdit` 改为返回 `Promise<boolean>`：

- 没有当前文档、资源格式不支持或消息无法发送时返回 `false`。
- HTML 文档路径直接等待并返回 `enterHtmlDocumentEditor` 的结果。
- Markdown 路径在现有启用消息被接受后返回 `true`，不改变现有异步编辑器启动方式。

`handlePrototypeSpecPreviewReady` 在 HTML 规格 iframe 加载后等待该结果。结果为 `false` 且本次尝试仍对应当前规格时，调用 `prototypeSpec.close()`。现有提示继续由编辑器入口发出，返回逻辑不重复弹出第二条提示。

失败导航不会下沉到 `usePrototypeEditorBridgeActions`，避免普通 HTML 文档或其他复用该桥接的场景被强制切换页面。

## 数据流

1. 用户在原型工具栏点击“规格”。
2. 规格控制器加载 HTML 规格并切换中央内容到 `prototype-spec`。
3. 规格 iframe 完成加载，触发 `handlePrototypeSpecPreviewReady`。
4. 页面调用并等待 `handleEnableDocEdit('comment', ...)`。
5. 编辑器可用时返回 `true`，规格页继续显示并进入批注。
6. 编辑器不可用或启动失败时，现有消息 API 显示原因并返回 `false`。
7. 调用方确认失败结果仍属于当前规格后执行 `prototypeSpec.close()`，中央内容恢复所选原型。

## 异步与错误处理

- 使用递增的尝试标识或等效的当前规格校验，使较早 iframe 的迟到失败结果失效。
- 规格在等待期间已关闭或已切换时，不再执行第二次关闭。
- `enterHtmlDocumentEditor` 抛出的异常继续由现有 catch 分支转换为错误提示和 `false`。
- 底层缺失编辑器时继续保留“当前客户端页面尚未接入真正的快速编辑器”warning。
- 返回原型不依赖编辑器成功启用，因此不会再次经过当前不可用的退出批注路径。

## 测试设计

遵循 TDD，先增加会失败的回归测试，再修改实现：

1. 验证 HTML 文档分支把 `enterHtmlDocumentEditor` 的布尔结果返回给调用方，而不是丢弃。
2. 验证 HTML 规格自动开启批注返回 `false` 时调用规格关闭逻辑。
3. 验证返回 `true` 时规格保持打开。
4. 验证迟到的旧尝试失败后，不关闭更新后的当前规格。
5. 验证现有缺失编辑器 warning 仍保留，Markdown 规格仍跳过 HTML 自动开启流程。

优先沿用现有 `prototypeSpecIntegration.source.test.ts` 和 preview actions 相邻测试模式；异步是否关闭的判断若能抽成小型纯函数或请求门，则以行为测试覆盖，避免只检查字符串。

## 修改范围

预计只修改以下 Axhub Make 文件及相邻测试：

- `src/index/app/IndexPage.tsx`
- `src/index/app/index-page/useIndexPagePreviewActions.tsx`
- `src/index/app/prototypeSpecIntegration.source.test.ts`
- 必要时增加一个与规格批注尝试门相邻的单元测试文件

不修改编辑器 bridge 协议、规格文件格式、普通文档导航、Commentary 运行时或客户端原型源码。

## 完成标准

- 任意 HTML 原型规格无法启动批注时，用户看到原有提示后自动回到原型。
- 可批注的 HTML 规格仍正常停留在规格页并进入批注。
- 异步迟到结果不会关闭新的规格视图。
- Markdown 规格和普通文档行为不回退。
- 相关 Vitest、类型检查和 diff 空白检查通过。
