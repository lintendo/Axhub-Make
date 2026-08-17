# Axhub Make

[![License](https://img.shields.io/github/license/lintendo/Axhub-Make)](https://github.com/lintendo/Axhub-Make/blob/main/LICENSE) [![npm version](https://img.shields.io/npm/v/%40axhub%2Fmake)](https://www.npmjs.com/package/@axhub/make) [![npm downloads](https://img.shields.io/npm/dm/%40axhub%2Fmake)](https://www.npmjs.com/package/@axhub/make)

> Axhub Make 不是“又一个 AI 生成页面工具”。
> 它是一条从 **需求分析** 到 **原型生成**、**批注微调**、**原型评审**，再到 **发布交付** 的 AI 产品工作流。

给产品、设计师、业务团队和 AI Agent 用。

你说清楚要什么，Make 会把它变成：

*   可以点击、可以评审、可以发布的交互原型
*   带批注、标注和业务说明的“活 PRD”
*   基于设计系统和专业技能生成的 UI/UX 方案
*   面向新手的免费教程和上手路径
*   可分享、可导出、可交付的原型成果

## 直接启动

运行：

```
npx -y @axhub/make@latest
```

启动后会自动打开管理页面。如果没有打开，复制终端里显示的地址到浏览器。

## 本地开发

管理端页面、服务端 API 和运行时注入必须通过完整开发服务器一起启动：

```bash
pnpm server:dev -- --host 127.0.0.1 --no-open
```

不要直接启动 Vite，也不要为浏览器验证创建独立的管理端前端服务；独立前端缺少 Make 服务端 API 和运行时注入，并会占用管理端口。

## CLI 启动与打开 AI 应用

默认命令在当前终端前台启动 Make 并打开管理页面。需要命令完成后继续在后台运行时，使用：

```bash
npx -y @axhub/make@latest --background
```

`open` 会启动或复用 Make，再打开指定 AI 应用、注入 Axhub Make 入口并立即激活：

```bash
npx -y @axhub/make@latest open codex
npx -y @axhub/make@latest open cursor
npx -y @axhub/make@latest open workbuddy
npx -y @axhub/make@latest open traework
npx -y @axhub/make@latest open qoderwork
```

这五个 App ID 是固定值。加上 `--background` 可让新建的 Make 服务在后台运行；`--no-open` 只禁止系统浏览器打开管理页面，不影响 AI 应用里的入口激活。

如果目标应用已经运行但没有可用的调试端点，交互式终端会先请求重启确认。自动化或非交互环境可以显式传入 `--restart`，Make 只会请求应用正常退出，不会静默强制结束进程。`--app-path <path>` 可为本次调用指定应用路径，不会持久化。

查看或停止当前用户的 Make Admin 服务：

```bash
npx -y @axhub/make@latest status
npx -y @axhub/make@latest stop
```

这套 `open` 流程是一次性启动与注入，不安装扩展、常驻 companion、LaunchAgent 或 Windows 计划任务。重复调用会更新并激活已有入口。

## 从 Make 打开本地 AI 应用

Make 左上角“打开 AI”菜单的指定目录启动统一委托给 `@axhub/agent-surface`。需要页面集成时，服务端只调用一次组合接口完成项目打开和入口注入：

| 应用 | 指定目录方式 | 当前边界 |
| --- | --- | --- |
| ChatGPT / Codex | Codex 应用命令或项目深链 | 支持 Agent Surface 入口注入 |
| Cursor Agents | 内置 desktop router 的 `--chat` 与目录参数 | 支持 Agent Surface 入口注入 |
| WorkBuddy | `workbuddy://task?action=start&cwd=...` 任务深链 | 支持 Agent Surface 入口注入 |
| TRAEWORK | 不支持自动传入目录；启动后手动选择 | 支持启动应用和 Agent Surface 入口注入，完成后提示手动选择目录 |
| OpenCode | `opencode://open-project?directory=...` 项目深链 | 仅打开目录，不注入入口 |
| QoderWork | QoderWork / QoderWork CN 应用的目录参数 | 支持打开目录并注入 Agent Surface 入口 |

QoderWork 在 macOS 通过 Launch Services 启动，Make 不申请或依赖辅助功能权限；如果 QoderWork 为自身的全局快捷键请求权限，提示应归因于 QoderWork 而不是 `node`。Windows 启动必须传入探测或已保存的应用路径，并始终使用参数数组与 `shell: false`；QoderWork 直启 `.exe`，TRAEWORK 启动或注入时都不会附加项目目录。Windows 原生安装包的实际冒烟验证仍需在 Windows 机器上完成。

## 让 AI 帮你启动

把下面这段发给你的 AI Agent，让它读取启动说明，然后帮你检查环境、启动 Make，并创建一个以后可以直接双击运行的桌面脚本：

```
请读取这个文档，并按里面的要求启动 Axhub Make：

https://raw.githubusercontent.com/lintendo/Axhub-Make/main/docs/start-axhub-make-with-ai.md
```

## 让 AI 指导你使用

把下面这段发给你的 AI Agent，让它读取使用指导，然后结合你当前的页面和项目指导你使用 Axhub Make：

```
请读取这个文档，并按里面的要求指导我使用 Axhub Make：

https://raw.githubusercontent.com/lintendo/Axhub-Make/main/docs/guide-users-with-axhub-make.md
```

## 产品流程

Axhub Make 把需求挖掘、Spec 对齐、设计规范、原型生成、批注编辑、AI 评审、交付标注和发布串成一条产品工作流。

### 生成：从需求挖掘到可运行原型

先通过需求挖掘把模糊想法拆成用户角色、业务目标、核心流程、页面结构和关键状态，再完成 Spec 对齐。生成时会自动匹配项目里的设计规范 Design，结合行业模板和组件风格，产出可点击、可预览、可继续编辑的交互原型。

<img src="assets/images/make-flow-create.png" alt="Axhub Make 生成原型界面" height="320">

### 编辑（批注）：在真实页面上下文里修改

团队可以直接在页面、模块或具体元素上留下修改意见。批注会成为 AI Agent 可读取的上下文，让文案、布局、状态、流程补充都围绕真实原型完成，不再散落在截图和聊天记录里。

<img src="assets/images/make-flow-comment.png" alt="Axhub Make 批注编辑界面" height="320">

### 评审：用 AI 评审发现产品问题

AI 评审会围绕当前原型、Spec、页面结构和业务流程，检查需求完整性、关键场景覆盖、交互自洽性、信息层级和遗漏状态。团队再基于 AI 扫出的问题做人工确认。

<img src="assets/images/make-flow-review.png" alt="Axhub Make AI 评审界面" height="320">

### 标注：把原型沉淀为可交付说明

将页面结构、组件说明、字段含义、交互规则、业务逻辑、状态变化和设计要求沉淀为标注。原型不只是能看、能点，也能作为研发、测试和业务验收可理解的交付说明。

<img src="assets/images/make-flow-annotation.png" alt="Axhub Make 标注交付界面" height="320">

### 发布：把原型变成可分享、可验收、可交付的产品资产

原型可以发布为在线链接，也可以导出 HTML、交付到 Figma，或通过 Axure 发布链路进入既有团队流程。发布后的成果可用于评审、演示、研发对齐和验收确认。

<img src="assets/images/make-flow-publish.png" alt="Axhub Make 发布交付菜单" height="320">

## 核心特点

### 支持主流 AI Agent

[![Codex](https://registry.npmmirror.com/@lobehub/icons-static-svg/latest/files/icons/codex-color.svg)](https://lobehub.com/icons/codex) [![Claude Code](https://registry.npmmirror.com/@lobehub/icons-static-svg/latest/files/icons/claudecode-color.svg)](https://lobehub.com/icons/claudecode) [![OpenCode](https://registry.npmmirror.com/@lobehub/icons-static-svg/latest/files/icons/opencode.svg)](https://lobehub.com/icons/opencode) [![Cursor](https://registry.npmmirror.com/@lobehub/icons-static-svg/latest/files/icons/cursor.svg)](https://lobehub.com/icons/cursor) [![Trae](https://registry.npmmirror.com/@lobehub/icons-static-svg/latest/files/icons/trae-color.svg)](https://lobehub.com/icons/trae) [![Qwen Code](https://registry.npmmirror.com/@lobehub/icons-static-svg/latest/files/icons/qwen-color.svg)](https://lobehub.com/icons/qwen) [![Qoder](https://registry.npmmirror.com/@lobehub/icons-static-svg/latest/files/icons/qoder-color.svg)](https://lobehub.com/icons/qoder) [![CodeBuddy](https://registry.npmmirror.com/@lobehub/icons-static-svg/latest/files/icons/codebuddy-color.svg)](https://lobehub.com/icons/codebuddy) [![Grok Build](https://registry.npmmirror.com/@lobehub/icons-static-svg/latest/files/icons/grok.svg)](https://lobehub.com/icons/grok) [![DeepSeek](https://registry.npmmirror.com/@lobehub/icons-static-svg/latest/files/icons/deepseek-color.svg)](https://lobehub.com/icons/deepseek) [![Kimi](https://registry.npmmirror.com/@lobehub/icons-static-svg/latest/files/icons/kimi-color.svg)](https://lobehub.com/icons/kimi) [![Doubao](https://registry.npmmirror.com/@lobehub/icons-static-svg/latest/files/icons/doubao-color.svg)](https://lobehub.com/icons/doubao) [![Yuanbao](https://registry.npmmirror.com/@lobehub/icons-static-svg/latest/files/icons/yuanbao-color.svg)](https://lobehub.com/icons/yuanbao) [![Windsurf](https://registry.npmmirror.com/@lobehub/icons-static-svg/latest/files/icons/windsurf.svg)](https://lobehub.com/icons/windsurf) [![Roo Code](https://registry.npmmirror.com/@lobehub/icons-static-svg/latest/files/icons/roocode.svg)](https://lobehub.com/icons/roocode) [![Antigravity](https://registry.npmmirror.com/@lobehub/icons-static-svg/latest/files/icons/antigravity-color.svg)](https://lobehub.com/icons/antigravity)

Axhub Make 可以和主流 Agent 一起工作，把产品需求、页面上下文、批注、标注和项目文件交给合适的 AI 工具处理。当前重点支持 Codex、Claude Code、OpenCode、Cursor、Qoder、CodeBuddy、Grok Build、DeepSeek / Reasonix 等 Agent 形态，同时覆盖 Trae、Qwen Code、Windsurf、Roo Code、Antigravity 以及 Kimi、Doubao、Yuanbao 等国内常用 AI 工具链。

团队可以按习惯选择工具，同时把产物沉淀在同一个 Make 项目中。

### 支持多平台资源导入

Axhub Make 支持从多种平台和格式导入原型资源，包括 Axhub Make ZIP 包、Google Stitch、Axure HTML 原型、Figma Make、V0 App、Google AI Studio 等来源。外部工具产出的页面、工程包和设计资源，可以带回 Make 继续整理、编辑、批注、评审和发布。

团队可以从不同工具起步，最终在同一个工作台里完成原型管理和交付。

### IMAGE2 UI/UX 工作流

Axhub Make 支持 IMAGE2 UI/UX 工作流：先生成高质量 UI 设计稿，再还原为可运行、可交互、可继续编辑的原型，用于评审、标注、发布和开发对齐。

### 团队协作、版本管理和移动办公

Axhub Make 面向产品团队协作设计。团队可以围绕同一个原型项目进行需求讨论、批注修改、AI 评审、交付标注和版本沉淀，让产品、设计、研发、测试和业务方共享同一份上下文。

版本管理用于回溯方案、对比变化和管理交付节点。发布链接和移动端预览支持远程评审、移动办公和客户演示。

### 免费资源库和发布交付

Make 内置新手教程、100+ 设计规范和 10+ 行业原型。原型完成后，可以通过云服务发布、HTML 导出、Figma 交付和 Axure 发布链路进入不同团队的既有工作方式。

## 用户群

扫码添加管理员，加入 Axhub Make 用户群，获取使用交流、问题反馈和新版本动态。

如果你已经加入过 Axhub 其他用户群，不需要重复添加。

<img src="assets/images/axhub-make-user-group-qrcode.png" alt="Axhub Make 用户群二维码" height="128">
