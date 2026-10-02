---
name: write-prd
description: Use when the user explicitly asks to write, draft, create, update, or synthesize a PRD for an Axhub Make client project, especially when the PRD may aggregate multiple prototypes, resources, canvas notes, or existing product context.
---

# Write PRD

把当前对话、项目资源、原型和画布上下文整理成简洁 PRD。不要进行长轮需求访谈；如果缺少会影响范围或验收的关键决策，最多问一个聚焦问题，或写明合理假设。

## 上下文读取

优先看需求资料，不默认把工作流文档当成需求来源：

1. 用户当前说明、附件、截图，以及用户提供的模板。
2. `src/resources/` 中已有产品资料、PRD、素材和长期文档；项目模板位于 `templates/`。
3. 按 `rules/requirements-alignment-guide.md` 读取相关原型主规格。
4. 相关原型页面、`annotation-source.json`、批注、状态定义和可见文案。
5. 相关 `src/resources/**/*.excalidraw` 和 `src/resources/.assets/<resource-relative-path>/`，用于识别跨原型关系、流程草图和补充说明。

## 模板

根据选定的模板入口文件编写 PRD，遵循其中的章节、字段和表达要求。未指定时使用统一内置模板 `templates/prd.md`；允许用户或项目指定其他模板文件，已经明确时直接采用。

PRD 只写产品决策、用户体验、范围、业务模型、规则和验收。不要堆易过期的代码片段或实现清单。

## 存储位置

按任务给出的目标路径写入；未指定时遵循项目默认存储规则。允许用户或项目指定其他存储位置。

如果内容会改变单个原型的范围或行为，按 `rules/requirements-alignment-guide.md` 同步更新主规格中的引用或相关决策。

## 完成输出

完成后说明：

- PRD 路径。
- 使用了哪些主要来源，包括资源、原型和画布文件。
- 使用的模板入口文件。
- 仍然存在的开放问题或关键假设。
