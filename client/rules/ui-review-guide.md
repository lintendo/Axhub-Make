# UI 评审指导

用于审查原型页面的 UI 质量、设计一致性、响应式、可访问性和核心元件表现。执行前先读取 `rules/review-common-guide.md`；业务完整性按 `rules/prototype-review-guide.md` 处理。

## 审查入口

当用户要求「UI review」「审查这个页面」「检查设计质量」或挑 UI 问题时，读取本规则并输出 Markdown 评审结论。

需要 Impeccable 的 UI critique 方法时，按需读取：

- `rules/references/impeccable/SKILL.md`
- `rules/references/impeccable/reference/critique.md`

这些文件只是第三方方法参考。不要调用 `/impeccable critique`，不要运行其上下文注入流程，也不要因缺少 `PRODUCT.md` 中断评审。

## 审查依据

设计规范依据只允许是一个 `DESIGN.md`：

1. 用户明确指定的 `DESIGN.md` 或主题目录下的 `DESIGN.md`。
2. 用户未指定时，使用项目默认设计的 `DESIGN.md`。
3. 两者都不存在时，继续常规设计评审并说明未使用设计规范。

`PRODUCT.md`、`theme.json`、`tokens.json`、CSS 变量、截图和 README 可以作为证据或实现参考，但不能替代 `DESIGN.md` 的规范地位。

## Impeccable 参考约束

使用 Impeccable critique 方法时必须遵守：

1. 只把选定的 `DESIGN.md` 作为设计依据。
2. 忽略 `PRODUCT.md` 和其他设计文件的规范地位。
3. 没有 `DESIGN.md` 时继续常规评审并说明。
4. 不调用 Impeccable 命令或上下文注入脚本。
5. 输出 Axhub Markdown 报告，不输出 JSON 或 `.impeccable` 产物。
6. P0-P3 问题最多 5 条，并包含核心元件点评。

## 审查流程

1. 确定原型或页面目标；目标不清时先请用户确认。
2. 确定唯一的 `DESIGN.md`；不存在时记录降级但不中断。
3. 读取目标源码和本地样式；有预览环境时检查桌面和移动端，可用浏览器时保留截图证据。
4. 可以使用 `rules/references/impeccable/scripts/detect.mjs` 辅助取证，但不要让 detector 输出先污染设计判断。
5. 综合设计判断、响应式、可访问性和实现证据，不直接拼接第三方报告。
6. 写入 `src/prototypes/<prototype-id>/.spec/reviews/ui-review.md`；页面级报告按需使用 `<page-id>-ui-review.md`。

## 核心审查维度

- **设计一致性**：视觉系统、信息层级和组件表达是否符合选定的 `DESIGN.md`。
- **核心任务效率**：主要操作、反馈、状态和信息组织是否支持用户完成任务。
- **响应式**：桌面、平板和移动端的布局、导航、内容与操作是否合理变化。
- **可访问性**：键盘焦点、基本语义、对比度和交互状态是否存在明显风险。
- **核心元件**：关键区块和高频组件是否一致、清晰且可复用。

## 领域评分约束

除公共规则外，应用以下封顶：

- 未检查移动端或关键响应式断点，最高 75。
- 未检查键盘焦点、基本语义或明显对比度风险，最高 80。
- 未使用可用的 `DESIGN.md` 作为依据，最高 75；确实不存在且已说明时不触发。

## 报告结构

- 使用 `templates/ui-review.md`；`title` 固定为 `UI 评审`。
- 公共前三组之后，第四组固定为 `核心元件`。
- 可以追加 `响应式与可访问性`、`证据与评估说明`。

## 优先级

- `P0`：阻断核心任务，或违反 `DESIGN.md` 中的强制规则。
- `P1`：显著增加用户完成任务的难度，或造成 WCAG AA 级别可访问性问题。
- `P2`：明显体验摩擦，但存在可用绕行。
- `P3`：低影响 polish，修复后更好但不影响主要任务。

## 独立评估分工

需要拆分评估时使用两个互不干扰的视角：

- 设计评估：看目标、`DESIGN.md`、截图/预览和源码。
- 证据评估：看 scanner、响应式、可访问性和实现风险。

## 交付补充

除公共交付信息外，说明使用的 `DESIGN.md`，以及是否使用浏览器、截图或 scanner。
