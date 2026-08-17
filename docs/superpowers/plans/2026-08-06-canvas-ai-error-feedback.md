# 画布 AI 接口错误反馈实施计划

> 本计划在当前工作区直接执行，保留用户已有改动，不创建提交。

## 任务 1：锁定错误反馈契约

**文件：**

- 修改：`src/index/domains/ai-generation/CanvasAiGenerationTool.source.test.ts`

1. 新增源码契约测试，要求组件具备本地错误状态和统一错误上报函数。
2. 要求新任务清除旧错误，失败同时写入局部提示和全局 toast。
3. 要求局部提示具有 `role="alert"` 和可关闭按钮。
4. 运行定向测试并确认测试因功能尚未实现而失败。

## 任务 2：实现局部错误反馈

**文件：**

- 修改：`src/index/domains/ai-generation/CanvasAiGenerationTool.tsx`

1. 增加 `canvasViewportError` 状态与统一上报函数。
2. 将视口未就绪、异步执行失败和捕获异常接入统一上报。
3. 在新任务开始前清除旧错误，不改变 warning 与取消语义。
4. 在入口上方渲染最多两行的可关闭 alert；保持按钮恢复后可直接重试。

## 任务 3：验证

1. 运行 `CanvasAiGenerationTool.source.test.ts` 定向测试。
2. 运行所属 workspace 的 TypeScript 检查或等价构建检查。
3. 检查目标文件 diff，确认没有覆盖无关改动，且错误信息不展示堆栈。
