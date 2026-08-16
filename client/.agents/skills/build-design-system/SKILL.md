---
name: build-design-system
description: Use when an Axhub Make client task explicitly asks to create, update, import, extract, derive, or reconstruct a 主题/theme, 设计系统/design system, 视觉规范/visual specification, DESIGN.md, design tokens, or reusable theme assets from webpages, Axure resources, Figma designs, screenshots, prototypes, or existing theme files; not when selecting an existing design system or theme, which uses $search-design-system.
---

# 构建设计系统

把产品要求和设计来源整理成可追溯的 Axhub Make 主题，并在同一次执行中完成规划、主题产物和验收。`DESIGN.md` 始终是视觉事实源；`SOURCES.md` 只保存来源证据，`PLAN.md` 只保存任务和状态。

如果只是从当前项目本地候选或 Design Knowledge 主题库候选中选择已有设计基底，停止本技能并使用 `$search-design-system`。

## 固定产物

主题目录使用项目 metadata 声明的位置；当前 client 默认是 `src/themes/<theme-key>/`：

```text
src/themes/<theme-key>/
├── SOURCES.md
├── PLAN.md
├── DESIGN.md
├── theme.json
├── assets/
│   ├── tokens.json
│   └── ...
├── style.css
├── tw.css
└── index.tsx
```

- 新主题使用小写字母、数字和连字符组成的 `<theme-key>`。
- `SOURCES.md` 和 `PLAN.md` 分别从 `assets/SOURCES.md`、`assets/PLAN.md` 建立；生成后删除模板注释和空示例行。
- 不要创建 `PROJECT.md`。主题不使用产品 PRD 的控制文档结构。
- 已有主题缺少 `SOURCES.md` 或 `PLAN.md` 时，只在本次有实质创建、更新或规划工作时补齐，不做全库迁移。

## 核心规则

- 规划和主题生成是一个闭环。不要只写计划后停止，也不要转交给其他写作技能。
- 用户当前明确要求优先。更新视觉规则时先改 `DESIGN.md`，再同步派生文件。
- 现状反推只使用可观察证据；不能用行业惯例补造缺失的品牌、组件或产品规则。
- 从零创建可以根据已确认的产品定位做设计决策，但必须区分用户要求和 Agent 选择。
- 原始采集数据放在已忽略的 `.local/`；主题目录只保留长期控制文档、标准产物和必要的稳定资源。
- 一期完成标准主题产物和验收。组件任务与模板任务通常只进入 `PLAN.md`，一期默认不实现。

## 工作流程

### 1. 确认新建或更新

先确定目标主题目录和工作类型：

- 新建：确认产品定位、用户、核心场景、视觉方向和会改变结果的约束。
- 更新：读取现有 `SOURCES.md`、`PLAN.md`、`DESIGN.md` 和全部标准派生文件，再判断影响范围。
- 导入或反推：确认来源类型、访问条件和需要保留的事实边界。

目标目录属于其他主题，或新要求与已确认的 `DESIGN.md` 存在重大冲突时，停止覆盖并请用户确认。

### 2. 采集并登记来源

出现网页、Axure、Figma、截图、现有原型或主题时，完整读取 `references/source-handlers.md`，只执行实际出现的来源分支。

先创建或更新 `SOURCES.md`，为每项来源分配稳定编号 `src-<三位序号>`，登记原始位置、访问日期、访问条件、本地证据、覆盖范围、状态、证据属性、缺口和冲突。已有来源保持编号，不重复采集已经足够且仍有效的证据。

### 3. 建立执行计划

创建或更新 `PLAN.md`：

- 一期主题任务覆盖来源、`DESIGN.md`、全部派生文件、稳定预览资源和验收。
- 任务引用实际 `src-*` 来源，写清依赖和可观察的验收标准。
- 开始执行时更新为 `执行中`；来源或工具不可用时标为 `阻塞`，写清解除条件。

### 4. 完成一期主题

写主题前完整读取 `references/theme-output-contract.md`。在同一次执行中：

1. 从已确认要求和来源创建或更新 9 段式 `DESIGN.md`。
2. 从 `DESIGN.md` 同步 `theme.json` 和 `assets/tokens.json`。
3. 同步 `style.css`、`tw.css`、`index.tsx` 和必要的本地预览资源。
4. 排除 cookie 弹窗、第三方控件、浏览器默认值和其他污染来源。
5. 检查目录、JSON、token、CSS、资源路径和展示内容的一致性。

不要在派生文件里发明 `DESIGN.md` 没有的另一套视觉规则。

### 5. 提取组件与模板任务

完成一期内容后，根据 `SOURCES.md` 提取后续工作：

- 组件任务：在多个页面、Frame、状态或截图中重复出现，或被用户明确指定为核心复用组件。
- 模板任务：在来源中重复出现且具有复用价值的页面结构、布局模式或业务场景。
- 单次出现且没有明确复用价值的元素不进入任务清单。

每项任务记录语义用途、来源编号、变体和状态、响应式或无障碍要求、依赖与验收标准。组件默认把 Radix 无头组件作为技术候选，但不是强制依赖；用户要求、现有技术栈和组件特性可以覆盖它。

组件和模板任务通常保持 `待确认` 或 `待执行`。除非用户明确扩大范围，否则不要在一期实现这些任务。

### 6. 验证并收口

按 `references/theme-output-contract.md` 运行 ready 检查和真实预览验收。完成验证后：

- 一期任务通过验收才改为 `已完成`。
- 未解除的来源缺口继续保留在 `SOURCES.md`。
- 未实施的组件与模板任务保留真实状态，不提前标记完成。
- 新增、删除或改变任务范围时，只更新 `PLAN.md`，不要把任务状态写进 `DESIGN.md`。

## 完成输出

说明：

- 主题目录、`SOURCES.md`、`PLAN.md` 和 `DESIGN.md` 路径。
- 已处理来源、采集边界、阻塞项和重要冲突。
- 一期完成的标准主题产物与验证结果。
- 识别出的组件和模板任务，以及 Radix 默认建议被采用或覆盖的原因。
- 当前仍需用户确认的设计决策。
