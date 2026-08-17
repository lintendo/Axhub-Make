# 数据驾驶舱原型生成 Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增简练、可测试的数据驾驶舱原型生成 Skill。

**Architecture:** 主 Skill 只保存阶段门槛和路由入口。行业场景、技术选择与子代理交接分别放入三份 reference，并镜像到 `.agents` 与 `.claude`。

**Tech Stack:** Markdown、YAML、Vitest、Axhub Make client 现有原型规则。

## Global Constraints

- 使用 pnpm。
- React 保持 18.2.0；R3F 使用 v8。
- 图片确认前不落盘需求 Brief 或主规格。
- 用户选中图片是可见视觉事实的还原标准。
- 规格与实现使用不同的干净子代理。
- 不修改现有 `screenshot-to-prototype`。

---

### Task 1: Skill 行为契约

**Files:**
- Create: `tests/data-cockpit-prototype-skill.test.ts`

**Interfaces:**
- Consumes: `.agents/skills` 与 `.claude/skills`。
- Produces: Skill 文件、镜像、阶段顺序和关键路由的静态契约。

- [x] **Step 1: 写失败测试**

测试读取两个 Skill 目录，要求文件镜像，并断言：候选数量、图片确认前不落盘、选中图片权威、规格门槛、实现门槛、三个子代理角色，以及 ECharts、Three.js、L7、地图和 GSAP 路由。

- [x] **Step 2: 验证测试失败**

```bash
pnpm exec vitest --run tests/data-cockpit-prototype-skill.test.ts
```

Expected: FAIL，因为 Skill 目录不存在。

### Task 2: 实现 Skill 包

**Files:**
- Create: `.agents/skills/generate-data-cockpit-prototype/SKILL.md`
- Create: `.agents/skills/generate-data-cockpit-prototype/agents/openai.yaml`
- Create: `.agents/skills/generate-data-cockpit-prototype/references/industry-scenes.md`
- Create: `.agents/skills/generate-data-cockpit-prototype/references/visual-routing.md`
- Create: `.agents/skills/generate-data-cockpit-prototype/references/subagent-handoffs.md`
- Create matching files under `.claude/skills/generate-data-cockpit-prototype/`

**Interfaces:**
- Consumes: `requirements-alignment-guide.md`, `prototype-development-guide.md`, `ui-image-generation`, `explore-options`, `screenshot-to-prototype`。
- Produces: 候选图到确认图、HTML 主规格、React 原型和独立验收的编排流程。

- [x] **Step 1: 用 `init_skill.py` 初始化 `.agents` Skill**
- [x] **Step 2: 编写最小主流程和三份 reference**
- [x] **Step 3: 机械镜像到 `.claude`**
- [x] **Step 4: 运行 Task 1 测试并修到通过**

### Task 3: 验证与审查

**Files:**
- Verify: 新增 Skill、测试和文档。

**Interfaces:**
- Consumes: Task 1-2 的全部产物。
- Produces: Skill 格式、项目契约和独立审查证据。

- [x] **Step 1: 运行 Skill 格式校验**
- [x] **Step 2: 运行新增测试和 client Skill 镜像测试**
- [x] **Step 3: 检查 diff、占位符和绝对路径**
- [x] **Step 4: 使用干净子代理复测三个真实场景并完成独立审查**
