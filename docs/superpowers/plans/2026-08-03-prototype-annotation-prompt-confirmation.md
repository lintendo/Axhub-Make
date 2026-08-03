# Prototype Annotation Prompt Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 精简原型标注提示词，加入项目根相对入口文件，并要求 AI 在执行前只提出一次固定问题。

**Architecture:** 保持 Assistant Context 和资源路径语义不变，只在 `buildPrototypeAnnotationAcpPrompt` 的输出边界规范化入口路径。提示词把 `prototype-annotation` 技能作为技术规则唯一来源，仅保留当前资源、业务资料、一次性提问和回复口径。

**Tech Stack:** TypeScript 5.x、Vitest、pnpm。

## Global Constraints

- 保留工作区已有未提交改动，不重排或覆盖无关内容。
- 入口文件必须是项目根相对路径，并统一使用 `/`。
- 不输出用户机器的项目绝对路径。
- AI 只提问一次，不要求用户逐项确认目录内容或标注类型。
- 用户回复具体需求或“推荐生成”后直接执行，不再进行第二轮确认。

---

### Task 1: 精简标注提示词并增加一次性提问

**Files:**
- Modify: `src/index/utils/quickEditPrompts.test.ts`
- Modify: `src/index/utils/quickEditPrompts.ts`

**Interfaces:**
- Consumes: `buildPrototypeAnnotationAcpPrompt({ currentFilePath, currentFileDisplayName?, projectPath? }): string`。
- Produces: 包含显示名称、项目相对入口文件和固定提问的提示词字符串。

- [x] **Step 1: 写入失败测试**

更新标注提示词测试，使其验证：

```ts
expect(prompt).toContain('- 当前原型：首页');
expect(prompt).toContain('- 入口文件：src/prototypes/home/index.tsx');
expect(prompt).toContain('页面、Markdown 文档和外部链接目录');
expect(prompt).toContain('内容标注和状态标注');
expect(prompt).toContain('直接告诉我具体需求');
expect(prompt).toContain('回复“推荐生成”');
expect(prompt).toContain('等待用户回复');
expect(prompt.match(/？/gu)).toHaveLength(1);
expect(prompt).not.toContain('AnnotationViewer');
expect(prompt).not.toContain('currentPageId');
expect(prompt).not.toContain('稳定定位');
expect(prompt).not.toContain('/workspace/demo/project');
```

输入使用绝对 `currentFilePath` 和对应 `projectPath`，证明输出在项目边界转换为相对路径。再增加 Windows 分隔符用例，期望输出同样为 `/` 分隔的项目相对路径。

- [x] **Step 2: 运行测试并确认 RED**

```bash
pnpm exec vitest run src/index/utils/quickEditPrompts.test.ts
```

预期：标注提示词测试失败，因为当前输出没有入口文件和固定提问，且仍包含技能已覆盖的技术要求。

- [x] **Step 3: 实现入口路径规范化和精简提示词**

在 `quickEditPrompts.ts` 增加浏览器可用的字符串路径辅助函数：

```ts
function getProjectRelativeEntryPath(currentFilePath: string, projectPath?: string | null): string {
    const filePath = String(currentFilePath || '').trim().replace(/\\/g, '/');
    const rootPath = String(projectPath || '').trim().replace(/\\/g, '/').replace(/\/+$/u, '');
    if (rootPath && (filePath === rootPath || filePath.startsWith(`${rootPath}/`))) {
        return filePath.slice(rootPath.length).replace(/^\/+/, '');
    }
    if (!filePath.startsWith('/') && !/^[A-Za-z]:\//u.test(filePath)) {
        return filePath.replace(/^\.\//u, '');
    }
    const sourceIndex = filePath.indexOf('/src/');
    return sourceIndex >= 0 ? filePath.slice(sourceIndex + 1) : '';
}
```

构建器在路径为空时维持现有错误；无法得到项目相对入口文件时抛出明确错误。将提示词改为：引用技能、输出目标名称和入口文件、要求读取业务资料、嵌入设计文档中的一次性固定问题，并要求等待一次回复后直接执行。

- [x] **Step 4: 运行定向测试并确认 GREEN**

```bash
pnpm exec vitest run src/index/utils/quickEditPrompts.test.ts
```

预期：全部测试通过，无错误或警告。

- [x] **Step 5: 检查最终差异**

```bash
git diff --check
git diff -- src/index/utils/quickEditPrompts.ts src/index/utils/quickEditPrompts.test.ts
```

预期：无空白错误；实现差异仅包含相对入口路径、精简后的提示词和对应测试。
