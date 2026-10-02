# 原型开发与验收指南

用于 `src/prototypes/<name>/` 下的原型实现、局部修改、多页面组织和预览验收。主题创建、派生和主题页验收优先使用 `$build-design-system`。

开发流程：

```text
读取已确认的主规格 -> 实现原型 -> 同步主规格 -> 运行验收脚本 -> 按错误信息修复 -> 重新验收
```

## 实现边界

- 规格门槛和双向同步以 `rules/requirements-alignment-guide.md` 的“原型主规格”为准。
- 主规格缺失或尚未确认时，返回需求与设计对齐阶段；需求与设计完成第一轮对齐后，再使用 `templates/prototype-spec.html` 或 `templates/prototype-spec.md` 创建或更新草案。
- 一个原型目录就是主要隔离边界，页面组件、样式和素材优先留在对应原型目录内。
- 不为单个原型随意修改 `src/common/`、全局主题或共享工具。
- 多步骤或高风险修改先拆成短任务，逐项处理并维护当前状态。
- 一次只处理一个明确问题；遇到构建、运行或验收失败，先定位原因再继续。
- 完成后必须通过预览验收；纯视觉、文案、布局和素材调整不要求测试驱动。

## 文件结构与命名

```text
src/prototypes/<name>/
├── index.tsx      # 必需
├── style.css      # 可选
├── components/    # 可选：原型内部共享组件
├── pages/         # 可选：多页面原型页面组件
├── docs/          # 可选：目录 Markdown 文档
└── assets/        # 可选：原型专属素材
```

- 原型入口文件必须是 `index.tsx`。
- 如果原型目录包含 `style.css`，`index.tsx` 必须静态引入 `./style.css`；预览环境会兼容性地自动挂载同目录样式，但导出 HTML、Axhub HTML 发布和云服务发布均以构建依赖图为准，不能依赖预览注入。
- 原型目录名使用小写字母、数字、连字符，如 `order-review`。
- 当目录名为 `untitled`、`untitled-*` 或显示名为「未命名」时，开始生成实际内容前应更新为有意义的目录名和 `@name`。
- 本项目当前不产出独立 `components` 资源；原型内部组件放在对应原型目录下的 `components/`。
- 原型目录文档放在当前原型的 `docs/` 下，例如 `src/prototypes/order-review/docs/prd-03-status.md`。
- `annotation-source.json` 的目录文档节点优先使用相对当前原型目录的 `markdownPath`，例如 `"markdownPath": "docs/prd-03-status.md"`；不要写绝对路径、`..` 或跨原型引用。
- 普通预览和 `@axhub/annotation` 阅读页不显示目录文档编辑入口；编辑 URL 由 Make 批注宿主回调生成，不写进 annotation 包或目录节点数据。
- 只有 Make 批注/编辑工具启用、且当前选中的是带安全本地 `markdownPath` 的目录 Markdown 正文子节点时，批注气泡卡片才显示“文档编辑”按钮。
- 导出/发布时会构建期内联 `markdownPath` 正文，不依赖运行时请求 `.md` 文件。

每个原型的 `index.tsx` 顶部建议包含面向用户的中文 `@name`，用于预览列表展示名：

```typescript
/**
 * @name 评审工作台
 */
```

## 多页面原型

单个原型可以包含多个页面，通过 URL hash 参数 `#page=<pageId>` 定位：

```text
/prototypes/express-app/#page=home
/prototypes/express-app/#page=detail
```

多页面仍属于同一个原型目录；页面组件放在原型内部的 `pages/`，跨页面共享组件放在原型内部的 `components/`。

使用公共 hook `src/common/useHashPage.ts`：

```typescript
import { useHashPage } from '../../common/useHashPage';

export default function MyApp() {
    const { page, setPage } = useHashPage('home');
    // page === 'home' | 'detail' | ...
}
```

- `pageId` 命名使用小写字母、数字、连字符。
- 不带 `#page=` 时自动使用 `defaultPage`。
- 此路由完全在原型内部，不影响构建。

参考实现：`src/prototypes/ref-app-home/index.tsx`。

## 依赖与样式

- React 与 Hooks 直接从 `react` 导入。
- 第三方库按需导入，新增依赖必须同步更新 `package.json`。
- 原型样式优先放在当前原型目录的 `style.css`，并由入口文件显式 `import './style.css';`，确保预览、构建、导出和发布使用同一套样式来源。
- 使用 Tailwind CSS V4 时，入口样式文件需包含：

```css
@import "tailwindcss";
```

- 使用主题 CSS Variables 时，按所选 `DESIGN.md` 和主题规则引入，不复制另一套 token。

## 验收流程

运行原型验收脚本：

```bash
node scripts/check-app-ready.mjs /prototypes/[原型目录]
```

关键返回字段：

- `status`: `READY` / `ERROR` / `TIMEOUT`。
- `serverUrl`: Make 管理服务中本次原型的验收地址。
- `targetUrl`: Vite 运行时直达地址，仅用于排查运行时问题。
- `errors`: 构建、运行时或页面加载错误列表。

页面就绪后立即向用户提供 `serverUrl`，再继续验收；管理服务尚未就绪时才使用 `targetUrl`。`/prototypes/<原型目录>` 只作为脚本参数或运行时路径。

响应式验收只检查两个代表尺寸：桌面端 `device=1440x900`，移动端 `device=393x852`；用户明确要求其他终端或尺寸时再增加。

错误处理：

- `ERROR`：按 `errors` 修复后重新执行验收脚本，直到通过。
- `TIMEOUT`：优先排查 dev server 启动、端口、长任务和运行时阻塞。
- 修复时先处理构建、启动和运行时报错，再处理交互与视觉问题；一次只修一个明确问题，修完重新验收。

## 最小清单

- [ ] `index.tsx` 完整存在。
- [ ] `index.tsx` 顶部有清晰的 `@name`。
- [ ] 占位原型已更新为有意义的目录名和显示名。
- [ ] 主规格已确认，并与当前原型保持一致。
- [ ] 新增依赖已写入 `package.json`。
- [ ] `check-app-ready.mjs` 原型验收通过。
