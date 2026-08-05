# Contributing to Axhub Make

感谢你改进 Axhub Make。Bug 和功能建议使用 GitHub Issues；安全漏洞不要提交公开 Issue，请按照 SECURITY.md 私密报告。

## Development setup

Axhub Make 仓库开发使用 Node.js 22 和 pnpm 10.20.0：

```bash
pnpm install --frozen-lockfile
```

最终用户和生成的客户端项目不要求安装 pnpm；面向用户的启动说明应保持 npm/npx 兼容。

## Branch and pull request workflow

从最新 main 创建聚焦单一目标的分支。工作未完成时使用 Draft PR。PR 标题采用 `type(scope): summary`，允许的 type 为 feat、fix、docs、refactor、test、build、ci、chore、perf、revert。

Issue 与 PR 可以独立存在；有关联时在 PR 中引用，不要求每个 PR 先创建 Issue。

## Validation

运行与改动区域匹配的测试和构建，并在 PR 中列出实际命令、结果和未覆盖风险。至少运行：

```bash
pnpm audit:open-source
git diff --check
```

服务端、Admin、客户端模板和发布脚本的详细命令以 package.json 为准。

## Cross-platform changes

安装、启动、路径、子进程、Codex++ 和 Agent 集成改动需要说明 macOS、Windows、Linux 的适用范围。不能验证的平台必须在 PR 风险中明确记录。

## Vendor and generated files

vendor/ 是独立发布所需内容，必须保持提交。修改 vendor 或生成产物时，在 PR 中写明权威来源、同步命令和验证结果。不要手工编辑无法从来源重建的产物。

## Repository hygiene

不要提交 token、账号数据、私有 URL、本地绝对路径、运行会话、缓存、coverage、dist、node_modules 或本地 Make 项目数据。client/.axhub/make/ 只能保留 AGENTS.md 允许的种子文件。

## Review

`blocking:` 表示合并前必须处理；`suggestion:` 表示推荐改进；`question:` 表示需要说明；`nit:` 表示可选细节。所有 blocking 评论与未解决对话处理完毕后再 squash merge。
