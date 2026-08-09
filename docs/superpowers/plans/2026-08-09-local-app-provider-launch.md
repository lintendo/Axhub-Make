# Local App Provider Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 精简本地应用菜单为七个入口，并实现已验证供应商注入、其他供应商携项目路径直启及主版/CN 回退。

**Architecture:** `agentTypes.ts` 定义六个本地应用供应商，Cursor 由 UI 作为唯一 IDE 入口插入。`OpenInDropdown.tsx` 通过显式可注入映射将 ChatGPT、WorkBuddy、TRAEWORK 和 Cursor 送入桌面集成协调器，其余本地应用调用通用直启 API；服务端可用性候选负责主版/CN 排序，启动命令负责把已解析应用和项目目录传给操作系统。

**Tech Stack:** React 18.2、TypeScript 5.x、Vitest、Node.js `child_process`、pnpm。

## Global Constraints

- 仅修改 `apps/axhub-make` 中与本地应用菜单和启动链路直接相关的文件。
- 使用 pnpm，不升级 `@lobehub/icons`，复用仓库已有 CodeBuddy SVG 资源。
- macOS 与 Windows 均使用 executable + args 数组，保持 `shell: false`。
- 保留菜单之外的 CLI/IDE API；只移除本菜单里的 CLI、更多和其他应用入口。
- 工作区已有用户改动；不得覆盖、重排或提交无关内容。目标文件已有改动时只追加本功能所需最小差异。

---

### Task 1: 本地应用类型、检测与直启命令

**Files:**
- Modify: `src/server/agentTypes.ts`
- Modify: `src/server/agentAvailability.ts`
- Modify: `src/server/agentOpen.ts`
- Create: `src/server/agentAvailability.test.ts`
- Modify: `src/server/__tests__/agent-open-api.test.ts`

**Interfaces:**
- Consumes: `LocalAppAgent`、`AgentAvailabilityInfo`、`buildLocalAppOpenCommandForPlatform`。
- Produces: `LocalAppAgent = codex | opencode | workbuddy | traework | qoderwork | trae`，以及 QoderWork/TRAE 的 direct-app 启动结果。

- [ ] **Step 1: 写失败测试，声明供应商与路径优先级**

  在可用性测试中用 `vi.spyOn(fs, 'existsSync')` 模拟主版和 CN 同时存在，断言 TRAEWORK、QoderWork、TRAE 都选择主版；再仅让 CN 路径存在，断言自动选择 CN。

- [ ] **Step 2: 运行 RED 测试**

  Run: `pnpm exec vitest run src/server/agentAvailability.test.ts src/server/__tests__/agent-open-api.test.ts`

  Expected: `qoderwork` / `trae` 不属于 `LocalAppAgent`，候选与 direct-app 命令断言失败。

- [ ] **Step 3: 实现最小服务端能力**

  在 `LOCAL_APP_AGENT_OPTIONS` 和名称映射中增加：

  ```ts
  { value: 'qoderwork', label: 'QoderWork' },
  { value: 'trae', label: 'TRAE' },
  ```

  为三种带 CN 兼容的应用按主版在前写入 macOS/Windows 候选。将 `traework | qoderwork | trae` 归入 direct-app 命令：macOS 从 executable 路径还原 `.app` bundle 后执行 `open -a bundle directory`，其他平台执行 `resolvedExecutable directory`。OpenCode 保持 deeplink。

- [ ] **Step 4: 运行 GREEN 测试**

  Run: `pnpm exec vitest run src/server/agentAvailability.test.ts src/server/__tests__/agent-open-api.test.ts`

  Expected: 新增路径和启动命令测试全部通过。

- [ ] **Step 5: 审查差异**

  Run: `git diff -- src/server/agentTypes.ts src/server/agentAvailability.ts src/server/agentOpen.ts src/server/agentAvailability.test.ts src/server/__tests__/agent-open-api.test.ts`

  Expected: 仅包含六个本地供应商、候选顺序和 direct-app 行为；不包含 Agent Surface 实验适配器升级。

### Task 2: 七入口菜单、能力路由和统一图标

**Files:**
- Modify: `src/index/components/sidebar/OpenInDropdown.test.ts`
- Modify: `src/index/components/sidebar/OpenInDropdown.tsx`
- Modify: `src/index/components/sidebar/DesktopIntegrationRestartDialog.tsx`
- Modify: `src/index/services/api.ts`

**Interfaces:**
- Consumes: `LOCAL_APP_AGENT_OPTIONS`、`DesktopIntegrationProvider`、`codeBuddyIconUrl`、`qoderIconUrl`。
- Produces: 固定顺序的七入口菜单和 `Partial<Record<LocalAppAgent, DesktopIntegrationProvider>>` 可注入映射。

- [ ] **Step 1: 改写失败测试，声明精简菜单和路由**

  测试必须断言：

  ```ts
  expect(localAppOptions).toEqual(['codex', 'opencode', 'workbuddy', 'traework', 'qoderwork', 'trae']);
  expect(menuOrder).toEqual(['codex', 'opencode', 'workbuddy', 'traework', 'cursor', 'qoderwork', 'trae']);
  expect(source).not.toContain('renderCLIAgentSubmenu');
  expect(source).not.toContain('overflowLocalAppOpenOptions');
  expect(source).not.toContain('更多');
  ```

  同时断言 OpenCode、QoderWork、TRAE 走 `handleOpenWithLocalApp`，ChatGPT、WorkBuddy、TRAEWORK 和 Cursor 走 `handleIntegratedOpen`；WorkBuddy 使用 `codeBuddyIconUrl`，QoderWork 使用 `qoderIconUrl`，TRAEWORK/TRAE 使用 `Trae.Color`。

- [ ] **Step 2: 运行 RED 测试**

  Run: `pnpm exec vitest run src/index/components/sidebar/OpenInDropdown.test.ts src/index/services/api.test.ts`

  Expected: 旧菜单仍包含全部 IDE、更多和 CLI，OpenCode 仍被错误标记为桌面集成供应商，图标断言失败。

- [ ] **Step 3: 实现最小 UI 与类型改动**

  将 Cursor 作为常量插入六个 `LOCAL_APP_AGENT_OPTIONS` 的第四项之后。移除 `MAIN_IDE_OPTIONS.map`、折叠/更多逻辑和 CLI submenu 渲染；inline variant 同样只渲染七个入口，不追加“更多”。

  使用映射：

  ```ts
  const INTEGRATED_LOCAL_APP_PROVIDERS: Partial<Record<LocalAppAgent, DesktopIntegrationProvider>> = {
    codex: 'chatgpt',
    workbuddy: 'workbuddy',
    traework: 'traework',
  };
  ```

  映射命中时调用桌面集成，未命中时调用 `handleOpenWithLocalApp`。从前端 `DesktopIntegrationProvider` 和重启对话框标签中移除 OpenCode。

- [ ] **Step 4: 运行 GREEN 测试**

  Run: `pnpm exec vitest run src/index/components/sidebar/OpenInDropdown.test.ts src/index/services/api.test.ts`

  Expected: 菜单、路由、图标和 API 类型契约测试通过。

- [ ] **Step 5: 审查差异**

  Run: `git diff -- src/index/components/sidebar/OpenInDropdown.test.ts src/index/components/sidebar/OpenInDropdown.tsx src/index/components/sidebar/DesktopIntegrationRestartDialog.tsx src/index/services/api.ts`

  Expected: 菜单精简不删除底层 CLI/IDE API，也不引入新图标依赖。

### Task 3: 交叉验证与交付检查

**Files:**
- Verify: `src/server/agentTypes.ts`
- Verify: `src/server/agentAvailability.ts`
- Verify: `src/server/agentOpen.ts`
- Verify: `src/index/components/sidebar/OpenInDropdown.tsx`

**Interfaces:**
- Consumes: Task 1 和 Task 2 的完整行为。
- Produces: 可复现的测试、类型检查和构建证据。

- [ ] **Step 1: 运行所有聚焦测试**

  Run: `pnpm exec vitest run src/server/agentAvailability.test.ts src/server/__tests__/agent-open-api.test.ts src/index/components/sidebar/OpenInDropdown.test.ts src/index/services/api.test.ts src/server/__tests__/desktopIntegrationOpen.test.ts src/server/agentSurfaceIntegration.test.ts`

  Expected: 所有指定测试通过且无失败。

- [ ] **Step 2: 运行服务端类型检查**

  Run: `pnpm server:build`

  Expected: TypeScript 退出码 0。

- [ ] **Step 3: 运行前端管理端构建**

  Run: `pnpm admin:build`

  Expected: Vite 管理端与 Axure export 构建退出码 0。

- [ ] **Step 4: 检查需求与差异**

  Run: `git diff --check`

  Expected: 无空白错误。逐项确认七入口顺序、无 CLI/更多、四个已验证注入入口、三个直启入口、三组主版/CN 回退和三组统一图标。

- [ ] **Step 5: 保留用户工作区边界**

  Run: `git status --short -- src/server/agentTypes.ts src/server/agentAvailability.ts src/server/agentOpen.ts src/server/agentAvailability.test.ts src/server/__tests__/agent-open-api.test.ts src/index/components/sidebar/OpenInDropdown.test.ts src/index/components/sidebar/OpenInDropdown.tsx src/index/components/sidebar/DesktopIntegrationRestartDialog.tsx src/index/services/api.ts`

  Expected: 只报告本计划目标文件；由于这些文件含有用户既有未提交改动，不自动创建实现提交。
