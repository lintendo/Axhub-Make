# Axhub Make GitHub Issue 与 PR 治理设计

- 日期：2026-08-05
- 状态：待用户复核
- 目标仓库：`lintendo/Axhub-Make`

## 1. 范围

本设计只治理公开的 Axhub Make 独立发布仓库 `lintendo/Axhub-Make`，不治理 `lintendo/Axhub-Runtime` 整个 monorepo。

Axhub Runtime 可以继续承担内部开发与同步来源的角色，但公开用户、贡献者和维护者看到的 Issue、Pull Request、社区文档、Actions 与分支规则都以 Axhub Make 仓库为准。Runtime 内部 package 名称和目录不得直接变成 Axhub Make 的公开标签体系。

治理目标：

1. 启用结构化 Issue，让用户可以有效报告 Axhub Make 的缺陷和需求。
2. 让进入 `main` 的变更经过统一 PR 描述、自动检查和可追踪的 squash merge。
3. 补齐公开仓库必需的贡献、安全和社区文件。
4. 保持单维护者阶段可执行，不设置必须由第二个人批准的形式门槛。
5. 兼顾 macOS、Windows、终端启动、Codex++ 入口和不同 AI Agent 的实际使用环境。

## 2. 当前基线

截至 2026-08-05，Axhub Make 的实际状态为：

- 仓库已经是 Public，默认分支为 `main`。
- GitHub Issues 当前关闭，不能接收用户问题或需求。
- 已经出现过外部贡献 PR，说明社区贡献入口不是假设需求。
- 仓库没有 `.github/`、`CONTRIBUTING.md`、`CODE_OF_CONDUCT.md` 或 `SECURITY.md`。
- `main` 没有 branch protection 或 repository ruleset。
- squash merge、merge commit 和 rebase merge 同时开放，合并后不会自动删除分支。
- Secret scanning 与 push protection 已启用，Dependabot security updates 未启用。
- 根目录已有 MIT `LICENSE` 和较完整的中文产品 README。
- 根 `package.json` 是开发源包，保留 `private: true`，但缺少 `license`、`repository`、`bugs` 和 `homepage` 元数据。
- 干净 checkout 上 `pnpm install --frozen-lockfile` 成功，`pnpm audit:open-source` 成功。
- 开源审计禁止提交 `docs/superpowers/`、本地路径、工作缓存和敏感信息，因此治理文档放在 `docs/` 的长期公开位置。

## 3. 原则

- **Axhub Make 优先**：表单、标签、CI 和文档使用 Axhub Make 的产品语言与目录结构。
- **约束主干，不约束草稿过程**：开发分支可以有临时 commit，PR 标题成为 squash 后的主干标题。
- **Issue 与 PR 松耦合**：有关联时引用 Issue，但不强制所有 PR 先建 Issue。
- **公开仓库默认安全**：漏洞走私密入口，Actions 使用最小权限，第三方 Action 固定完整 commit SHA。
- **路径感知检查**：文档改动不跑全部构建，代码改动不能只通过文档检查。
- **少量、可执行的规则**：第一阶段不上 Project、stale bot、自动发布或 Dependabot 自动合并。
- **设置可恢复**：仓库内配置通过 PR 版本化，GitHub 设置修改前保存快照，标签只增不删。

## 4. Issue 管理

### 4.1 启用顺序

Issues 不能立即裸开。顺序为：

1. 合并 Issue Forms 和社区文档。
2. 创建表单引用的新增标签。
3. 启用 GitHub Private Vulnerability Reporting。
4. 启用 GitHub Issues。
5. 用维护者测试 Issue 验证表单、默认标签和链接后关闭测试 Issue。

这样可以避免用户在模板和安全入口尚未就绪时提交无结构或包含敏感信息的内容。

### 4.2 Issue Forms

新增：

```text
.github/ISSUE_TEMPLATE/
├── bug.yml
├── feature.yml
└── config.yml
```

`config.yml` 关闭 blank issue，并提供两个外部入口：

- 使用与常见问题：`docs/faq.md`
- 安全漏洞：GitHub Private Vulnerability Reporting

Bug 表单收集：

- Axhub Make 版本
- 问题区域
- macOS、Windows 或 Linux 版本
- Node.js 版本
- 启动入口：`npx`、Codex++、本地开发或其他
- 相关 Agent、浏览器或编辑器
- 最小复现步骤
- 预期行为与实际行为
- 日志、截图或录屏，并明确提醒移除 token、账号和本地绝对路径

Feature 表单收集：

- 要解决的用户或团队问题
- 期望结果
- 受影响区域
- 建议方案
- 范围与非目标
- 已考虑的替代方案

安全漏洞不得通过普通 Issue 报告。`SECURITY.md`、Issue 配置和 README 使用同一个私密报告入口。

### 4.3 标签

保留已有默认标签，不删除：

- 类型：`bug`、`enhancement`、`documentation`
- 协作：`good first issue`、`help wanted`、`question`
- 关闭辅助：`duplicate`、`invalid`、`wontfix`

新增 Axhub Make 专属标签：

- 区域：`area: install-cli`、`area: admin-ui`、`area: server-api`、`area: client-template`、`area: agent-integration`、`area: import-export`、`area: annotation-review`、`area: docs`、`area: release`
- 优先级：`priority: p0`、`priority: p1`、`priority: p2`、`priority: p3`
- 状态：`status: needs-triage`、`status: needs-info`、`status: blocked`

每个开放 Issue 应有一个类型、一个主要区域和一个优先级。新 Issue 默认附加 `status: needs-triage`；接受后移除该状态。是否正在开发由关联 PR 表达，不增加 `in-progress` 标签。

### 4.4 分诊

单维护者阶段每周至少分诊一次：

1. 检查信息是否足以复现或讨论。
2. 分配区域与优先级。
3. 接受、请求更多信息、标记重复、暂不计划或关闭。
4. 需要代码处理时可关联 PR，但不强制 `Closes #N`。

公开服务目标为五个工作日内首次响应，不承诺固定解决时间。疑似安全问题立即移入私密安全渠道，并清理普通 Issue 中已暴露的敏感信息。

## 5. PR 管理

### 5.1 PR 描述

所有进入 `main` 的代码、配置、vendor 产物和文档变更都通过 PR。未达到评审条件时使用 Draft PR。

`.github/PULL_REQUEST_TEMPLATE.md` 包含：

- Summary：做了什么
- Motivation：为什么需要改
- Scope：涉及和不涉及的区域
- Validation：实际运行的命令、结果和手工验证
- Platform coverage：适用的 macOS、Windows、Linux、Node.js、Agent 或入口验证
- Risk and rollback：主要风险、兼容性影响和回退办法
- Vendor and release impact：是否改动 vendor、生成物、npm 包或发布流程
- Visual evidence：用户可见改动的截图或录屏，不适用时说明
- Documentation impact：README、FAQ、用户指南或发布说明是否同步
- Related issue：可选关联
- Author checklist：范围、自审、测试、开源审计和敏感信息检查

不要求每个 PR 在所有平台重复验证；作者必须说明验证边界，跨平台敏感改动应覆盖对应平台或明确剩余风险。

### 5.2 标题与主干历史

PR 标题使用：

```text
type(scope): summary
```

允许类型：`feat`、`fix`、`docs`、`refactor`、`test`、`build`、`ci`、`chore`、`perf`、`revert`。`scope` 可省略；使用时采用小写字母、数字和连字符。

开发分支中的临时 commit 不做硬性检查。最终通过 squash merge 把 PR 标题写入主干，解决当前提交信息随意的问题，同时不牺牲个人开发效率。

### 5.3 评审规则

建议一个 PR 只解决一个目标。超过约 400 行实质改动时优先拆分或使用 stacked PR；vendor、构建产物和机械同步不机械计入该建议，但必须说明来源和生成方式。

评审评论前缀：

- `blocking:` 合并前必须处理的正确性、安全、兼容性或回归问题
- `suggestion:` 推荐但不阻塞的改进
- `question:` 请求说明假设或行为
- `nit:` 可选的细节意见

单维护者阶段的合并条件：

- PR 已退出 Draft。
- PR policy 与 Axhub Make CI 通过。
- 作者完成自审和验证说明。
- blocking 评论与 review conversation 已解决。

不要求一个不存在的第二维护者批准。出现第二位稳定维护者后，再增加一个 approval 和 CODEOWNERS。

### 5.4 外部依赖与 Actions

外部贡献已经出现过包含第三方 GitHub Action 的 PR，因此新增 Action 必须单独审查：

- 说明用途、权限和失败影响。
- 固定到完整 commit SHA，不只写 tag。
- 默认 `permissions: contents: read`，需要写 Issue、PR 或评论时按 job 最小提升。
- 不把第三方质量服务当作构建、测试或安全检查的替代品。
- 不接受来源不明、权限过宽或会把仓库内容发送到未评估服务的 Action。

## 6. 自动检查

### 6.1 PR policy

`.github/workflows/pr-policy.yml` 在 PR 新建、编辑、同步和转为 Ready 时运行，提供稳定的 `pr-policy` 检查名称：

- 校验 Conventional PR 标题。
- 检查非 Draft PR 的关键描述区块存在且非空。
- 不强制填写 Related issue。

复杂规则放在 `scripts/github/` 的 Node.js 模块中，并覆盖标题边界、空区块、Draft 和事件输入测试；Workflow 不复制复杂正则。

### 6.2 Axhub Make 路径分类

CI 只按 Axhub Make 自己的结构分类：

| 改动区域 | 最低检查 |
| --- | --- |
| 社区文件、README、普通 docs | 开源审计、治理脚本测试、空白检查 |
| `bin/`、`src/server/`、`src/common/`、服务端配置 | server TypeScript、相关 server tests |
| `src/index/`、Admin Vite 配置 | Admin build、相关 Vitest |
| `client/`、模板与客户端插件 | client typecheck/build、相关测试 |
| `vendor/`、根依赖、workspace 或构建配置 | vendor sync、一组保守的跨区域构建与测试 |
| `scripts/release-*`、包元数据 | release 脚本测试、开源审计、相关构建 |
| 未识别代码路径 | 保守升级为跨区域检查，不静默跳过 |

变更分类由一个可测试的 Node.js 数据结构输出 JSON matrix。删除、重命名、多区域改动和根配置变更必须有正式测试。

### 6.3 CI 结构

`.github/workflows/ci.yml` 始终启动，并使用 Node.js 22 与仓库开发所需的 pnpm：

1. 安装：`pnpm install --frozen-lockfile`，使用 pnpm store cache。
2. 基础：`pnpm audit:open-source`、治理脚本测试、`git diff --check` 等价检查。
3. 分类：计算受影响区域。
4. 验证：并行运行对应的 build/test。
5. 汇总：无论 matrix 是否为空，都输出稳定的 `ci-required` 检查。

所有 job 设置 `timeout-minutes`。第一阶段只使用当前仓库已经可靠的命令；缺少稳定测试的区域要明确报告，不得伪装成已覆盖。

## 7. 开源社区文件

第一批社区基础 PR 增加或更新：

```text
.github/
├── ISSUE_TEMPLATE/
│   ├── bug.yml
│   ├── feature.yml
│   └── config.yml
└── PULL_REQUEST_TEMPLATE.md
CODE_OF_CONDUCT.md
CONTRIBUTING.md
SECURITY.md
README.md
package.json
```

要求：

- 保留现有 MIT `LICENSE`，不覆盖。
- README 保持中文产品定位和现有启动说明，只增加贡献、安全与许可证入口。
- CONTRIBUTING 说明 pnpm 开发环境、分支与 PR、测试、跨平台要求、vendor 提交规则和本地数据禁入规则。
- CODE_OF_CONDUCT 使用 Contributor Covenant，默认处理渠道为公开 commit 元数据中的 `lintendo@outlook.com`；合并前必须确认该邮箱仍被监控，否则先替换为实际维护渠道。
- SECURITY 只公开 GitHub Private Vulnerability Reporting，不在普通 Issue 中接收漏洞。
- 根 `package.json` 保留 `private: true`，只补 MIT license 与 GitHub repository、bugs、homepage 元数据；发布包仍由现有 release 脚本生成。
- 不为了满足通用模板新增空洞的 ARCHITECTURE、DEPLOYMENT 或 CHANGELOG 文件。

第二批自动化 PR 增加：

```text
.github/workflows/
├── ci.yml
└── pr-policy.yml
scripts/github/
├── changed-areas.mjs
├── changed-areas.test.mjs
├── pr-policy.mjs
└── pr-policy.test.mjs
```

具体拆分可以随测试边界调整，但不得把 Runtime 的全 workspace 映射复制进 Axhub Make。

## 8. GitHub 设置

### 8.1 社区基础 PR 合并后

- 创建新增标签。
- 启用 Private Vulnerability Reporting。
- 启用 Issues。
- 保持 Discussions 关闭，先使用 FAQ 和用户群承担一般使用咨询。
- 启用 Dependabot security updates，但不自动合并。

### 8.2 自动化 PR 验证后

调整合并方式：

- `allow_squash_merge = true`
- `allow_merge_commit = false`
- `allow_rebase_merge = false`
- `delete_branch_on_merge = true`

为 `main` 增加保护规则：

- 所有变更必须通过 PR。
- `pr-policy` 与 `ci-required` 必须成功。
- 必须解决所有 review conversation。
- 禁止 force push 和分支删除。
- 单维护者阶段 required approvals 为 0。
- 管理员遵守规则；紧急绕过必须补 Issue 或 PR 说明。

保护规则只能在检查名称实际出现在测试 PR 后启用，避免配置不存在的 required check 导致主分支锁死。

## 9. 上线顺序

### 阶段 1：社区基础

合并社区文件与 Issue/PR 模板，创建标签，启用安全入口和 Issues。用测试 Issue 验证实际入口。

### 阶段 2：自动化

以独立 PR 增加 PR policy、路径分类和 CI。使用 Draft PR 验证权限、检查名称、跳过逻辑和失败提示。

### 阶段 3：主分支硬化

在 Actions 至少成功运行一次后，调整 merge 设置并启用 `main` 保护。用低风险 PR 验证不能绕过检查，同时确认单维护者仍能完成 squash merge。

### 阶段 4：试运行复盘

观察至少 3 至 5 个真实 Issue/PR 或两周：

- Issue 首次提交的信息完整度
- 五个工作日内首次分诊的达成情况
- PR 标题和说明的补写次数
- CI 中位耗时、误触发和漏测
- Windows、macOS 与不同启动入口的问题是否能正确归类

发现摩擦时优先简化表单和规则，不用新增机器人掩盖流程问题。

## 10. 验证与回退

实施验证：

- `pnpm install --frozen-lockfile`
- `pnpm audit:open-source`
- Issue Form 与 workflow YAML 语法检查
- PR policy 单元测试
- 路径分类的单区域、多区域、根配置、删除、重命名和未知路径测试
- 本次涉及区域的 build/test
- `git diff --check`
- GitHub 上的测试 Issue 与 Draft PR

人工确认：

- 确认 `lintendo@outlook.com` 是持续监控的行为准则处理渠道；若不是，必须在社区基础 PR 合并前提供替代邮箱。
- 确认启用 Issues 后由当前维护者承担每周分诊和五个工作日首次响应目标。

回退：

- 仓库内文件通过 revert PR 回退。
- 标签只增加，不删除已有标签。
- GitHub 设置修改前后保存 JSON 快照，必要时按快照恢复。
- 若 branch protection 配错，先恢复到已验证快照，不用 force push 绕过。

## 11. 非目标

本轮不包含：

- Axhub Runtime 整体治理
- GitHub Projects 看板
- stale bot 或自动关闭 Issue
- Dependabot 自动合并
- release-please、semantic-release 或替换现有发布脚本
- 强制所有 PR 关联 Issue
- 单维护者阶段强制他人 approval
- 重构 Axhub Make 产品代码或 vendor 体系
- 新增空洞的通用文档目录

## 12. 已确认决策

- 目标是公开仓库 `lintendo/Axhub-Make`。
- 当前按单维护者模式设计。
- Issue 与 PR 独立，关联为推荐项。
- CI 按 Axhub Make 的实际目录和风险分类。
- 采用渐进式治理：社区基础、自动化、分支硬化分批上线。
- 现有脏开发目录不做 stash、rebase 或覆盖；治理工作在基于 Axhub Make 最新 `origin/main` 的独立 worktree 中进行。
