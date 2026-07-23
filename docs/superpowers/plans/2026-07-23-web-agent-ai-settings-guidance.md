# Web Agent AI 设置引导 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Web Agent 无法从打开菜单执行时，提示用户选择本地 AI Agent 并自动打开 AI 设置。

**Architecture:** 在 `OpenInDropdown` 内集中一个 Web Agent 配置引导回调，复用现有 `onOpenAISettings` 和 Sonner toast。两个现有通用失败分支调用同一入口，正常 ACP、CLI、本地应用和 IDE 流程不变。

**Tech Stack:** React 18.2.0、TypeScript 5.x、Sonner、Vitest 源码回归测试、pnpm workspace。

## Global Constraints

- 包管理器必须使用 pnpm。
- React 保持 18.2.0，TypeScript 保持 5.x。
- 不增加旧版本兼容逻辑或新依赖。
- 保留工作区中与本任务无关的用户改动和暂存状态。

---

### Task 1: 统一 Web Agent 失败引导

**Files:**
- Modify: `src/index/components/sidebar/OpenInDropdown.test.ts`
- Modify: `src/index/components/sidebar/OpenInDropdown.tsx:281-332`

**Interfaces:**
- Consumes: `onOpenAISettings?: () => void` 与 `toast.warning(message: string)`。
- Produces: `handleGuideToAISettings(): void`，供两个 Web Agent 兜底分支调用。

- [ ] **Step 1: 写失败测试**

在 `OpenInDropdown.test.ts` 增加源码回归测试，截取 `handleGuideToAISettings`、`handleOpenWithWebAgent` 和默认 Web 打开分支，约束统一引导入口、精确文案及两处调用：

```ts
it('opens AI settings with actionable guidance when Web Agent cannot open', () => {
  const source = readFileSync(resolve(__dirname, './OpenInDropdown.tsx'), 'utf8');
  const guideSource = source.slice(
    source.indexOf('const handleGuideToAISettings = useCallback'),
    source.indexOf('const handleOpenWithWebAgent'),
  );
  const webHandlerSource = source.slice(
    source.indexOf('const handleOpenWithWebAgent'),
    source.indexOf('const handleOpenWithImageAi'),
  );
  const defaultWebBranch = source.slice(
    source.indexOf("if (openMethod.type === 'web')"),
    source.indexOf("if (openMethod.type === 'cli')"),
  );

  expect(guideSource).toContain('onOpenAISettings?.();');
  expect(guideSource).toContain("toast.warning('请先在 AI 设置中选择本地 AI Agent');");
  expect(webHandlerSource).toContain('handleGuideToAISettings();');
  expect(defaultWebBranch).toContain('handleGuideToAISettings();');
  expect(webHandlerSource).not.toContain("toast.warning('打开 Web Agent 失败');");
  expect(defaultWebBranch).not.toContain("toast.warning('打开 Web Agent 失败');");
});
```

- [ ] **Step 2: 运行测试并确认因缺少实现而失败**

Run: `pnpm exec vitest run src/index/components/sidebar/OpenInDropdown.test.ts`

Expected: FAIL，`guideSource` 为空或两个分支缺少 `handleGuideToAISettings();`。

- [ ] **Step 3: 写最小实现**

在 `OpenInDropdown.tsx` 的 Web Agent handler 前加入统一引导，并替换两处通用 toast：

```tsx
const handleGuideToAISettings = useCallback(() => {
    onOpenAISettings?.();
    toast.warning('请先在 AI 设置中选择本地 AI Agent');
}, [onOpenAISettings]);
```

`handleOpenWithWebAgent` 的兜底分支：

```tsx
handleGuideToAISettings();
```

默认 Web 打开方式无法解析时：

```tsx
if (!storedWebOpenMethod) {
    handleGuideToAISettings();
    return;
}
```

- [ ] **Step 4: 运行针对性测试并确认通过**

Run: `pnpm exec vitest run src/index/components/sidebar/OpenInDropdown.test.ts`

Expected: PASS，0 个失败。

- [ ] **Step 5: 检查差异和空白错误**

Run: `git diff --check -- src/index/components/sidebar/OpenInDropdown.tsx src/index/components/sidebar/OpenInDropdown.test.ts`

Expected: 无输出，退出码 0；diff 只包含新增测试、统一引导回调和两处兜底替换，同时保留文件中用户已有改动。

- [ ] **Step 6: 提交实现**

```bash
git commit --only src/index/components/sidebar/OpenInDropdown.tsx src/index/components/sidebar/OpenInDropdown.test.ts -m "fix: guide Web Agent failures to AI settings"
```
