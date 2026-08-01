# 键色软抠图优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在零新增依赖下，让键色透明化脚本正确清除封闭背景，并生成去键色污染的连续 alpha 边缘。

**Architecture:** 保持现有 CLI 和 PNG 工具边界，在 `key-transparent-image.mjs` 内把边缘洪泛替换为全图软键色计算。背景阈值内完全透明，背景与前景阈值之间使用 smoothstep alpha，并根据已知键色反算前景 RGB；报告继续兼容旧字段并增加软边指标。

**Tech Stack:** Node.js ESM、现有零依赖 PNG 工具、Vitest、pnpm。

## Global Constraints

- 不引入 rembg、模型、Python、ONNX 或新的 npm 依赖。
- 保持 `--input`、`--output`、`--key`、`--tolerance`、`--near-tolerance`、`--report` 兼容。
- 不修改裁切、连通组件切分、候选 manifest 或素材分流策略。
- 目标脚本与测试已有用户未提交工作；只编辑相关文件，不提交实施代码。

---

### Task 1: 建立键色软抠图回归测试

**Files:**
- Modify: `client/tests/screenshot-reconstruction-image-scripts.test.ts`
- Test: `client/tests/screenshot-reconstruction-image-scripts.test.ts`

**Interfaces:**
- Consumes: `key-transparent-image.mjs` 的现有 CLI。
- Produces: 能读取脚本输出 RGBA 像素的测试帮助函数，以及封闭背景、软边去色溢、已有 alpha、无效阈值四类行为约束。

- [ ] **Step 1: 增加测试 PNG 读取帮助函数**

在现有测试内解析脚本生成的 8-bit RGBA PNG；校验 PNG signature、IHDR `colorType === 6`、scanline `filter === 0`，返回 `{ width, height, pixels }`。

- [ ] **Step 2: 写封闭背景失败测试**

创建绿色背景和白色闭环，执行现有 CLI 后断言闭环中心 alpha 为 `0`：

```ts
expect(pixelAt(output, 3, 3)[3]).toBe(0);
```

- [ ] **Step 3: 写软边与去色溢失败测试**

输入洋红背景、`[255, 128, 255, 255]` 混合边缘和白色前景，使用默认阈值，断言混合边缘 alpha 在 `0..255` 之间，且输出绿色通道大于输入的 `128`：

```ts
expect(edge[3]).toBeGreaterThan(0);
expect(edge[3]).toBeLessThan(255);
expect(edge[1]).toBeGreaterThan(128);
```

- [ ] **Step 4: 写已有 alpha 与参数错误失败测试**

断言输入 alpha 为 `128` 的混合边缘输出 alpha 小于 `128`；断言 `--tolerance 40 --near-tolerance 40` 非零退出并包含 `greater than --tolerance`。

- [ ] **Step 5: 运行聚焦测试并确认 RED**

Run:

```bash
pnpm exec vitest run tests/screenshot-reconstruction-image-scripts.test.ts
```

Expected: 新测试因封闭背景仍不透明、边缘仍为硬 alpha、相等阈值仍被接受而失败；既有测试继续通过。

---

### Task 2: 实现全局软键色和 despill

**Files:**
- Modify: `client/.agents/skills/screenshot-to-prototype/scripts/key-transparent-image.mjs`
- Test: `client/tests/screenshot-reconstruction-image-scripts.test.ts`

**Interfaces:**
- Consumes: `readPng`、`writePng`、`colorDistance`、`findAlphaBounds` 和现有 CLI 参数。
- Produces: 全局软键色 RGBA 输出及兼容扩展后的 JSON 报告。

- [ ] **Step 1: 定义软 alpha 小函数**

```js
function smoothstep(value) {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
}
```

默认 `nearTolerance` 使用 `Math.max(tolerance + 24, 256)` 并限制到 RGB 最大距离 `441.7`；显式值必须严格大于 `tolerance`。

- [ ] **Step 2: 替换边缘洪泛为全图 matte**

每个非透明输入像素按原始 RGB 到键色的距离计算：

```js
const matteAlpha = distance <= tolerance
  ? 0
  : distance >= nearTolerance
    ? 1
    : smoothstep((distance - tolerance) / (nearTolerance - tolerance));
const outputAlpha = Math.round(inputAlpha * matteAlpha);
```

输出 alpha 为 `0` 时把 RGB 一并归零；远离键色的明确前景保持原值。

- [ ] **Step 3: 对软边反算前景 RGB**

对 `0 < matteAlpha < 1` 的像素逐通道计算并限制到 `0..255`：

```js
const foreground = (sourceChannel - (1 - matteAlpha) * keyChannel) / matteAlpha;
const outputChannel = Math.round(Math.max(0, Math.min(255, foreground)));
```

记录发生通道变化的 `despilledPixels`，以及 alpha 降低但未归零的 `softenedEdgePixels`。

- [ ] **Step 4: 扩展兼容报告**

保留 `transparentPixels`、`newlyTransparentPixels`、`residualKeyPixels`、`nearKeyOpaquePixels` 和 `quality`，增加 `translucentPixels`、`opaquePixels`、`softenedEdgePixels`、`despilledPixels`、对应比例、`hasSoftEdges` 和 `mattingMode: "global-soft-key"`。

- [ ] **Step 5: 运行聚焦测试并确认 GREEN**

Run:

```bash
pnpm exec vitest run tests/screenshot-reconstruction-image-scripts.test.ts
```

Expected: 文件内全部测试通过。

---

### Task 3: 真实样本与技能契约验证

**Files:**
- Verify: `client/.local/screenshot-to-prototype/government-app-home/asset-sheet-keyed.png`
- Verify: `client/.agents/skills/screenshot-to-prototype/scripts/key-transparent-image.mjs`
- Test: `client/tests/screenshot-to-prototype-skill.test.ts`

**Interfaces:**
- Consumes: Task 2 的 CLI 和报告。
- Produces: 不覆盖现有样本的临时抠图结果及新旧关键指标。

- [ ] **Step 1: 运行真实样本到临时目录**

使用 `mktemp -d` 创建目录，以洋红键色处理现有 asset sheet，并把 PNG 和 JSON 报告写入该目录。

- [ ] **Step 2: 验证真实样本指标**

断言输出存在半透明像素，`residualKeyPixels === 0`，搜索图标封闭中心对应的键色不再不透明；记录透明、半透明、软化边缘和去色溢数量。

- [ ] **Step 3: 运行相关测试**

Run:

```bash
pnpm exec vitest run tests/screenshot-reconstruction-image-scripts.test.ts tests/screenshot-to-prototype-skill.test.ts
```

Expected: 两个测试文件全部通过。

- [ ] **Step 4: 运行 Make client 构建**

Run:

```bash
pnpm build
```

Expected: TypeScript/Vite 构建退出码为 `0`。

- [ ] **Step 5: 检查实施差异**

运行 `git diff --check`，确认没有空白错误；只报告目标脚本、测试和本计划产生的变更，不整理其他工作区改动。
