# Design Knowledge 主题目录统一实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让设计页从同一份 Design Knowledge Manifest 完整展示 PC 端 123 条和移动端 100 条主题，并把设计侧栏空状态替换成单句创建引导。

**Architecture:** 新增一个与 HTTP 路由解耦的服务端目录读取器，固定读取官方 Manifest，校验 reader 版本、平台索引 URL、数量和 SHA-256 后缓存并映射为轻量卡片 DTO。`managementApi.themeLibrary.ts` 只处理平台参数、项目能力和安全主题包导入；设计空状态页按平台懒加载完整数组，并复用现有每批 9 项的前端增量窗口。

**Tech Stack:** React 18.2.0、TypeScript 5.x、Node.js fetch/crypto/zlib、Vitest 4、Tailwind CSS、pnpm。

## Global Constraints

- 包管理器必须使用 pnpm，不使用 npm 或 yarn。
- React 保持 18.2.0，TypeScript 使用 5.x，不新增依赖。
- 生产代码只读取 `https://lintendo.github.io/Make-Template/knowledge/latest/manifest.json`，前端和请求正文不能提供 Manifest、索引或包 URL。
- 平台只允许 `desktop` 和 `mobile`；数量来自在线索引，不硬编码 123/100。
- 每个平台首批 9 项，滚动触底每次追加 9 项；点击卡片预览，卡片内只保留“导入”按钮。
- `publishable=false` 或缺少 `packageUrl + packageHash` 的记录必须禁用导入。
- 不恢复本地主题列表回退，不恢复主题抽屉入口，不修改原型模板目录协议。
- 设计侧栏真正为空且无搜索词时只显示一句 `创建设计规范，统一原型的视觉与文案风格`，不分标题说明，不增加点击。
- 目标前端文件已有用户未提交改动；实现必须在当前文件上做窄修改，不覆盖、重排或提交无关改动。

---

### Task 1: 可验证的 Design Knowledge 目录读取器

**Files:**
- Create: `src/server/designKnowledgeThemeCatalog.ts`
- Create: `src/server/__tests__/designKnowledgeThemeCatalog.test.ts`

**Interfaces:**
- Produces: `type ThemeCatalogPlatform = 'desktop' | 'mobile'`。
- Produces: `interface ThemeCatalogItem { id; slug; title; platform; description; tags; previewUrl; coverUrl?; canDirectImport; directImportDisabledReason? }`。
- Produces: `createDesignKnowledgeThemeCatalog(options?)`，返回 `{ load(platform), downloadPackage(record) }`。
- Produces: `validateThemePackageArchive(bytes)`，拒绝不安全 tar 内容。

- [ ] **Step 1: 写目录契约失败测试**

在新测试文件构造最小 Manifest、desktop/mobile 索引，并按原始 JSON 字节计算 `sha256:`。断言：

```ts
const catalog = createDesignKnowledgeThemeCatalog({ fetch: fixtureFetch, now: () => 1_000 });
const result = await catalog.load('desktop');
expect(result).toMatchObject({ platform: 'desktop', total: 2, stale: false });
expect(result.designSystems).toEqual([
  expect.objectContaining({
    id: 'alpha',
    platform: 'desktop',
    previewUrl: `${BASE}/versions/v1/previews/alpha/index.html`,
    canDirectImport: false,
    directImportDisabledReason: '主题包尚未开放导入',
  }),
  expect.objectContaining({ id: 'no-cover', coverUrl: undefined }),
]);
expect(JSON.stringify(result)).not.toContain('"text"');
expect(JSON.stringify(result)).not.toContain('"tokens"');
expect(JSON.stringify(result)).not.toContain('packageUrl');
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm exec vitest run src/server/__tests__/designKnowledgeThemeCatalog.test.ts`

Expected: FAIL，提示 `designKnowledgeThemeCatalog` 模块不存在。

- [ ] **Step 3: 实现最小目录读取器**

实现固定常量和工厂：

```ts
export const DESIGN_KNOWLEDGE_MANIFEST_URL =
  'https://lintendo.github.io/Make-Template/knowledge/latest/manifest.json';
export const DESIGN_KNOWLEDGE_READER_VERSION = '1.0.0';
export const THEME_CATALOG_CACHE_TTL_MS = 5 * 60 * 1000;
export type ThemeCatalogPlatform = 'desktop' | 'mobile';

export function createDesignKnowledgeThemeCatalog(options: {
  fetch?: typeof globalThis.fetch;
  now?: () => number;
  manifestUrl?: string;
} = {}) {
  return {
    load: (platform: ThemeCatalogPlatform) => loadPlatform(platform),
    downloadPackage: (record: ThemeCatalogRecord) => downloadVerifiedPackage(record),
  };
}
```

读取 Manifest 和索引时以 1 MiB/20 MiB 为上限，验证：精确版本字段、reader `1.0.0` 落在范围内、官方 HTTPS origin/base path、descriptor hash/count、索引 platform、重复 ID、`searchable=true`、记录平台和 preview URL。描述由 industries/productTypes/styles 每类最多 2 项组成；无标注时使用最多 3 个 tags。

- [ ] **Step 4: 写校验和 stale 缓存失败测试**

增加用例：非法 platform、reader 不兼容、索引 hash 不匹配、count 不匹配、重复 ID、越出官方路径 URL 均拒绝；成功加载后远程失败则返回同一批数据且 `stale=true`；相同并发请求只发起一组 fetch。

```ts
await expect(catalog.load('desktop')).rejects.toMatchObject({ code: 'THEME_LIBRARY_SCHEMA_INVALID' });
expect((await warmedCatalog.load('desktop')).stale).toBe(false);
remoteFails = true;
advanceBy(THEME_CATALOG_CACHE_TTL_MS + 1);
expect((await warmedCatalog.load('desktop')).stale).toBe(true);
```

- [ ] **Step 5: 实现缓存、错误码和包校验**

缓存只写入验证成功的数据，key 为 platform，刷新时复用 in-flight Promise。下载 package 时要求 `publishable=true`、合法 `packageUrl` 和 `sha256:` `packageHash`，下载上限 100 MiB，hash 必须一致；`validateThemePackageArchive` 使用 `gunzipSync(..., { maxOutputLength: 250 * 1024 * 1024 })` 解析 tar header，只接受普通文件和目录，拒绝绝对路径、盘符、`.`/`..`、链接和重复路径。

- [ ] **Step 6: 运行读取器测试**

Run: `pnpm exec vitest run src/server/__tests__/designKnowledgeThemeCatalog.test.ts`

Expected: PASS，目录、缓存、hash、URL 和包安全用例全部通过。

### Task 2: 主题列表与导入 API 切换到统一目录

**Files:**
- Modify: `src/server/managementApi.themeLibrary.ts`
- Replace tests in: `src/server/__tests__/projects-theme-library-api.test.ts`

**Interfaces:**
- Consumes: `createDesignKnowledgeThemeCatalog()`。
- Produces: `GET /api/theme-library?platform=desktop|mobile`。
- Produces: `POST /api/theme-library/import` body `{ themeId: string; platform: ThemeCatalogPlatform }`。

- [ ] **Step 1: 把旧 GitHub/local-index 用例改成新 API 失败用例**

fixture fetch 只接受 Manifest、descriptor index URL 和可选 package URL。列表断言：

```ts
const listed = await fetchJson(`${scopedUrl}&platform=mobile`);
expect(listed).toMatchObject({
  status: 200,
  body: { schemaVersion: 1, platform: 'mobile', total: 1, stale: false },
});
expect(listed.body.designSystems[0]).toMatchObject({ id: 'alpha-mobile', platform: 'mobile' });
expect(remoteRequests).not.toContain(expect.stringContaining('design-systems.json'));
```

增加非法 platform 400、远程冷失败 502、不可发布导入 409、旧 `designSystemId` 400、客户端伪造 URL 不参与下载的用例。

- [ ] **Step 2: 运行 API 测试并确认失败**

Run: `pnpm exec vitest run src/server/__tests__/projects-theme-library-api.test.ts`

Expected: FAIL，当前接口仍返回旧 source/61 条结构并接受 `designSystemId`。

- [ ] **Step 3: 把列表路由改为平台读取**

删除 `THEME_LIBRARY_REPO`、`design-systems.json`、本地目录探测、GitHub branch 和旧 index validator。路由从 `req.url` 解析 platform，调用共享 catalog：

```ts
const platform = parseThemeCatalogPlatform(req.url);
if (!platform) {
  sendThemeLibraryError(res, 400, 'THEME_LIBRARY_PLATFORM_INVALID', 'platform must be desktop or mobile');
  return;
}
const result = await themeCatalog.load(platform);
sendJson(res, { schemaVersion: 1, ...result });
```

缺少 query 时使用 `desktop`。

- [ ] **Step 4: 把导入改为 themeId + platform**

先创建项目上下文并验证写入能力，再校验正文：

```ts
const themeId = typeof body?.themeId === 'string' ? body.themeId.trim() : '';
const platform = parseThemeCatalogPlatformValue(body?.platform);
if (!themeId || !platform) return send 400;
const loaded = await themeCatalog.load(platform);
const record = loaded.records.find((item) => item.id === themeId);
if (!record) return send 404;
if (!record.canDirectImport) return send 409 THEME_LIBRARY_NOT_IMPORTABLE;
const archive = await themeCatalog.downloadPackage(record);
```

把验证后的 `.tgz` 写入项目临时目录，用现有 `runLocalCommand('tar', ['-xzf', ...])` 解压，再确认包根包含 `index.tsx`；复制到声明的 themes 目录、写资源元数据，失败时删除临时目录和新目标目录。响应字段改为 `themeId`，不再返回 `designSystemId`。

- [ ] **Step 5: 运行 API 测试和服务端类型检查**

Run:

```bash
pnpm exec vitest run src/server/__tests__/designKnowledgeThemeCatalog.test.ts src/server/__tests__/projects-theme-library-api.test.ts
pnpm server:build
```

Expected: 两个测试文件全部 PASS；TypeScript 退出码 0。

### Task 3: 设计页平台分类与完整卡片

**Files:**
- Modify: `src/index/components/content/ContentAreaView.tsx`
- Modify: `src/index/components/content/ContentAreaView.source.test.ts`
- Modify: `src/index/components/dialogs/TemplateLibraryCard.tsx`
- Modify: `src/index/components/dialogs/CreateDialogView.source.test.ts`

**Interfaces:**
- Consumes: list DTO 的 `platform/total/stale/designSystems`。
- Consumes: `useProgressiveLibraryItems(items, resetKey)`。
- Produces: `ThemeCatalogPlatform` 前端联合类型和按平台缓存状态。

- [ ] **Step 1: 写平台分类失败断言**

在 ContentArea 源码测试中断言：

```ts
expect(startGuideSegment).toContain("type ThemeCatalogPlatform = 'desktop' | 'mobile';");
expect(startGuideSegment).toContain("const [activeThemePlatform, setActiveThemePlatform] = useState<ThemeCatalogPlatform>('desktop');");
expect(startGuideSegment).toContain("platform=${activeThemePlatform}");
expect(startGuideSegment).toContain("activeThemePlatform === 'desktop' ? 'PC 端' : '移动端'");
expect(startGuideSegment).toContain('useProgressiveLibraryItems(activeThemeCatalog.items, `${activeProjectId || \'\'}:${activeThemePlatform}`)');
expect(startGuideSegment).toContain('body: JSON.stringify({ themeId: theme.id, platform: activeThemePlatform })');
expect(startGuideSegment).not.toContain('designSystemId: theme.id');
```

- [ ] **Step 2: 写无封面可见占位失败断言**

更新卡片源码测试：`coverUrl` 和 `sourcePath` 允许缺省；图片缺失或加载失败时必须渲染文字“暂无封面”，不再是静默空灰块。

```ts
expect(cardSource).toContain("<span className=\"text-[12px] text-muted-foreground\">暂无封面</span>");
expect(cardSource).toContain('sourcePath?: string;');
expect(cardSource).toContain('coverUrl?: string;');
```

- [ ] **Step 3: 运行前端测试并确认失败**

Run: `pnpm exec vitest run src/index/components/content/ContentAreaView.source.test.ts src/index/components/dialogs/CreateDialogView.source.test.ts`

Expected: FAIL，尚无平台状态、query、计数和文字占位。

- [ ] **Step 4: 实现平台目录状态和请求**

把单一 `themeCases` 改为 `Record<ThemeCatalogPlatform, { items; total; stale; loaded; loading; error }>`。首次进入只加载 desktop，切换未加载平台时请求：

```ts
fetch(withProjectScope(`/api/theme-library?platform=${activeThemePlatform}`, requireProjectScope(activeProjectId)))
```

成功后只更新对应平台；失败时保留另一平台和当前平台旧 items。传给增量 Hook 的 reset key 包含项目和平台。平台按钮使用现有 Button 的 ghost/secondary 状态，不引入新组件或依赖；标签展示响应 total。切换时 `themeSectionRef.current?.scrollIntoView({ block: 'start' })`。

- [ ] **Step 5: 实现卡片映射、预览和导入**

为主题 DTO 使用独立 normalizer，不再要求旧 `sourcePath/coverUrl`。把平台显示名作为卡片 `metaLabel`，导入正文改为 `{ themeId, platform }`。卡片保持整体点击预览，按钮阻止冒泡；`canDirectImport=false` 时按钮禁用并直接显示服务端原因。`stale=true` 时标题旁显示“正在使用已缓存目录”。

- [ ] **Step 6: 实现缺封面文字占位**

`TemplateLibraryCardItem` 增加 `metaLabel?: string`，并把 `sourcePath`、`coverUrl` 改为可选。元信息优先 `author`，其次 `metaLabel`，最后 `sourcePath`；封面区域在图片不可用时居中显示“暂无封面”。原型模板卡行为不变。

- [ ] **Step 7: 运行前端相关测试**

Run:

```bash
pnpm exec vitest run \
  src/index/hooks/useProgressiveLibraryItems.test.ts \
  src/index/components/content/ContentAreaView.source.test.ts \
  src/index/components/dialogs/CreateDialogView.source.test.ts
```

Expected: 全部 PASS，包含平台切换、9 项窗口、单一导入和封面占位断言。

### Task 4: 设计侧栏单句空状态

**Files:**
- Modify: `src/index/components/sidebar/ContentPanel.tsx`
- Modify: `src/index/components/sidebar/ContentPanel.source.test.ts`

**Interfaces:**
- Consumes: 已有 `dataTab`、`displayTree`、`searchText`。
- Produces: 只针对 `dataTab === 'themes' && !searchText.trim()` 的单句占位。

- [ ] **Step 1: 写失败测试**

```ts
it('uses one concise design creation sentence only for a truly empty theme tree', () => {
  const emptySource = getRenderTreeContentSource();
  expect(emptySource).toContain("if (dataTab === 'themes' && !searchText.trim())");
  expect(emptySource).toContain('创建设计规范，统一原型的视觉与文案风格');
  expect(emptySource).not.toContain('创建设计规范</');
  expect(emptySource).not.toContain('统一原型的视觉与文案风格</');
});
```

- [ ] **Step 2: 运行并确认失败**

Run: `pnpm exec vitest run src/index/components/sidebar/ContentPanel.source.test.ts`

Expected: FAIL，设计树仍显示“暂无内容”。

- [ ] **Step 3: 实现单句条件分支**

在 docs 空状态分支之后、通用“暂无内容”之前增加：

```tsx
if (dataTab === 'themes' && !searchText.trim()) {
  return (
    <div className="px-4 py-8 text-center text-[12px] leading-5 text-muted-foreground">
      创建设计规范，统一原型的视觉与文案风格
    </div>
  );
}
```

不加 role、onClick、标题元素或第二行。

- [ ] **Step 4: 运行侧栏测试**

Run: `pnpm exec vitest run src/index/components/sidebar/ContentPanel.source.test.ts`

Expected: PASS，原型/资源/搜索无结果仍走既有分支。

### Task 5: 综合验证

**Files:**
- Verify: Tasks 1–4 所有文件。

**Interfaces:**
- Produces: 自动化、构建和浏览器验收证据。

- [ ] **Step 1: 运行聚焦测试与构建**

Run:

```bash
pnpm exec vitest run \
  src/server/__tests__/designKnowledgeThemeCatalog.test.ts \
  src/server/__tests__/projects-theme-library-api.test.ts \
  src/index/hooks/useProgressiveLibraryItems.test.ts \
  src/index/components/content/ContentAreaView.source.test.ts \
  src/index/components/dialogs/CreateDialogView.source.test.ts \
  src/index/components/sidebar/ContentPanel.source.test.ts
pnpm server:build
pnpm admin:build
```

Expected: 所有测试 PASS；两个构建退出码均为 0。

- [ ] **Step 2: 检查当前线上目录证据**

Run 一个只读 Node 脚本取得官方 Manifest 及两个索引，按 descriptor hash 验证后输出 count、preview、cover、publishable/package 数。

Expected: desktop 123、mobile 100、preview 223、cover 219、publishable 0、package 0。

- [ ] **Step 3: 启动完整开发服务并浏览器验证**

Run: `pnpm server:dev -- --host 127.0.0.1 --no-open`

验证：设计侧栏为空时只有目标单句；设计页默认 PC 端显示 9 张、滚动后 18 张；移动端切换显示 9 张、滚动后 18 张；无封面记录保留卡片；点击卡片打开预览；当前所有导入按钮禁用；网络面板中前端不直接请求 Manifest/index。

- [ ] **Step 4: 精确检查差异**

Run:

```bash
git diff --check
git status --short -- \
  src/server/designKnowledgeThemeCatalog.ts \
  src/server/__tests__/designKnowledgeThemeCatalog.test.ts \
  src/server/managementApi.themeLibrary.ts \
  src/server/__tests__/projects-theme-library-api.test.ts \
  src/index/components/content/ContentAreaView.tsx \
  src/index/components/content/ContentAreaView.source.test.ts \
  src/index/components/dialogs/TemplateLibraryCard.tsx \
  src/index/components/dialogs/CreateDialogView.source.test.ts \
  src/index/components/sidebar/ContentPanel.tsx \
  src/index/components/sidebar/ContentPanel.source.test.ts
```

Expected: `git diff --check` 无输出；只报告计划内文件，且没有覆盖用户无关改动。
