# Axhub Make GitHub Issue 与 PR 治理实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为公开仓库 `lintendo/Axhub-Make` 建立结构化 Issue、统一 PR、只读路径感知 CI 和可回退的主分支保护，同时不改变 Axhub Make 的运行逻辑或发布行为。

**Architecture:** 实施分为两个独立 PR。第一个 PR 只增加社区文件、Issue/PR 模板和开发元数据；合并后才启用 Issues 与私密漏洞报告。第二个 PR 使用仓库内 Node.js 模块完成 PR policy、路径分类和检查命令调度；Actions 只读运行且不持有生产密钥，验证成功后才启用分支保护。仓库内 required workflows 是质量门禁而非独立安全边界，因为 PR 可以修改 workflow 定义及其检查脚本。

**Tech Stack:** GitHub Issue Forms、GitHub Actions、Node.js 22、pnpm 10.20.0、Node.js test runner、YAML 2.9.0、GitHub CLI、现有 Axhub Make build/test/release scripts。

## Global Constraints

- 目标仓库只能是 `lintendo/Axhub-Make`；不得把 Axhub Runtime 的全 workspace 映射复制进来。
- 开发命令使用 pnpm；面向最终用户的文档继续使用 `npm`/`npx` 安全流程。
- React 保持 18.2.0；本计划不升级业务依赖或重构产品代码。
- `vendor/` 保持提交状态；同步检查只能验证差异，不能自动 commit 或 push。
- Actions 只能使用 `pull_request`/`push`，禁止 `pull_request_target`。
- Actions 默认 `permissions: contents: read`，不注入生产、发布或 Axhub 云端密钥。
- 维护者必须在合并前审查 workflow、policy/check 脚本和 branch-protection 配置变更；不得宣称 required workflow 具有绝对防篡改能力。
- CI 禁止运行正式 publish、正式 release、部署或修改线上数据的命令。
- 所有外部 Action 固定完整 commit SHA。
- 单维护者阶段 required approvals 为 0；不得配置无法由当前维护者满足的批准门槛。
- GitHub 外部设置必须在对应 PR 合并后、人工确认目标仓库后再执行。
- 不改动当前脏开发目录；实施继续使用干净的 Axhub Make worktree。
- `docs/superpowers/`、本地绝对路径、缓存、构建产物和敏感信息不得提交。

## Planned File Map

社区基础 PR：

```text
.github/ISSUE_TEMPLATE/bug.yml                 # Bug Issue Form
.github/ISSUE_TEMPLATE/feature.yml             # Feature Issue Form
.github/ISSUE_TEMPLATE/config.yml              # 关闭 blank issue，提供 FAQ/安全入口
.github/PULL_REQUEST_TEMPLATE.md                # PR 证据与自审模板
CODE_OF_CONDUCT.md                              # Contributor Covenant 2.1
CONTRIBUTING.md                                 # Axhub Make 贡献流程
SECURITY.md                                     # 私密漏洞报告政策
README.md                                       # 增加贡献、安全和许可证入口
package.json                                    # 开发元数据、社区测试脚本、yaml devDependency
pnpm-lock.yaml                                  # 仅记录 yaml 2.9.0 devDependency
scripts/github/community-files.test.mjs         # 结构化验证社区文件
docs/github-issue-pr-governance.md              # 已批准设计
docs/github-issue-pr-governance-implementation-plan.md
```

自动化 PR：

```text
.github/workflows/pr-policy.yml                 # 稳定检查名 pr-policy
.github/workflows/ci.yml                        # 基础检查、路径矩阵、稳定汇总 ci-required
scripts/github/pr-policy.mjs                    # PR 标题与正文验证
scripts/github/pr-policy.test.mjs
scripts/github/changed-areas.mjs                # Git diff 解析与 Axhub Make 路径分类
scripts/github/changed-areas.test.mjs
scripts/github/run-area-check.mjs               # 参数数组方式运行现有 pnpm 检查
scripts/github/run-area-check.test.mjs
scripts/github/workflow-contract.test.mjs       # YAML 权限、触发器和固定 SHA 合约
scripts/github/branch-protection.json            # 可审计的 main 保护期望状态
package.json                                    # 增加 github:automation:test/github:test
```

---

## Phase A: 社区基础 PR

### Task 1: Issue Forms、PR 模板与结构测试

**Files:**
- Create: `.github/ISSUE_TEMPLATE/bug.yml`
- Create: `.github/ISSUE_TEMPLATE/feature.yml`
- Create: `.github/ISSUE_TEMPLATE/config.yml`
- Create: `.github/PULL_REQUEST_TEMPLATE.md`
- Create: `scripts/github/community-files.test.mjs`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: 当前 `package.json`、`docs/faq.md`、公开安全建议 URL。
- Produces: `pnpm github:community:test`；后续 README、社区文档和 GitHub Issues 启用步骤依赖这些模板。

- [ ] **Step 1: 增加 YAML 解析器和社区测试命令**

Run:

```bash
pnpm add --save-dev --save-exact yaml@2.9.0
```

Modify `package.json` scripts:

```json
{
  "github:community:test": "node --test scripts/open-source-audit.test.mjs scripts/github/community-files.test.mjs"
}
```

Expected: `yaml` 只出现在 `devDependencies`，`pnpm-lock.yaml` 更新，业务 `dependencies` 不变。

- [ ] **Step 2: 先写失败的社区文件结构测试**

Create `scripts/github/community-files.test.mjs`:

```js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';
import { parse } from 'yaml';

const readText = (filePath) => fs.readFileSync(filePath, 'utf8');
const readYaml = (filePath) => parse(readText(filePath));
const fieldIds = (form) => form.body.map((field) => field.id).filter(Boolean);

describe('GitHub community files', () => {
  it('defines structured bug and feature forms', () => {
    const bug = readYaml('.github/ISSUE_TEMPLATE/bug.yml');
    const feature = readYaml('.github/ISSUE_TEMPLATE/feature.yml');

    assert.deepEqual(bug.labels, ['bug', 'status: needs-triage']);
    assert.deepEqual(feature.labels, ['enhancement', 'status: needs-triage']);
    assert.deepEqual(
      fieldIds(bug),
      ['version', 'area', 'os', 'node', 'entry', 'agent', 'reproduction', 'expected', 'actual', 'evidence', 'checks'],
    );
    assert.deepEqual(
      fieldIds(feature),
      ['problem', 'outcome', 'area', 'proposal', 'scope', 'alternatives', 'checks'],
    );
  });

  it('disables blank issues and links support and private security reporting', () => {
    const config = readYaml('.github/ISSUE_TEMPLATE/config.yml');
    assert.equal(config.blank_issues_enabled, false);
    assert.deepEqual(
      config.contact_links.map((link) => link.url),
      [
        'https://github.com/lintendo/Axhub-Make/blob/main/docs/faq.md',
        'https://github.com/lintendo/Axhub-Make/security/advisories/new',
      ],
    );
  });

  it('requires PR evidence without requiring a related issue', () => {
    const template = readText('.github/PULL_REQUEST_TEMPLATE.md');
    for (const heading of [
      '## Summary',
      '## Motivation',
      '## Scope',
      '## Validation',
      '## Platform coverage',
      '## Risk and rollback',
      '## Vendor and release impact',
      '## Visual evidence',
      '## Documentation impact',
      '## Related issue',
      '## Author checklist',
    ]) assert.match(template, new RegExp(`^${heading}$`, 'mu'));
    assert.match(template, /Related issue[\s\S]*Optional/u);
    assert.match(template, /- \[ \]/u);
  });
});
```

- [ ] **Step 3: 运行测试，确认缺少模板时失败**

Run:

```bash
pnpm github:community:test
```

Expected: FAIL with `ENOENT` for `.github/ISSUE_TEMPLATE/bug.yml`.

- [ ] **Step 4: 创建 Bug Issue Form**

Create `.github/ISSUE_TEMPLATE/bug.yml` with this shape and exact field ids:

```yaml
name: Bug report
description: Report a reproducible problem in Axhub Make
title: "bug: "
labels:
  - bug
  - "status: needs-triage"
body:
  - type: markdown
    attributes:
      value: Before submitting, remove tokens, account data, private URLs, and local absolute paths.
  - type: input
    id: version
    attributes:
      label: Axhub Make version
      description: Run npx -y @axhub/make@latest --version or copy the version shown by Make.
    validations:
      required: true
  - type: dropdown
    id: area
    attributes:
      label: Area
      options:
        - Installation or CLI
        - Admin UI
        - Server or API
        - Client template
        - Agent integration
        - Import or export
        - Annotation or review
        - Documentation
        - Release
        - Other
    validations:
      required: true
  - type: input
    id: os
    attributes:
      label: Operating system
      placeholder: macOS 15.6, Windows 11, or Linux distribution
    validations:
      required: true
  - type: input
    id: node
    attributes:
      label: Node.js version
      placeholder: Output of node --version
    validations:
      required: true
  - type: dropdown
    id: entry
    attributes:
      label: Start entry
      options:
        - npx
        - Codex++ sidebar
        - Local development
        - Other
    validations:
      required: true
  - type: input
    id: agent
    attributes:
      label: Agent, browser, or editor
      description: Include the relevant product and version, or write Not applicable.
    validations:
      required: true
  - type: textarea
    id: reproduction
    attributes:
      label: Steps to reproduce
    validations:
      required: true
  - type: textarea
    id: expected
    attributes:
      label: Expected behavior
    validations:
      required: true
  - type: textarea
    id: actual
    attributes:
      label: Actual behavior
    validations:
      required: true
  - type: textarea
    id: evidence
    attributes:
      label: Logs or visual evidence
      description: Redact secrets, account data, private URLs, and local absolute paths.
  - type: checkboxes
    id: checks
    attributes:
      label: Submission checks
      options:
        - label: I searched existing issues for duplicates.
          required: true
        - label: I removed secrets and private data from this report.
          required: true
```

- [ ] **Step 5: 创建 Feature Issue Form 和 chooser 配置**

Create `.github/ISSUE_TEMPLATE/feature.yml`:

```yaml
name: Feature request
description: Propose an improvement to the Axhub Make workflow
title: "feat: "
labels:
  - enhancement
  - "status: needs-triage"
body:
  - type: textarea
    id: problem
    attributes:
      label: Problem
      description: Describe the user or team problem, not only the requested implementation.
    validations:
      required: true
  - type: textarea
    id: outcome
    attributes:
      label: Desired outcome
    validations:
      required: true
  - type: dropdown
    id: area
    attributes:
      label: Area
      options:
        - Installation or CLI
        - Admin UI
        - Server or API
        - Client template
        - Agent integration
        - Import or export
        - Annotation or review
        - Documentation
        - Release
        - Other
    validations:
      required: true
  - type: textarea
    id: proposal
    attributes:
      label: Proposed solution
    validations:
      required: true
  - type: textarea
    id: scope
    attributes:
      label: Scope and non-goals
    validations:
      required: true
  - type: textarea
    id: alternatives
    attributes:
      label: Alternatives considered
  - type: checkboxes
    id: checks
    attributes:
      label: Submission checks
      options:
        - label: I searched existing issues for similar requests.
          required: true
        - label: This request contains no secrets or private data.
          required: true
```

Create `.github/ISSUE_TEMPLATE/config.yml`:

```yaml
blank_issues_enabled: false
contact_links:
  - name: Usage and frequently asked questions
    url: https://github.com/lintendo/Axhub-Make/blob/main/docs/faq.md
    about: Check setup and usage guidance before opening a bug report.
  - name: Report a security vulnerability
    url: https://github.com/lintendo/Axhub-Make/security/advisories/new
    about: Send vulnerabilities privately. Do not open a public issue.
```

- [ ] **Step 6: 创建 PR 模板**

Create `.github/PULL_REQUEST_TEMPLATE.md`:

```markdown
## Summary

<!-- What changed? -->

## Motivation

<!-- Why is this change needed now? -->

## Scope

<!-- What is included and explicitly not included? -->

## Validation

<!-- List the exact commands and manual checks that ran, with results. -->

## Platform coverage

<!-- State the tested macOS/Windows/Linux, Node.js, Agent, browser, or entry points. -->

## Risk and rollback

<!-- Describe failure modes, compatibility risk, and how to revert. -->

## Vendor and release impact

<!-- State whether vendor files, generated output, npm packaging, or release scripts changed. -->

## Visual evidence

<!-- Add screenshots/recordings for user-visible changes, or state Not applicable. -->

## Documentation impact

<!-- State which README, FAQ, guide, or release note changed, or why none is needed. -->

## Related issue

Optional. Link with `Closes #123` only when this PR should close an issue.

## Author checklist

- [ ] The PR has one focused goal.
- [ ] I reviewed the complete diff.
- [ ] I listed real validation evidence and remaining gaps.
- [ ] Cross-platform-sensitive behavior has appropriate coverage or documented risk.
- [ ] Vendor and generated changes include their source and generation command.
- [ ] Documentation is updated or explicitly not required.
- [ ] No token, account data, private URL, local path, cache, or runtime session is included.
```

- [ ] **Step 7: 运行社区测试**

Run:

```bash
pnpm github:community:test
```

Expected: PASS with all community file tests successful.

- [ ] **Step 8: 提交模板与测试**

```bash
git add .github/ISSUE_TEMPLATE .github/PULL_REQUEST_TEMPLATE.md scripts/github/community-files.test.mjs package.json pnpm-lock.yaml
git commit -m "feat: add structured GitHub contribution templates"
```

### Task 2: 开源社区文档与仓库元数据

**Files:**
- Create: `CONTRIBUTING.md`
- Create: `CODE_OF_CONDUCT.md`
- Create: `SECURITY.md`
- Modify: `README.md`
- Modify: `package.json`
- Modify: `scripts/github/community-files.test.mjs`

**Interfaces:**
- Consumes: Task 1 的社区测试与模板。
- Produces: 公开贡献、安全、行为准则入口；GitHub Issues 启用前置条件。

- [ ] **Step 1: 扩展测试，先要求社区文档和元数据存在**

Append these cases to `scripts/github/community-files.test.mjs`:

```js
it('publishes contribution, conduct, and security policies', () => {
  const contributing = readText('CONTRIBUTING.md');
  const conduct = readText('CODE_OF_CONDUCT.md');
  const security = readText('SECURITY.md');

  assert.match(contributing, /pnpm install/u);
  assert.match(contributing, /pull request/iu);
  assert.match(contributing, /vendor\//u);
  assert.match(conduct, /Contributor Covenant/u);
  assert.match(conduct, /lintendo@outlook\.com/u);
  assert.match(security, /security\/advisories\/new/u);
  assert.match(security, /not.*public issue/iu);
});

it('links community policies and declares repository metadata', () => {
  const readme = readText('README.md');
  const packageJson = JSON.parse(readText('package.json'));

  assert.match(readme, /CONTRIBUTING\.md/u);
  assert.match(readme, /SECURITY\.md/u);
  assert.match(readme, /Apache License 2\.0/u);
  assert.equal(packageJson.private, true);
  assert.equal(packageJson.license, 'Apache-2.0');
  assert.deepEqual(packageJson.repository, {
    type: 'git',
    url: 'git+https://github.com/lintendo/Axhub-Make.git',
  });
  assert.deepEqual(packageJson.bugs, {
    url: 'https://github.com/lintendo/Axhub-Make/issues',
  });
  assert.equal(packageJson.homepage, 'https://github.com/lintendo/Axhub-Make#readme');
});
```

- [ ] **Step 2: 运行测试，确认社区文档缺失时失败**

Run: `pnpm github:community:test`

Expected: FAIL with `ENOENT` for `CONTRIBUTING.md`.

- [ ] **Step 3: 创建 CONTRIBUTING.md**

Create a Chinese-first `CONTRIBUTING.md` with these exact sections and rules:

````markdown
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
````

- [ ] **Step 4: 创建行为准则与安全政策**

Create `CODE_OF_CONDUCT.md` from the unmodified Contributor Covenant 2.1 text at `https://www.contributor-covenant.org/version/2/1/code_of_conduct/`, setting the enforcement contact to `lintendo@outlook.com`. Before merge, confirm that this mailbox is actively monitored; if it is not, stop and obtain the maintainer's reporting mailbox before committing.

Create `SECURITY.md`:

```markdown
# Security Policy

## Supported versions

Security fixes target the latest published Axhub Make version. Upgrade to the latest release before reporting an issue that only affects an older version.

## Reporting a vulnerability

Report vulnerabilities privately through [GitHub Private Vulnerability Reporting](https://github.com/lintendo/Axhub-Make/security/advisories/new).

Do not open a public issue, discussion, or pull request containing exploit details, credentials, private URLs, account data, or affected user data.

Include the affected version, environment, reproduction steps, impact, and any suggested mitigation. The maintainer will acknowledge the report, assess severity, coordinate a fix, and disclose details after affected users can update.
```

- [ ] **Step 5: 增加 README 社区入口**

Append near the end of `README.md`, before any final license-only footer if present:

```markdown
## 参与贡献

提交 Bug、功能建议或代码前，请阅读 [贡献指南](CONTRIBUTING.md)。安全漏洞不要提交公开 Issue，请按照 [安全政策](SECURITY.md) 私密报告。

参与社区时请遵守 [行为准则](CODE_OF_CONDUCT.md)。

## License

Axhub Make 使用 [Apache License 2.0](LICENSE)。
```

- [ ] **Step 6: 补齐 root package metadata，不改变发布逻辑**

Add these top-level fields to `package.json`; keep `private: true`, all dependencies, scripts, version, bins, and files unchanged except the community test script from Task 1:

```json
{
  "license": "Apache-2.0",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/lintendo/Axhub-Make.git"
  },
  "bugs": {
    "url": "https://github.com/lintendo/Axhub-Make/issues"
  },
  "homepage": "https://github.com/lintendo/Axhub-Make#readme"
}
```

- [ ] **Step 7: 运行社区与开源验证**

Run:

```bash
pnpm github:community:test
pnpm audit:open-source
git diff --check
```

Expected: all commands exit 0; audit reports `Open-source audit passed: tracked tree`.

- [ ] **Step 8: 人工核对社区文件**

Confirm:

- `lintendo@outlook.com` is a monitored conduct-reporting mailbox.
- SECURITY points only to private reporting.
- README product copy and existing screenshots are otherwise unchanged.
- `git diff -- package.json` contains no dependency or release behavior change except the exact `yaml` devDependency, test script, and metadata fields.

- [ ] **Step 9: 提交社区文档**

```bash
git add CONTRIBUTING.md CODE_OF_CONDUCT.md SECURITY.md README.md package.json scripts/github/community-files.test.mjs
git commit -m "docs: add Axhub Make community policies"
```

### Task 3: 社区基础 PR 验证与合并检查点

**Files:**
- Verify only; no new file.

**Interfaces:**
- Consumes: Tasks 1-2 and the approved design/plan commits.
- Produces: 可审阅的第一批 PR；Task 4 在它合并前不得执行。

- [ ] **Step 1: 完整验证第一批 PR**

Run:

```bash
pnpm install --frozen-lockfile
pnpm github:community:test
pnpm audit:open-source
git diff --check origin/main...HEAD
git status --short
```

Expected: all commands exit 0; status is clean; diff contains only the planned community, documentation, metadata and test files.

- [ ] **Step 2: 推送并创建 Draft PR**

Only after explicit user approval to publish the branch:

Create ignored `.local/github-governance/community-pr-body.md` with `apply_patch`:

```markdown
## Summary

Adds Axhub Make Issue Forms, a PR template, community policies, repository metadata, and source-level validation for those files.

## Motivation

The public repository currently has Issues disabled and no structured contribution or security entry point.

## Scope

Community and repository-management files only. No Axhub Make runtime, vendor implementation, release behavior, or published package code changes.

## Validation

- pnpm install --frozen-lockfile
- pnpm github:community:test
- pnpm audit:open-source
- git diff --check origin/main...HEAD

## Platform coverage

Not applicable to runtime behavior; templates and docs were reviewed as repository content.

## Risk and rollback

Low runtime risk. Revert the PR to remove the repository files before enabling Issues.

## Vendor and release impact

No vendor or release command changes. YAML is a development-only test dependency.

## Visual evidence

Not applicable until the Issue chooser is enabled after merge.

## Documentation impact

Adds public contribution, conduct, security, governance, and implementation documentation.

## Related issue

Optional. No existing Issue is required because Issues are currently disabled.

## Author checklist

- [x] The PR has one focused goal.
- [x] The complete diff was reviewed.
- [x] Validation evidence and remaining external-setting steps are listed.
- [x] No runtime behavior, vendor implementation, release command, secret, or local data is included.
```

```bash
git push -u origin codex/github-governance
gh pr create \
  --repo lintendo/Axhub-Make \
  --base main \
  --head codex/github-governance \
  --draft \
  --title "docs: establish Axhub Make community governance" \
  --body-file .local/github-governance/community-pr-body.md
```

Expected: one Draft PR targeting `lintendo/Axhub-Make:main`; no repository setting has changed.

- [ ] **Step 3: Review and merge checkpoint**

Stop. Do not enable Issues, labels, Dependabot, or private vulnerability reporting until:

- the user reviews the complete PR diff;
- the community tests and open-source audit pass;
- the PR is marked Ready and squash-merged;
- local `main` is refreshed from `origin/main`.

## Phase B: 合并后启用 Issue 与安全入口

### Task 4: 标签、安全入口和 Issues

**Files:**
- External GitHub state only; no tracked file.

**Interfaces:**
- Consumes: merged community PR on `main`.
- Produces: 可用的 Issues、安全报告入口和第二阶段跟踪 Issue。

- [ ] **Step 1: 只读确认目标和当前状态**

Run:

```bash
mkdir -p .local/github-governance
gh api repos/lintendo/Axhub-Make > .local/github-governance/community-settings-before.json
gh repo view lintendo/Axhub-Make --json nameWithOwner,visibility,defaultBranchRef,hasIssuesEnabled,url
gh api repos/lintendo/Axhub-Make/private-vulnerability-reporting
gh api --include repos/lintendo/Axhub-Make/vulnerability-alerts
gh api repos/lintendo/Axhub-Make/automated-security-fixes
gh label list --repo lintendo/Axhub-Make --limit 100
```

Expected before mutation:

- `nameWithOwner` is `lintendo/Axhub-Make`.
- visibility is `PUBLIC`.
- default branch is `main`.
- the merged `.github/ISSUE_TEMPLATE/` files are present on `main`.
- Issues、Private Vulnerability Reporting、vulnerability alerts、automated security fixes 和完整标签状态均已记录；vulnerability alerts 的 HTTP 204 表示启用，HTTP 404 表示关闭或当前不可用。

Record the complete output in the execution transcript. Ask for explicit confirmation before Step 2.

- [ ] **Step 2: 创建缺失标签，保留已有标签**

Run each command only when `gh label list` confirms the label is absent:

```bash
gh label create "area: install-cli" --repo lintendo/Axhub-Make --color 1D76DB --description "Installation, startup, and CLI"
gh label create "area: admin-ui" --repo lintendo/Axhub-Make --color 1D76DB --description "Admin UI and workspace interaction"
gh label create "area: server-api" --repo lintendo/Axhub-Make --color 1D76DB --description "Local server and API"
gh label create "area: client-template" --repo lintendo/Axhub-Make --color 1D76DB --description "Generated Make client template"
gh label create "area: agent-integration" --repo lintendo/Axhub-Make --color 1D76DB --description "Agent, IDE, and Codex++ integration"
gh label create "area: import-export" --repo lintendo/Axhub-Make --color 1D76DB --description "Import, export, and publishing flows"
gh label create "area: annotation-review" --repo lintendo/Axhub-Make --color 1D76DB --description "Annotation, commentary, and review"
gh label create "area: docs" --repo lintendo/Axhub-Make --color 1D76DB --description "Documentation and community files"
gh label create "area: release" --repo lintendo/Axhub-Make --color 1D76DB --description "Packaging and release"
gh label create "priority: p0" --repo lintendo/Axhub-Make --color B60205 --description "Critical and immediately actionable"
gh label create "priority: p1" --repo lintendo/Axhub-Make --color D93F0B --description "High priority"
gh label create "priority: p2" --repo lintendo/Axhub-Make --color FBCA04 --description "Normal priority"
gh label create "priority: p3" --repo lintendo/Axhub-Make --color 0E8A16 --description "Low priority"
gh label create "status: needs-triage" --repo lintendo/Axhub-Make --color EDEDED --description "Awaiting maintainer triage"
gh label create "status: needs-info" --repo lintendo/Axhub-Make --color D876E3 --description "More information is required"
gh label create "status: blocked" --repo lintendo/Axhub-Make --color 5319E7 --description "Blocked by another decision or dependency"
```

Expected: only missing labels are added; default labels are unchanged.

- [ ] **Step 3: 启用 vulnerability alerts、私密漏洞报告、Issues 和安全更新**

Run:

```bash
gh api --method PUT repos/lintendo/Axhub-Make/vulnerability-alerts
gh api --include repos/lintendo/Axhub-Make/vulnerability-alerts
gh api --method PUT repos/lintendo/Axhub-Make/private-vulnerability-reporting
gh api --method PATCH repos/lintendo/Axhub-Make -F has_issues=true
gh api --method PUT repos/lintendo/Axhub-Make/automated-security-fixes
```

The vulnerability-alert read-back must return HTTP 204 before enabling automated security fixes; HTTP 404 means alerts are disabled or unavailable and execution must stop. Without this prerequisite, GitHub returns HTTP 422 when configuring automated security fixes. These commands must not enable auto-merge or Discussions, publish a release, change merge methods or repository visibility, or alter program behavior.

- [ ] **Step 4: 读取验证外部状态**

Run:

```bash
gh repo view lintendo/Axhub-Make --json visibility,hasIssuesEnabled,defaultBranchRef
gh api repos/lintendo/Axhub-Make/private-vulnerability-reporting
gh api --include repos/lintendo/Axhub-Make/vulnerability-alerts
gh api repos/lintendo/Axhub-Make/automated-security-fixes
gh label list --repo lintendo/Axhub-Make --limit 100
```

Expected: public visibility and default branch remain unchanged; Issues and private vulnerability reporting are enabled; vulnerability alerts return HTTP 204; automated security fixes are enabled and not paused; all planned labels exist. Auto-merge, Discussions, merge methods, releases and program behavior remain unchanged.

If verification fails, stop before creating the tracking Issue. In reverse order, revert only each capability that the Step 1 snapshot proved was disabled and Step 3 actually enabled:

```bash
gh api --method DELETE repos/lintendo/Axhub-Make/automated-security-fixes
gh api --method PATCH repos/lintendo/Axhub-Make -F has_issues=false
gh api --method DELETE repos/lintendo/Axhub-Make/private-vulnerability-reporting
gh api --method DELETE repos/lintendo/Axhub-Make/vulnerability-alerts
```

Do not disable a capability that was already enabled before this task. Newly added labels may remain because they do not affect program execution; if they must be removed, first compare them with the recorded pre-change label list and request explicit approval.

- [ ] **Step 5: 用临时 Issue 验证公开入口**

Open `https://github.com/lintendo/Axhub-Make/issues/new/choose`, select Bug report, and submit a redacted test Issue titled `bug: verify structured issue form`. Confirm that every planned field renders, `bug` and `status: needs-triage` are attached, the FAQ link works, and the security link opens Private Vulnerability Reporting. Close the Issue immediately with the comment `Governance form verification completed; no product defect.` Do not put a real token, account, private URL, local path, or fabricated product failure in it.

- [ ] **Step 6: 建立真实的治理跟踪 Issue**

Open the Feature request form and create one real tracking Issue titled:

```text
chore: complete GitHub governance rollout
```

Use area Documentation, describe Phase C/D tasks, and apply `priority: p2`. After triage, remove `status: needs-triage`. This is a real rollout tracker, not a disposable test Issue.

## Phase C: 自动化 PR

### Task 5: PR policy 模块（TDD）

**Files:**
- Create: `scripts/github/pr-policy.mjs`
- Create: `scripts/github/pr-policy.test.mjs`

**Interfaces:**
- Produces: `validatePrTitle(title): string[]`、`validatePrBody(body, { draft }): string[]`、`validatePullRequest(pullRequest): string[]`。
- Consumes: GitHub `pull_request` event JSON via `GITHUB_EVENT_PATH`。

- [ ] **Step 0: 从已合并社区基础的最新 main 创建自动化分支**

Invoke `superpowers:using-git-worktrees`. From a clean checkout, fetch `origin` and create `codex/github-governance-ci` from `origin/main`. With no native worktree tool, the git fallback is:

```bash
git fetch origin
git worktree add ../axhub-make-github-governance-ci -b codex/github-governance-ci origin/main
```

Expected: the new worktree contains the merged community files and has no uncommitted changes. Do not switch or clean the user's original dirty checkout.

- [ ] **Step 1: 写失败测试**

Create `scripts/github/pr-policy.test.mjs`:

```js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  runFromEvent,
  validatePrBody,
  validatePrTitle,
  validatePullRequest,
} from './pr-policy.mjs';

const validBody = `## Summary\nAdds governance.\n\n## Motivation\nKeeps reviews consistent.\n\n## Scope\nGitHub only.\n\n## Validation\nTests pass.\n\n## Platform coverage\nNot applicable.\n\n## Risk and rollback\nRevert the PR.\n`;

function runWithTemporaryEvent(pullRequest) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'axhub-pr-policy-'));
  const eventPath = path.join(directory, 'event.json');
  const previousExitCode = process.exitCode;
  try {
    fs.writeFileSync(eventPath, JSON.stringify({ pull_request: pullRequest }));
    return runFromEvent(eventPath);
  } finally {
    process.exitCode = previousExitCode;
    fs.rmSync(directory, { force: true, recursive: true });
  }
}

describe('PR policy', () => {
  it('accepts conventional titles with optional lowercase scopes', () => {
    assert.deepEqual(validatePrTitle('feat(server-api): validate requests'), []);
    assert.deepEqual(validatePrTitle('docs: add contribution guide'), []);
  });

  it('rejects informal and malformed titles', () => {
    assert.equal(validatePrTitle('update files').length, 1);
    assert.equal(validatePrTitle('feat(Server): update files').length, 1);
  });

  it('allows an empty Draft body but validates its title', () => {
    assert.deepEqual(validatePrBody('', { draft: true }), []);
    assert.equal(validatePullRequest({ title: 'work in progress', body: '', draft: true }).length, 1);
  });

  it('requires meaningful ready-for-review sections', () => {
    assert.deepEqual(validatePrBody(validBody, { draft: false }), []);
    assert.match(validatePrBody('## Summary\n<!-- empty -->', { draft: false })[0], /Motivation|Summary/u);
    assert.match(
      validatePrBody(validBody.replace('## Platform coverage', '## Other'), { draft: false }).join('\n'),
      /Platform coverage/u,
    );
  });

  it('reads a ready pull request event with a CRLF body', () => {
    assert.deepEqual(runWithTemporaryEvent({
      title: 'ci: validate pull request event',
      body: validBody.replaceAll('\n', '\r\n'),
      draft: false,
    }), []);
  });

  it('reads a Draft pull request event without requiring a structured body', () => {
    assert.deepEqual(runWithTemporaryEvent({
      title: 'ci: validate draft pull request event',
      body: 'Work in progress.',
      draft: true,
    }), []);
  });
});
```

- [ ] **Step 2: 运行测试确认缺少模块**

Run: `node --test scripts/github/pr-policy.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `pr-policy.mjs`.

- [ ] **Step 3: 实现最小 PR policy**

Create `scripts/github/pr-policy.mjs` with:

```js
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const titlePattern = /^(?:feat|fix|docs|refactor|test|build|ci|chore|perf|revert)(?:\([a-z0-9]+(?:-[a-z0-9]+)*\))?: \S.+$/u;
const requiredSections = [
  'Summary',
  'Motivation',
  'Scope',
  'Validation',
  'Platform coverage',
  'Risk and rollback',
];

function stripComments(value) {
  return value.replace(/<!--[\s\S]*?-->/gu, '').trim();
}

function readSection(body, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const match = body.match(new RegExp(`^## ${escaped}\\s*$([\\s\\S]*?)(?=^## |$)`, 'mu'));
  return match ? stripComments(match[1]) : '';
}

export function validatePrTitle(title) {
  return titlePattern.test(String(title || ''))
    ? []
    : ['PR title must match type(scope): summary with a supported lowercase type and scope.'];
}

export function validatePrBody(body, { draft = false } = {}) {
  if (draft) return [];
  return requiredSections
    .filter((heading) => !readSection(String(body || ''), heading))
    .map((heading) => `PR body section "${heading}" must contain real evidence.`);
}

export function validatePullRequest(pullRequest) {
  return [
    ...validatePrTitle(pullRequest?.title),
    ...validatePrBody(pullRequest?.body, { draft: Boolean(pullRequest?.draft) }),
  ];
}

export function runFromEvent(eventPath = process.env.GITHUB_EVENT_PATH) {
  if (!eventPath) throw new Error('GITHUB_EVENT_PATH is required');
  const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
  const errors = validatePullRequest(event.pull_request);
  for (const error of errors) console.error(`::error::${error}`);
  if (errors.length > 0) process.exitCode = 1;
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runFromEvent();
```

- [ ] **Step 4: 运行测试**

Run: `node --test scripts/github/pr-policy.test.mjs`

Expected: PASS.

- [ ] **Step 5: 提交 PR policy**

```bash
git add scripts/github/pr-policy.mjs scripts/github/pr-policy.test.mjs
git commit -m "feat: validate pull request evidence"
```

### Task 6: Axhub Make 路径分类（TDD）

**Files:**
- Create: `scripts/github/changed-areas.mjs`
- Create: `scripts/github/changed-areas.test.mjs`

**Interfaces:**
- Produces: `parseNameStatus(output): string[]`、`classifyChangedPaths(paths): string[]`、`matrixForAreas(areas): { include: { area: string }[] }`。
- Consumes: `git diff --name-status -z BASE_SHA...HEAD_SHA`。

- [ ] **Step 1: 写失败测试**

Create `scripts/github/changed-areas.test.mjs` with cases for:

```js
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { classifyChangedPaths, matrixForAreas, parseNameStatus } from './changed-areas.mjs';

describe('Axhub Make changed areas', () => {
  it('classifies public repository paths without Runtime workspace names', () => {
    assert.deepEqual(classifyChangedPaths(['README.md']), ['docs']);
    assert.deepEqual(classifyChangedPaths(['src/server/http.ts']), ['server']);
    assert.deepEqual(classifyChangedPaths(['src/index/app/IndexPage.tsx']), ['admin']);
    assert.deepEqual(classifyChangedPaths(['client/src/main.tsx']), ['client']);
    assert.deepEqual(classifyChangedPaths(['scripts/release-make.mjs']), ['release']);
    assert.deepEqual(classifyChangedPaths(['vendor/axhub-commentary/dist/index.js']), ['shared']);
    assert.deepEqual(classifyChangedPaths(['package.json']), ['release', 'shared']);
  });

  it('uses conservative shared checks for unknown code paths', () => {
    assert.deepEqual(classifyChangedPaths(['future-runtime/entry.ts']), ['shared']);
  });

  it('keeps both sides of rename records', () => {
    const paths = parseNameStatus('R100\0src/server/old.ts\0src/index/new.tsx\0');
    assert.deepEqual(paths, ['src/server/old.ts', 'src/index/new.tsx']);
    assert.deepEqual(classifyChangedPaths(paths), ['admin', 'server']);
  });

  it('keeps the path from deletion records', () => {
    assert.deepEqual(parseNameStatus('D\0client/src/removed.tsx\0'), [
      'client/src/removed.tsx',
    ]);
  });

  it('keeps both sides of copy records', () => {
    assert.deepEqual(
      parseNameStatus('C100\0src/server/source.ts\0src/index/copied.tsx\0'),
      ['src/server/source.ts', 'src/index/copied.tsx'],
    );
  });

  it('rejects malformed or truncated records', () => {
    assert.throws(() => parseNameStatus('M\0'), /Malformed git name-status record: M/u);
    assert.throws(
      () => parseNameStatus('C100\0src/server/source.ts\0'),
      /Malformed git name-status record: C100/u,
    );
  });

  it('returns a deterministic GitHub matrix', () => {
    assert.deepEqual(matrixForAreas(['server', 'docs']), {
      include: [{ area: 'docs' }, { area: 'server' }],
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test scripts/github/changed-areas.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: 实现结构化 name-status 解析和路径映射**

Create `scripts/github/changed-areas.mjs`:

```js
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const mappings = [
  ['docs', /^(?:\.github\/|README\.md$|CONTRIBUTING\.md$|CODE_OF_CONDUCT\.md$|SECURITY\.md$|LICENSE$|docs\/|scripts\/github\/)/u],
  ['server', /^(?:bin\/|src\/server\/|src\/common\/|tsconfig\.node\.json$)/u],
  ['admin', /^(?:src\/(?:index|components|styles|data|dev-template|spec-template|canvas-template|html-template)\/|vite(?:\.axure-export)?\.config\.ts$|vitest\.config\.ts$)/u],
  ['client', /^client\//u],
  ['release', /^(?:scripts\/release-|package\.json$)/u],
  ['shared', /^(?:vendor\/|package\.json$|pnpm-lock\.yaml$|pnpm-workspace\.yaml$|vendor-packages\.config\.json$|tsconfig\.json$)/u],
];

export function parseNameStatus(output) {
  const fields = output.split('\0');
  if (fields.at(-1) === '') fields.pop();

  const paths = [];
  for (let index = 0; index < fields.length;) {
    const status = fields[index++];
    const pathCount = /^[RC]/u.test(status) ? 2 : 1;
    if (index + pathCount > fields.length) {
      throw new Error(`Malformed git name-status record: ${status}`);
    }
    paths.push(...fields.slice(index, index + pathCount));
    index += pathCount;
  }
  return paths;
}

export function classifyChangedPaths(paths) {
  if (paths.length === 0) return ['docs'];

  const areas = new Set();
  for (const filePath of paths) {
    let matched = false;
    for (const [area, pattern] of mappings) {
      if (!pattern.test(filePath)) continue;
      areas.add(area);
      matched = true;
    }
    if (!matched) areas.add('shared');
  }
  return [...areas].sort();
}

export function matrixForAreas(areas) {
  const normalized = areas.length === 0 ? ['docs'] : [...new Set(areas)].sort();
  return { include: normalized.map((area) => ({ area })) };
}

export function changedPathsFromGit(baseSha, headSha) {
  if (!baseSha || !headSha) throw new Error('AXHUB_BASE_SHA and AXHUB_HEAD_SHA are required');
  const output = execFileSync(
    'git',
    ['diff', '--name-status', '-z', `${baseSha}...${headSha}`],
    { encoding: 'utf8', shell: false },
  );
  return parseNameStatus(output);
}

export function runFromEnvironment(env = process.env) {
  const paths = changedPathsFromGit(env.AXHUB_BASE_SHA, env.AXHUB_HEAD_SHA);
  const matrix = matrixForAreas(classifyChangedPaths(paths));
  process.stdout.write(`matrix=${JSON.stringify(matrix)}\n`);
  return matrix;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runFromEnvironment();
}
```

This implementation allows a path to select multiple areas, treats unknown paths conservatively as `shared`, keeps both sides of rename/copy records, and guarantees a non-empty matrix without evaluating shell input.

- [ ] **Step 4: 运行测试并提交**

```bash
node --test scripts/github/changed-areas.test.mjs
git add scripts/github/changed-areas.mjs scripts/github/changed-areas.test.mjs
git commit -m "feat: classify Axhub Make CI changes"
```

Expected: tests PASS; commit contains no Axhub Runtime package mapping.

### Task 7: 区域检查调度器（TDD）

**Files:**
- Create: `scripts/github/run-area-check.mjs`
- Create: `scripts/github/run-area-check.test.mjs`

**Interfaces:**
- Produces: `commandsForArea(area): { command: string, args: string[] }[]`、`runAreaChecks(area, options): void`。
- Consumes: Task 6 area names `docs|server|admin|client|release|shared`。

- [ ] **Step 1: 写失败测试**

Create `scripts/github/run-area-check.test.mjs`:

```js
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { commandsForArea, runAreaChecks } from './run-area-check.mjs';

describe('Axhub Make area checks', () => {
  it('keeps documentation changes lightweight', () => {
    assert.deepEqual(commandsForArea('docs'), []);
  });

  it('uses existing checks for each product area', () => {
    assert.deepEqual(commandsForArea('server'), [
      { command: 'pnpm', args: ['server:build'] },
      { command: 'pnpm', args: ['server:test'] },
    ]);
    assert.deepEqual(commandsForArea('client'), [
      { command: 'pnpm', args: ['client:typecheck'] },
      { command: 'pnpm', args: ['client:build'] },
    ]);
    assert.deepEqual(commandsForArea('release'), [
      { command: 'node', args: ['--test', 'scripts/release-make.test.mjs', 'scripts/release-make-mirror-gitee.test.mjs'] },
      { command: 'pnpm', args: ['build'] },
    ]);
    assert.deepEqual(commandsForArea('shared'), [
      { command: 'pnpm', args: ['build'] },
      { command: 'pnpm', args: ['test', '--maxWorkers=1'] },
    ]);
  });

  it('never schedules publish or a real release', () => {
    for (const area of ['docs', 'server', 'admin', 'client', 'release', 'shared']) {
      const serialized = JSON.stringify(commandsForArea(area));
      assert.doesNotMatch(serialized, /publish|release:make(?=["'])/u);
    }
  });

  it('rejects an unknown matrix value instead of executing it', () => {
    assert.throws(() => commandsForArea('shell-input'), /Unsupported CI area/u);
  });

  it('uses argument arrays and verifies that checks leave no tracked diff', () => {
    const calls = [];
    runAreaChecks('docs', {
      platform: 'linux',
      spawn: (command, args, options) => {
        calls.push({ command, args, options });
        return { status: 0 };
      },
    });
    assert.deepEqual(calls, [{
      command: 'git',
      args: ['diff', '--exit-code', '--', '.'],
      options: { stdio: 'inherit', shell: false },
    }]);
  });

  it('uses pnpm.cmd on Windows and propagates a failing status', () => {
    const calls = [];
    assert.throws(
      () => runAreaChecks('server', {
        platform: 'win32',
        spawn: (command, args) => {
          calls.push({ command, args });
          return { status: 23 };
        },
      }),
      (error) => error.exitCode === 23,
    );
    assert.deepEqual(calls, [{ command: 'pnpm.cmd', args: ['server:build'] }]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test scripts/github/run-area-check.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: 实现无 shell 字符串的命令计划**

Create `scripts/github/run-area-check.mjs`:

```js
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const commandPlans = Object.freeze({
  docs: [],
  server: [
    { command: 'pnpm', args: ['server:build'] },
    { command: 'pnpm', args: ['server:test'] },
  ],
  admin: [
    { command: 'pnpm', args: ['admin:build'] },
    { command: 'pnpm', args: ['exec', 'vitest', 'run', 'src/index'] },
  ],
  client: [
    { command: 'pnpm', args: ['client:typecheck'] },
    { command: 'pnpm', args: ['client:build'] },
  ],
  release: [
    { command: 'node', args: ['--test', 'scripts/release-make.test.mjs', 'scripts/release-make-mirror-gitee.test.mjs'] },
    { command: 'pnpm', args: ['build'] },
  ],
  shared: [
    { command: 'pnpm', args: ['build'] },
    { command: 'pnpm', args: ['test', '--maxWorkers=1'] },
  ],
});

export function commandsForArea(area) {
  if (!Object.hasOwn(commandPlans, area)) throw new Error(`Unsupported CI area: ${area}`);
  const plan = commandPlans[area];
  return plan.map(({ command, args }) => ({ command, args: [...args] }));
}

const resolveCommand = (command, platform) => (
  platform === 'win32' && command === 'pnpm' ? 'pnpm.cmd' : command
);

export function runAreaChecks(
  area,
  { spawn = spawnSync, platform = process.platform } = {},
) {
  const commands = [
    ...commandsForArea(area),
    { command: 'git', args: ['diff', '--exit-code', '--', '.'] },
  ];

  for (const { command, args } of commands) {
    const resolvedCommand = resolveCommand(command, platform);
    const result = spawn(resolvedCommand, args, { stdio: 'inherit', shell: false });
    if (result.error) throw result.error;
    if (result.status === 0) continue;

    const error = new Error(`${resolvedCommand} exited with status ${result.status ?? 1}`);
    error.exitCode = result.status ?? 1;
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: run-area-check.mjs <area>');
    runAreaChecks(process.argv[2]);
  } catch (error) {
    console.error(error.message);
    process.exitCode = Number.isInteger(error.exitCode) ? error.exitCode : 1;
  }
}
```

The final `git diff --exit-code -- .` detects writes from vendor or generation checks. The script reports the dirty tree as a failure and never commits, pushes, publishes, or deploys anything.

The standalone client test suite is deliberately deferred from required CI because unchanged `main` currently has 4 failing files and 7 failing assertions in that suite. This is baseline debt, not a passing check or a permanent exemption: restore `pnpm --filter @axhub/make-client test` to the client/shared required plans as soon as its standalone baseline is green. Client typecheck/build and root build/test remain required.

- [ ] **Step 4: 运行测试并提交**

```bash
node --test scripts/github/run-area-check.test.mjs
git add scripts/github/run-area-check.mjs scripts/github/run-area-check.test.mjs
git commit -m "feat: run bounded Axhub Make CI checks"
```

Expected: tests PASS; the source contains no `shell: true`, publish command, release command, network credential, or dynamic command string.

### Task 8: GitHub Actions 合约与 workflows（TDD）

**Files:**
- Create: `scripts/github/workflow-contract.test.mjs`
- Create: `scripts/github/branch-protection.json`
- Create: `.github/workflows/pr-policy.yml`
- Create: `.github/workflows/ci.yml`
- Modify: `package.json`

**Interfaces:**
- Consumes: Tasks 5-7 CLIs and package scripts。
- Produces: required check names `pr-policy` and `ci-required`。

- [ ] **Step 1: 增加自动化测试命令并写失败的 workflow 合约测试**

Add to `package.json`:

```json
{
  "github:automation:test": "node --test scripts/github/pr-policy.test.mjs scripts/github/changed-areas.test.mjs scripts/github/run-area-check.test.mjs scripts/github/workflow-contract.test.mjs",
  "github:test": "pnpm github:community:test && pnpm github:automation:test"
}
```

Create `scripts/github/workflow-contract.test.mjs` using `yaml.parse` to assert:

```js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';
import { parse } from 'yaml';

const load = (path) => parse(fs.readFileSync(path, 'utf8'));

describe('GitHub workflow security contract', () => {
  it('uses read-only pull_request workflows with stable check names', () => {
    const policy = load('.github/workflows/pr-policy.yml');
    const ci = load('.github/workflows/ci.yml');
    for (const workflow of [policy, ci]) {
      assert.ok(workflow.on.pull_request);
      assert.equal(workflow.on.pull_request_target, undefined);
      assert.deepEqual(workflow.permissions, { contents: 'read' });
    }
    assert.ok(policy.on.pull_request.types.includes('converted_to_draft'));
    assert.equal(policy.jobs.policy.name, 'pr-policy');
    assert.equal(ci.jobs.required.name, 'ci-required');
  });

  it('pins every action and contains no release, publish, or secret access', () => {
    const source = [
      fs.readFileSync('.github/workflows/pr-policy.yml', 'utf8'),
      fs.readFileSync('.github/workflows/ci.yml', 'utf8'),
    ].join('\n');
    for (const uses of source.matchAll(/uses:\s*[^@\s]+@([^\s]+)/gu)) {
      assert.match(uses[1], /^[a-f0-9]{40}$/u);
    }
    assert.doesNotMatch(source, /pull_request_target|secrets\.|npm publish|pnpm publish|release:make/u);
  });

  it('keeps single-maintainer branch protection reproducible', () => {
    const protection = JSON.parse(fs.readFileSync('scripts/github/branch-protection.json', 'utf8'));
    assert.deepEqual(protection.required_status_checks.contexts, ['pr-policy', 'ci-required']);
    assert.equal(protection.required_pull_request_reviews.required_approving_review_count, 0);
    assert.equal(protection.required_conversation_resolution, true);
    assert.equal(protection.allow_force_pushes, false);
    assert.equal(protection.allow_deletions, false);
  });
});
```

- [ ] **Step 2: 运行完整自动化测试，确认缺少 workflows 时失败**

Run: `pnpm github:automation:test`

Expected: FAIL with `ENOENT` for `.github/workflows/pr-policy.yml`.

- [ ] **Step 3: 创建 pr-policy workflow**

Use these pinned Actions:

- `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1` (`v7.0.1`)
- `actions/setup-node@820762786026740c76f36085b0efc47a31fe5020` (`v7.0.0`)

Create `.github/workflows/pr-policy.yml` with:

```yaml
name: PR policy
on:
  pull_request:
    branches:
      - main
    types:
      - opened
      - edited
      - synchronize
      - reopened
      - ready_for_review
      - converted_to_draft
permissions:
  contents: read
concurrency:
  group: pr-policy-${{ github.event.pull_request.number }}
  cancel-in-progress: true
jobs:
  policy:
    name: pr-policy
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020
        with:
          node-version: "22"
      - run: node scripts/github/pr-policy.mjs
```

- [ ] **Step 4: 创建只读路径感知 CI**

Also pin `pnpm/action-setup@0977fd99725f1db4007ccb2928dbb4e90d06cc86` (`v6.0.10`) with `version: 10.20.0`.

Create `.github/workflows/ci.yml`:

```yaml
name: Axhub Make CI
on:
  pull_request:
    branches:
      - main
    types:
      - opened
      - synchronize
      - reopened
      - ready_for_review
  push:
    branches:
      - main
permissions:
  contents: read
concurrency:
  group: axhub-make-ci-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true
jobs:
  prepare:
    name: prepare-ci-matrix
    runs-on: ubuntu-latest
    timeout-minutes: 10
    outputs:
      matrix: ${{ steps.classify.outputs.matrix }}
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
        with:
          fetch-depth: 0
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020
        with:
          node-version: "22"
      - id: classify
        env:
          AXHUB_BASE_SHA: ${{ github.event.pull_request.base.sha || github.event.before }}
          AXHUB_HEAD_SHA: ${{ github.event.pull_request.head.sha || github.sha }}
        run: node scripts/github/changed-areas.mjs >> "$GITHUB_OUTPUT"

  baseline:
    name: governance-baseline
    runs-on: ubuntu-latest
    timeout-minutes: 10
    env:
      AXHUB_BASE_SHA: ${{ github.event.pull_request.base.sha || github.event.before }}
      AXHUB_HEAD_SHA: ${{ github.event.pull_request.head.sha || github.sha }}
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
        with:
          fetch-depth: 0
      - uses: pnpm/action-setup@0977fd99725f1db4007ccb2928dbb4e90d06cc86
        with:
          version: 10.20.0
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020
        with:
          node-version: "22"
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm github:test
      - run: pnpm audit:open-source
      - run: git diff --check "$AXHUB_BASE_SHA...$AXHUB_HEAD_SHA"

  area-checks:
    name: area-${{ matrix.area }}
    needs: prepare
    runs-on: ubuntu-latest
    timeout-minutes: 30
    strategy:
      fail-fast: false
      matrix: ${{ fromJSON(needs.prepare.outputs.matrix) }}
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
        with:
          fetch-depth: 0
      - uses: pnpm/action-setup@0977fd99725f1db4007ccb2928dbb4e90d06cc86
        with:
          version: 10.20.0
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020
        with:
          node-version: "22"
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: node scripts/github/run-area-check.mjs "${{ matrix.area }}"

  required:
    name: ci-required
    if: always()
    needs:
      - prepare
      - baseline
      - area-checks
    runs-on: ubuntu-latest
    timeout-minutes: 5
    env:
      PREPARE_RESULT: ${{ needs.prepare.result }}
      BASELINE_RESULT: ${{ needs.baseline.result }}
      AREA_RESULT: ${{ needs.area-checks.result }}
    steps:
      - name: Require every CI stage to pass
        shell: bash
        run: |
          test "$PREPARE_RESULT" = success
          test "$BASELINE_RESULT" = success
          test "$AREA_RESULT" = success
```

Create `scripts/github/branch-protection.json` so the later external mutation uses reviewed, versioned input:

```json
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["pr-policy", "ci-required"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": false,
    "require_code_owner_reviews": false,
    "require_last_push_approval": false,
    "required_approving_review_count": 0
  },
  "restrictions": null,
  "required_conversation_resolution": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "lock_branch": false,
  "allow_fork_syncing": true
}
```

The required summary only inspects upstream job results. No job references `secrets`, publishes packages, creates releases, deploys, commits, pushes, or writes repository state.

These repository-defined checks are quality guardrails, not an independent security boundary. A PR can modify the workflow definition and the scripts it executes, so the maintainer must inspect changes to workflows, policy/check scripts, and branch-protection input before merge. Keep the workflows read-only and secret-free; do not replace this review boundary with `pull_request_target`, write permissions, required approvals, or a partial base-checkout workaround that still leaves the workflow definition PR-controlled.

- [ ] **Step 5: 运行 workflow 合约和全部治理测试**

Run:

```bash
pnpm github:test
pnpm audit:open-source
```

Expected: PASS. The workflow contract confirms read-only permissions, no `pull_request_target`, no secret access, full SHA pins, and stable check names.

- [ ] **Step 6: 提交 workflows**

```bash
git add .github/workflows scripts/github/workflow-contract.test.mjs scripts/github/branch-protection.json package.json
git commit -m "ci: add bounded Axhub Make pull request checks"
```

### Task 9: 自动化全量验证与第二个 PR

**Files:**
- Verify only; no new file.

**Interfaces:**
- Consumes: merged Phase A main and Tasks 5-8。
- Produces: 已在 GitHub 上真实运行 `pr-policy`/`ci-required` 的 PR；Task 10 在它合并前不得执行。

- [ ] **Step 1: 确认自动化分支基线**

```bash
git branch --show-current
git merge-base --is-ancestor origin/main HEAD
git status --short
```

Expected: branch is `codex/github-governance-ci`; origin/main is an ancestor; status is clean before automation edits.

- [ ] **Step 2: 在自动化 worktree 执行 Tasks 5-8 的 commits**

Apply only the automation commits/files. Do not copy unrelated files from the original dirty checkout.

- [ ] **Step 3: 运行新脚本和现有高风险边界**

Run:

```bash
pnpm install --frozen-lockfile
pnpm github:test
pnpm audit:open-source
node scripts/github/run-area-check.mjs shared
node scripts/github/run-area-check.mjs client
node scripts/github/run-area-check.mjs release
git diff --check origin/main...HEAD
git status --short
```

Expected:

- all commands exit 0;
- `shared` runs root `pnpm build` and the unchanged root suite through `pnpm test --maxWorkers=1`; limiting Vitest concurrency avoids resource contention after the full client build without removing coverage or assertions;
- `client` runs only `pnpm client:typecheck` and `pnpm client:build`;
- the standalone `pnpm --filter @axhub/make-client test` suite is not claimed as passing or required while unchanged `main` still has 4 failing files and 7 failing assertions; restore it to required CI once that baseline is green;
- shared/client/release checks do not publish or contact production;
- vendor sync leaves the tracked tree clean;
- status is clean after committed changes.

- [ ] **Step 4: 创建 Draft PR 并观察真实 Actions**

Only after explicit user approval:

Create ignored `.local/github-governance/automation-pr-body.md` with `apply_patch` and this exact body. Change a validation bullet to `Not run` only if that command did not actually pass; do not claim unexecuted checks.

```markdown
## Summary

Adds bounded PR policy and path-aware CI for the standalone Axhub Make repository.

## Motivation

Pull requests need consistent evidence and the smallest relevant checks before main is protected.

## Scope

GitHub policy modules, their tests, two read-only workflows, and versioned branch-protection input. No runtime, API, Admin UI, client template, vendor implementation, or release behavior changes.

## Validation

- `pnpm install --frozen-lockfile` - passed
- `pnpm github:test` - passed
- `pnpm audit:open-source` - passed
- `node scripts/github/run-area-check.mjs shared` - passed
- `node scripts/github/run-area-check.mjs client` - passed
- `node scripts/github/run-area-check.mjs release` - passed
- `git diff --check origin/main...HEAD` - passed
- Standalone client tests are deferred from required CI because unchanged `main` currently has 4 failing files and 7 failing assertions; they were not reported as passing and must return to required CI after the baseline is green.

## Platform coverage

GitHub-hosted Ubuntu is covered by Actions. Command execution uses argument arrays and resolves `pnpm.cmd` on Windows; no product runtime behavior changed.

## Risk and rollback

The workflows are read-only, receive no secrets, and never publish, release, deploy, commit, or push. They are quality guardrails rather than an independent security boundary because this PR can change workflow definitions and check scripts; the maintainer must review those changes before merge. A false positive can block a PR after branch protection is enabled; revert this PR or temporarily remove only the affected required check to roll back.

## Vendor and release impact

No vendor source or release implementation changes. Release-area CI runs only existing unit tests and never invokes a real release command.

## Visual evidence

Not applicable. GitHub Actions logs and stable check names are the review evidence.

## Documentation impact

The approved governance design and implementation plan describe the policy and rollout.

## Related issue

The Phase B governance rollout Issue will be linked after PR creation. Do not use `Closes` until branch protection verification is complete.

## Author checklist

- [x] The PR has one focused goal.
- [x] The complete diff was reviewed.
- [x] Exact validation evidence and remaining external-setting steps are listed.
- [x] Cross-platform command execution has a regression test.
- [x] No secret, production credential, local path, runtime data, publish, release, or deploy action is included.
```

```bash
git push -u origin codex/github-governance-ci
gh pr create \
  --repo lintendo/Axhub-Make \
  --base main \
  --head codex/github-governance-ci \
  --draft \
  --title "ci: add bounded Axhub Make pull request checks" \
  --body-file .local/github-governance/automation-pr-body.md
```

Expected on GitHub:

- `pr-policy` appears and passes with a completed PR body.
- `ci-required` appears and reflects baseline plus matrix jobs.
- no job has write permission or access to repository secrets.
- no release, package publication, deployment, or auto-commit occurs.
- the maintainer reviews all workflow, policy/check script, and branch-protection changes before merge instead of treating required checks as tamper-proof.

- [ ] **Step 5: Negative verification**

Temporarily edit the Draft PR title to `update checks` and confirm `pr-policy` fails. Restore the valid title and confirm it passes. Do not alter source code for this check.

- [ ] **Step 6: Review and merge checkpoint**

Stop until the user reviews the workflow source and Actions logs. Mark Ready and squash-merge only after both stable checks succeed. Do not configure branch protection before this point.

## Phase D: 主分支保护与合并设置

### Task 10: 应用并验证 GitHub 保护规则

**Files:**
- External GitHub state.
- Consume tracked desired-state input: `scripts/github/branch-protection.json`.

**Interfaces:**
- Consumes: merged automation PR with observed check names `pr-policy` and `ci-required`。
- Produces: squash-only merge settings and protected `main`。

- [ ] **Step 1: 只读记录设置快照**

Run:

```bash
gh api repos/lintendo/Axhub-Make --jq '{visibility,default_branch,has_issues,allow_squash_merge,allow_merge_commit,allow_rebase_merge,allow_auto_merge,delete_branch_on_merge}'
mkdir -p .local/github-governance
gh api repos/lintendo/Axhub-Make > .local/github-governance/repository-settings-before.json
gh api repos/lintendo/Axhub-Make/branches/main/protection
automation_pr_number="$(gh pr list --repo lintendo/Axhub-Make --state merged --head codex/github-governance-ci --json number --jq '.[0].number')"
test -n "$automation_pr_number"
gh pr checks "$automation_pr_number" --repo lintendo/Axhub-Make --watch
```

Expected: target is public Axhub Make; both exact check names have succeeded. The protection request should return 404 because no rule exists yet; any other error or an existing protection rule is a stop condition for review. Record outputs in the execution transcript and ask for explicit user confirmation before mutation.

- [ ] **Step 2: 复核仓库内 branch protection 期望状态**

Read tracked `scripts/github/branch-protection.json`:

```json
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["pr-policy", "ci-required"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": false,
    "require_code_owner_reviews": false,
    "require_last_push_approval": false,
    "required_approving_review_count": 0
  },
  "restrictions": null,
  "required_conversation_resolution": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "lock_branch": false,
  "allow_fork_syncing": true
}
```

Expected: the file is unchanged from the reviewed automation PR and contains no account, team, bypass actor, or secret identifier.

- [ ] **Step 3: 设置 squash-only 和自动删分支**

Run:

```bash
gh api --method PATCH repos/lintendo/Axhub-Make \
  -F allow_squash_merge=true \
  -F allow_merge_commit=false \
  -F allow_rebase_merge=false \
  -F delete_branch_on_merge=true
```

Expected: repository visibility, Issues, releases and packages remain unchanged.

- [ ] **Step 4: 启用 main 保护**

Run:

```bash
gh api --method PUT repos/lintendo/Axhub-Make/branches/main/protection \
  -H "Accept: application/vnd.github+json" \
  --input scripts/github/branch-protection.json
```

If GitHub rejects `required_approving_review_count: 0`, stop and report the API response. Do not silently raise the count to 1, because that would lock a single-maintainer repository.

- [ ] **Step 5: 读取验证并检查无运行时影响**

Run:

```bash
gh api repos/lintendo/Axhub-Make --jq '{visibility,has_issues,allow_squash_merge,allow_merge_commit,allow_rebase_merge,delete_branch_on_merge}'
gh api repos/lintendo/Axhub-Make/branches/main/protection
```

Expected:

- visibility remains `public`;
- Issues remain enabled;
- squash is true, merge commit/rebase are false, delete branch is true;
- required contexts are exactly `pr-policy` and `ci-required`;
- required approvals are 0;
- conversation resolution is required;
- force push and deletion are disabled.

If Step 4 or Step 5 fails after mutation, stop and roll back the settings applied by this task. This rollback is valid only because Step 1 confirmed that `main` had no previous protection rule:

```bash
gh api --method DELETE repos/lintendo/Axhub-Make/branches/main/protection
jq '{allow_squash_merge, allow_merge_commit, allow_rebase_merge, delete_branch_on_merge}' \
  .local/github-governance/repository-settings-before.json \
  > .local/github-governance/repository-settings-rollback.json
gh api --method PATCH repos/lintendo/Axhub-Make \
  --input .local/github-governance/repository-settings-rollback.json
```

After rollback, rerun the two read-only queries from Step 5 and compare them with the Step 1 snapshot. Do not retry protection with weaker checks or a higher approval count without a new reviewed plan.

- [ ] **Step 6: 低风险保护规则验证**

Open a documentation-only PR that changes no application or package file. Confirm:

- direct merge is blocked until `pr-policy` and `ci-required` pass;
- no approval from a second maintainer is required;
- squash merge works after checks pass;
- the source branch is deleted automatically;
- the published npm package and running Axhub Make are untouched.

- [ ] **Step 7: 完成跟踪 Issue**

Update the Phase B governance tracking Issue with links to both merged PRs and the verified protection settings. Close it only after the low-risk PR in Step 6 succeeds.

## Phase E: 两周复盘

### Task 11: 观察并只修复实际摩擦

**Files:**
- Modify only when evidence shows a problem: Issue Forms、PR template、path mappings、check command plans。

**Interfaces:**
- Consumes: 3-5 个真实 Issue/PR 或两周数据。
- Produces: 一份短复盘评论或 Issue，不引入新机器人。

- [ ] **Step 1: 记录四项指标**

Record in the governance tracking Issue:

- Issue 首次提交是否包含版本、系统、入口和复现信息。
- 五个工作日内首次分诊是否可持续。
- PR policy 是否反复误报空区块或合法标题。
- CI 中位耗时、误触发和漏测区域。

- [ ] **Step 2: 根据证据调整**

Only change a rule when a real Issue/PR demonstrates friction. Each adjustment uses a focused PR with a regression test in the corresponding `scripts/github/*.test.mjs` file.

- [ ] **Step 3: 明确不自动扩张**

Do not add Project、stale bot、Dependabot auto-merge、release automation、CODEOWNERS or required approval until the maintainer model or observed workload justifies them.

## Final Verification Checklist

- [ ] Axhub Make runtime/business source was not changed by the governance PRs.
- [ ] `pnpm install --frozen-lockfile` passes.
- [ ] `pnpm github:test` passes.
- [ ] `pnpm audit:open-source` passes.
- [ ] Required commands pass for every scheduled area; client requires typecheck/build and shared requires root build/test, while the known-red standalone client tests remain explicitly deferred until their baseline is green.
- [ ] Workflows have `contents: read`, no `pull_request_target`, no secret access, and no publish/release command.
- [ ] Issue Forms render after Issues are enabled.
- [ ] Private vulnerability reporting is enabled before public Issues accept security reports.
- [ ] `pr-policy` and `ci-required` are observed before branch protection requires them.
- [ ] Required approvals remain 0 in single-maintainer mode.
- [ ] Repository visibility remains Public and existing releases/packages are unchanged.
- [ ] All external-state before/after outputs are recorded for rollback.
