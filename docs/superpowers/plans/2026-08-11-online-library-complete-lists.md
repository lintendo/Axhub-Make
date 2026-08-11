# 原型与主题在线库完整列表实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让原型和设计空状态按每批 9 项展示完整在线资源目录，并将主题导入统一为“卡片预览 + 单一导入按钮”。

**Architecture:** 在线库接口继续一次返回完整目录，前端通过共享 Hook 管理 9 项一批的可见窗口和 `IntersectionObserver` 触底加载。原型与主题空状态复用现有 `TemplateLibraryCard`，主题抽屉删除上传与 Tabs 状态后直接展示同一类卡片；主题导入成功通过既有侧边栏资源刷新回调同步 UI。

**Tech Stack:** React 18.2.0、TypeScript 5.x、Vitest 4、Tailwind CSS、pnpm。

## Global Constraints

- 包管理器必须使用 pnpm，不使用 npm 或 yarn。
- React 保持 18.2.0，TypeScript 使用 5.x，不新增依赖。
- 原型与主题列表统一每批 9 项，滚动到底自动追加，直到完整目录全部展示。
- 主题卡片整体点击预览，卡片内只保留一个文案为“导入”的按钮。
- 不恢复客户端本地主题，不修改在线库服务端接口协议。
- 保留工作区内与本任务无关的未提交修改。

---

### Task 1: 统一的 9 项增量加载能力

**Files:**
- Create: `src/index/hooks/useProgressiveLibraryItems.ts`
- Create: `src/index/hooks/useProgressiveLibraryItems.test.ts`
- Modify: `src/index/components/dialogs/TemplateLibraryCard.tsx`
- Test: `src/index/components/dialogs/CreateDialogView.source.test.ts`

**Interfaces:**
- Produces: `ONLINE_LIBRARY_BATCH_SIZE = 9`。
- Produces: `getNextVisibleLibraryItemCount(currentCount: number, totalCount: number): number`。
- Produces: `useProgressiveLibraryItems<T>(items: readonly T[], resetKey?: string | null)`，返回 `{ visibleItems, hasMore, loadMoreRef }`。
- Produces: `TemplateLibraryCard` 的可选属性 `directImportLabel?: string`，默认值为 `直接导入`。

- [ ] **Step 1: 写增量计数失败测试**

```ts
import { describe, expect, it } from 'vitest';
import {
  ONLINE_LIBRARY_BATCH_SIZE,
  getNextVisibleLibraryItemCount,
} from './useProgressiveLibraryItems';

describe('progressive online library items', () => {
  it('uses nine items for every progressive batch', () => {
    expect(ONLINE_LIBRARY_BATCH_SIZE).toBe(9);
    expect(getNextVisibleLibraryItemCount(0, 37)).toBe(9);
    expect(getNextVisibleLibraryItemCount(9, 37)).toBe(18);
    expect(getNextVisibleLibraryItemCount(36, 37)).toBe(37);
    expect(getNextVisibleLibraryItemCount(9, 9)).toBe(9);
  });
});
```

- [ ] **Step 2: 运行测试并确认按预期失败**

Run: `pnpm exec vitest run src/index/hooks/useProgressiveLibraryItems.test.ts`

Expected: FAIL，提示 `useProgressiveLibraryItems` 模块不存在。

- [ ] **Step 3: 实现计数函数和 IntersectionObserver Hook**

```ts
import { useCallback, useEffect, useMemo, useState } from 'react';

export const ONLINE_LIBRARY_BATCH_SIZE = 9;

export function getNextVisibleLibraryItemCount(currentCount: number, totalCount: number): number {
  const safeTotal = Math.max(0, totalCount);
  if (safeTotal === 0) return 0;
  return Math.min(safeTotal, Math.max(ONLINE_LIBRARY_BATCH_SIZE, currentCount + ONLINE_LIBRARY_BATCH_SIZE));
}

export function useProgressiveLibraryItems<T>(items: readonly T[], resetKey: string | null = null) {
  const [visibleCount, setVisibleCount] = useState(ONLINE_LIBRARY_BATCH_SIZE);
  const [loadMoreElement, setLoadMoreElement] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    setVisibleCount(ONLINE_LIBRARY_BATCH_SIZE);
  }, [items, resetKey]);

  const hasMore = visibleCount < items.length;
  useEffect(() => {
    if (!hasMore || !loadMoreElement || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisibleCount((current) => getNextVisibleLibraryItemCount(current, items.length));
      }
    }, { rootMargin: '160px 0px' });
    observer.observe(loadMoreElement);
    return () => observer.disconnect();
  }, [hasMore, items.length, loadMoreElement]);

  const visibleItems = useMemo(() => items.slice(0, visibleCount), [items, visibleCount]);
  const loadMoreRef = useCallback((node: HTMLDivElement | null) => setLoadMoreElement(node), []);
  return { visibleItems, hasMore, loadMoreRef };
}
```

- [ ] **Step 4: 运行计数测试并确认通过**

Run: `pnpm exec vitest run src/index/hooks/useProgressiveLibraryItems.test.ts`

Expected: PASS，1 个测试通过。

- [ ] **Step 5: 为可配置导入文案写失败断言**

在 `CreateDialogView.source.test.ts` 的卡片测试中加入：

```ts
expect(cardSource).toContain('directImportLabel?: string;');
expect(cardSource).toContain("directImportLabel = '直接导入'");
expect(cardSource).toContain('{directImportLabel}');
```

Run: `pnpm exec vitest run src/index/components/dialogs/CreateDialogView.source.test.ts`

Expected: FAIL，缺少 `directImportLabel` 属性。

- [ ] **Step 6: 实现可配置导入文案并回归测试**

在 `TemplateLibraryCardProps` 增加 `directImportLabel?: string`，组件解构默认值设为 `直接导入`，按钮正文由固定文本改为 `{directImportLabel}`。

Run: `pnpm exec vitest run src/index/hooks/useProgressiveLibraryItems.test.ts src/index/components/dialogs/CreateDialogView.source.test.ts`

Expected: PASS，两个文件中的测试全部通过。

- [ ] **Step 7: 提交统一列表基础能力**

```bash
git add src/index/hooks/useProgressiveLibraryItems.ts src/index/hooks/useProgressiveLibraryItems.test.ts src/index/components/dialogs/TemplateLibraryCard.tsx src/index/components/dialogs/CreateDialogView.source.test.ts
git commit -m "feat: add progressive online library batches"
```

### Task 2: 原型与设计空状态完整列表

**Files:**
- Modify: `src/index/components/content/ContentAreaView.tsx`
- Modify: `src/index/components/content/ContentAreaView.source.test.ts`
- Modify: `src/index/components/content/PresentationArea.tsx`
- Modify: `src/index/types/index-page.types.ts`
- Modify: `src/index/app/hooks/useIndexPagePresentationPropsBuilder.ts`
- Modify: `src/index/app/hooks/useIndexPagePresentationPropsBuilder.test.ts`
- Modify: `src/index/app/IndexPage.tsx`

**Interfaces:**
- Consumes: `useProgressiveLibraryItems` 和 `ONLINE_LIBRARY_BATCH_SIZE`。
- Consumes: `TemplateLibraryCard.directImportLabel`。
- Produces: `onRefreshThemes?: () => void | Promise<void>`，从 `resources.refreshSidebarAssets` 贯穿到 `StartGuide`。
- Produces: 设计空状态的完整 `themeCases` 数据与 `/api/theme-library/import` 直接导入动作。

- [ ] **Step 1: 写原型完整列表失败断言**

更新 `ContentAreaView.source.test.ts`：

```ts
expect(startGuideSegment).toContain('useProgressiveLibraryItems(templateCases, activeProjectId)');
expect(startGuideSegment).toContain('{visibleTemplateCases.map(renderTemplateCaseCard)}');
expect(startGuideSegment).toContain('ref={templateCasesLoadMoreRef}');
expect(startGuideSegment).not.toContain('PLACEHOLDER_TEMPLATE_CASE_LIMIT');
expect(startGuideSegment).not.toContain('更多模板');
expect(startGuideSegment).not.toContain("initialTab: 'onlineImport'");
```

Run: `pnpm exec vitest run src/index/components/content/ContentAreaView.source.test.ts`

Expected: FAIL，仍存在固定 6 项截取和“更多模板”。

- [ ] **Step 2: 实现原型每批 9 项的完整列表**

在 `ContentAreaView.tsx` 中删除固定数量截取，让缓存和接口把完整数组写入 `templateCases`；调用 `useProgressiveLibraryItems(templateCases, activeProjectId)`；网格只映射 `visibleTemplateCases`，有下一批时渲染 `<div ref={templateCasesLoadMoreRef} aria-label="继续加载原型模板" />`；删除“更多模板”按钮及 `ExternalLink` 图标引用。

Run: `pnpm exec vitest run src/index/components/content/ContentAreaView.source.test.ts`

Expected: 与原型完整列表相关的断言通过。

- [ ] **Step 3: 写设计主题列表失败断言**

```ts
expect(startGuideSegment).toContain("const shouldShowThemeCases = kind === 'design';");
expect(startGuideSegment).toContain("fetch(withProjectScope('/api/theme-library', requireProjectScope(activeProjectId)))");
expect(startGuideSegment).toContain('useProgressiveLibraryItems(themeCases, activeProjectId)');
expect(startGuideSegment).toContain('>主题模板</h2>');
expect(startGuideSegment).toContain('{visibleThemeCases.map(renderThemeCaseCard)}');
expect(startGuideSegment).toContain('directImportLabel="导入"');
expect(startGuideSegment).not.toContain('generateThemeLibraryImportPrompt');
```

Run: `pnpm exec vitest run src/index/components/content/ContentAreaView.source.test.ts`

Expected: FAIL，设计空状态还没有主题模板区。

- [ ] **Step 4: 实现主题列表、卡片预览和直接导入**

在 `StartGuide` 中增加 `themeCases`、加载、错误和导入状态；仅在 `kind === 'design'` 时请求 `/api/theme-library` 并规范化 `designSystems`。卡片有 `previewUrl` 时新窗口预览，否则提示“该主题暂不支持在线预览”；导入 POST `/api/theme-library/import`，正文为 `{ designSystemId: theme.id }`，成功后调用 `onRefreshThemes?.()`。主题区使用三列网格、`visibleThemeCases`、`directImportLabel="导入"` 和主题加载观察点，不传任何 AI prompt action。

Run: `pnpm exec vitest run src/index/components/content/ContentAreaView.source.test.ts`

Expected: PASS，空状态相关测试全部通过。

- [ ] **Step 5: 写主题刷新回调贯穿失败测试**

在 builder 与 ContentArea 测试中加入：

```ts
expect(source).toContain('onRefreshThemes?: () => void | Promise<void>;');
expect(source).toContain('onRefreshThemes: actions.onRefreshThemes,');
expect(startGuideSegment).toContain('void onRefreshThemes?.();');
```

Run: `pnpm exec vitest run src/index/app/hooks/useIndexPagePresentationPropsBuilder.test.ts src/index/components/content/ContentAreaView.source.test.ts`

Expected: FAIL，回调尚未声明和传递。

- [ ] **Step 6: 贯穿主题导入成功刷新回调**

把 `onRefreshThemes?: () => void | Promise<void>` 加入 `PresentationAreaActions`、`PresentationAreaProps`、`ContentAreaProps` 和 `StartGuide`，由 `PresentationArea` 传给 `ContentArea`。在 `useIndexPagePresentationPropsBuilder` 输出 `onRefreshThemes: actions.onRefreshThemes`，并在 `IndexPage.tsx` 构造 actions 时传入 `resources.refreshSidebarAssets`。

Run: `pnpm exec vitest run src/index/app/hooks/useIndexPagePresentationPropsBuilder.test.ts src/index/components/content/ContentAreaView.source.test.ts`

Expected: PASS，回调贯穿与空状态测试全部通过。

- [ ] **Step 7: 提交空状态完整列表**

```bash
git add src/index/components/content/ContentAreaView.tsx src/index/components/content/ContentAreaView.source.test.ts src/index/components/content/PresentationArea.tsx src/index/types/index-page.types.ts src/index/app/hooks/useIndexPagePresentationPropsBuilder.ts src/index/app/hooks/useIndexPagePresentationPropsBuilder.test.ts src/index/app/IndexPage.tsx
git commit -m "feat: show complete prototype and theme libraries"
```

### Task 3: 设计抽屉单列表化

**Files:**
- Modify: `src/index/components/dialogs/CreateThemeDialogView.tsx`
- Modify: `src/index/components/dialogs/CreateThemeDialogView.source.test.ts`
- Modify: `src/index/components/dialogs/CreateThemeDialogContainer.tsx`
- Modify: `src/index/components/app/IndexDialogs.tsx`
- Modify: `src/index/app/IndexPage.tsx`
- Modify: `src/index/app/IndexPage.test.ts`
- Modify: `src/index/app/index-page/useIndexPageResourceActions.tsx`
- Modify: `src/index/app/index-page/useIndexPageResourceActions.test.ts`

**Interfaces:**
- Consumes: `useProgressiveLibraryItems(themeLibrary.designSystems, activeProjectId)`。
- Consumes: `TemplateLibraryCard.directImportLabel="导入"`。
- Removes: `ThemeDialogTab`、`initialThemeDialogTab`、上传状态、ZIP 上传处理和主题 AI 提示词属性。
- Retains: `resourceWriteCapabilities.themeImport`，用于无写入能力时禁用导入。

- [ ] **Step 1: 写抽屉去 Tab 与单一操作失败测试**

```ts
expect(source).not.toContain("type ThemeDialogTab = 'import' | 'onlineSelect';");
expect(source).not.toContain('<Tabs');
expect(source).not.toContain('<FileDropzone');
expect(source).not.toContain('handleThemeUpload');
expect(source).not.toContain('PromptActionButton');
expect(source).not.toContain('generateThemeLibraryImportPrompt');
expect(source).toContain('useProgressiveLibraryItems(themeLibrary.designSystems, activeProjectId)');
expect(source).toContain('directImportLabel="导入"');
expect(source).toContain('onPreview={handleThemePreviewCardClick}');
```

Run: `pnpm exec vitest run src/index/components/dialogs/CreateThemeDialogView.source.test.ts`

Expected: FAIL，抽屉仍包含 Tabs、ZIP 上传和 AI 提示词动作。

- [ ] **Step 2: 把抽屉改为直接在线列表**

删除 Tabs、FileDropzone、PromptActionButton、主题 prompt 工具及相关状态；`visible` 为真且在线库未加载时直接请求 `/api/theme-library`；标题改为“在线主题模板”。使用 `TemplateLibraryCard` 映射 `visibleDesignSystems`，卡片点击预览并使用 `directImportLabel="导入"`；无预览地址时提示“该主题暂不支持在线预览”；有下一批时显示加载观察点；导入禁用条件包含主题写入能力、条目能力和其他导入任务。

Run: `pnpm exec vitest run src/index/components/dialogs/CreateThemeDialogView.source.test.ts`

Expected: PASS，抽屉源码测试全部通过。

- [ ] **Step 3: 写初始 Tab 状态清理失败测试**

更新 `useIndexPageResourceActions.test.ts` 与 `IndexPage.test.ts`：

```ts
expect(source).not.toContain('initialThemeDialogTab');
expect(source).not.toContain('setInitialThemeDialogTab');
```

Run: `pnpm exec vitest run src/index/app/index-page/useIndexPageResourceActions.test.ts src/index/app/IndexPage.test.ts`

Expected: FAIL，状态仍从资源 actions 贯穿到抽屉。

- [ ] **Step 4: 清理不再使用的抽屉属性与状态**

从 `useIndexPageResourceActions.tsx` 删除 `initialThemeDialogTab` 状态及重置调用；从 `IndexPage.tsx`、`IndexDialogs.tsx`、`CreateThemeDialogContainer.tsx` 删除 `initialTab`、主题 prompt client、IDE、assistant 与 `onAfterCreatePromptAction` 传递。保留 `resourceWriteCapabilities`、`onClose`、`onImportSuccess` 和 `activeProjectId`。

Run: `pnpm exec vitest run src/index/app/index-page/useIndexPageResourceActions.test.ts src/index/app/IndexPage.test.ts src/index/components/dialogs/CreateThemeDialogView.source.test.ts`

Expected: PASS，三个测试文件全部通过。

- [ ] **Step 5: 运行相关前端测试和类型构建**

Run:

```bash
pnpm exec vitest run \
  src/index/hooks/useProgressiveLibraryItems.test.ts \
  src/index/components/dialogs/CreateDialogView.source.test.ts \
  src/index/components/dialogs/CreateThemeDialogView.source.test.ts \
  src/index/components/content/ContentAreaView.source.test.ts \
  src/index/app/hooks/useIndexPagePresentationPropsBuilder.test.ts \
  src/index/app/index-page/useIndexPageResourceActions.test.ts \
  src/index/app/IndexPage.test.ts
pnpm admin:build
```

Expected: 所列 Vitest 文件全部 PASS；`pnpm admin:build` 退出码为 0。

- [ ] **Step 6: 提交抽屉简化**

```bash
git add src/index/components/dialogs/CreateThemeDialogView.tsx src/index/components/dialogs/CreateThemeDialogView.source.test.ts src/index/components/dialogs/CreateThemeDialogContainer.tsx src/index/components/app/IndexDialogs.tsx src/index/app/IndexPage.tsx src/index/app/IndexPage.test.ts src/index/app/index-page/useIndexPageResourceActions.tsx src/index/app/index-page/useIndexPageResourceActions.test.ts
git commit -m "feat: simplify online theme import drawer"
```

### Task 4: 最终差异与浏览器验证

**Files:**
- Verify only: 本计划涉及的所有文件。

**Interfaces:**
- Consumes: Tasks 1–3 的完整实现。
- Produces: 可交付的测试、构建与浏览器验证证据。

- [ ] **Step 1: 检查精确差异与空白错误**

Run:

```bash
git diff --check HEAD~3..HEAD
git status --short
```

Expected: `git diff --check` 无输出；状态中不出现本任务遗漏的未提交文件。

- [ ] **Step 2: 启动完整 Make 开发服务**

Run: `pnpm server:dev -- --host 127.0.0.1 --no-open`

Expected: 服务启动并输出管理页面地址；不单独启动 Vite。

- [ ] **Step 3: 浏览器验证关键交互**

使用 Browser Automation 连接管理页面并验证：原型和设计空状态首批各显示 9 张卡、触底追加到 18 张；主题卡点击预览且导入按钮不触发预览；设计抽屉无 Tab、ZIP 上传和 AI 提示词按钮，并能继续加载。

Expected: 关键交互全部符合设计；控制台没有本次改动引入的错误。

- [ ] **Step 4: 记录验证结论**

在最终回复中列出测试命令、构建结果、浏览器验证结果和仍需人工环境确认的限制，不修改仓库文档。
