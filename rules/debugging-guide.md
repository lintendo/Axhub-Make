# AI Agent 调试协作指南

本文档指导 AI Agent 如何协助用户调试本项目元素和页面。

## 📌 用户背景假设

- **用户是非开发人员**，不了解技术术语（如"控制台"、"堆栈"等）
- **用户主要通过浏览器查看页面**，关注页面是否正常显示和功能是否可用
- **AI Agent 应主动进行技术诊断**，无需用户提供技术细节

## 🎯 核心职责

1. **自动化调试优先** - 使用 Chrome DevTools MCP 进行自动化问题诊断和修复
2. **分析错误信息** - 主动获取并分析错误，快速定位问题
3. **迭代修复** - 系统化地修复问题直到功能正常

## 🤖 自动化调试流程（推荐）

**前提条件：用户已安装并配置 Chrome DevTools MCP（或 Playwright MCP 作为备用）**

**注意：本文档仅在自动化验收失败时阅读。如果是验收脚本返回 ERROR，应直接根据错误信息修复。**

### 1. 获取调试页面 URL

从验收脚本返回结果中获取 `url` 字段。

### 2. 诊断问题

使用 Chrome DevTools MCP 工具主动获取错误信息：
- `list_console_messages` / `get_console_message` - 读取浏览器错误和警告
- `take_screenshot` / `take_snapshot` - 捕获页面当前状态（如模型支持视觉能力，可对照设计需求检查）
- `evaluate_script` - 在浏览器中执行代码检查状态
- `navigate_page` - 导航到指定页面

如需更多信息：
- 在代码中添加 `console.log()` 输出调试信息
- 使用 Chrome DevTools MCP 工具模拟用户操作复现问题
- 备用方案：使用 Playwright MCP 进行更复杂的自动化测试

### 3. 修复代码

根据错误信息定位并修复问题：

**编译错误**（页面无法加载/白屏）
- 检查终端输出的 TypeScript 或语法错误
- 修复后 Vite 会自动重新编译

**运行时错误**
- 分析错误信息，定位问题代码
- 检查是否违反 development-standards.md 规范
- 常见错误模式：
  - 空值错误：添加空值检查 `(data || []).map(...)`
  - Promise 错误：添加 `.catch()` 处理
  - 模块错误：检查依赖是否已安装

**样式问题**（功能不对/样式不对）
- 对照 `spec.md` 确认预期行为
- **优先使用 Tailwind CSS V4**（参考 development-standards.md）
- **Tailwind V4 特别注意**：
  - 使用 `@import "tailwindcss"` 而非 `@tailwind` 指令
  - 配置方式和类名与 V3 有差异
  - 遇到问题可参考官方文档或使用传统 CSS
- 如使用 Design Tokens，确认是否正确引用

**第三方库问题**
- 使用 **DeepWiki MCP** (`ask_question`) 询问 GitHub 仓库的 API 用法
- 使用 **Context7 MCP** (`resolve-library-id` + `query-docs`) 查询库文档
- 参考 `/assets/libraries/` 目录下的本地文档
- **积极使用网络搜索工具**查找解决方案：
  - 搜索错误信息和堆栈跟踪
  - 查找官方文档和最佳实践
  - 参考 Stack Overflow、GitHub Issues 等社区讨论
  - 查找相关技术文章和教程

### 4. 验证修复

- 重新运行验收脚本确认状态变为 READY
- 使用 Chrome DevTools MCP（或 Playwright MCP）验证修复效果
- 确认错误已解决，功能正常
- 如问题未完全解决，重复上述流程
- **一次修复一个问题**，避免引入新错误

### 关键原则

- **灵活使用工具** - Chrome DevTools MCP 提供输入自动化、导航自动化、性能分析、网络监控、调试等工具，根据实际需要选择
- **主动查找资源** - 积极使用文档查询工具和网络搜索获取解决方案
- **系统化调试** - 记录每个步骤的发现和推理
- **优先稳健方案** - 选择可靠、可维护的解决方案
- **遵循规范** - 确保修复符合 development-standards.md
- **非交互式** - 不询问用户问题，自主决策并执行最合理方案
- **避免过时 API** - 不使用不推荐或已弃用的 API

### 必读文档

- **development-standards.md** - 确保修复符合项目规范
- **spec.md** - 理解元素的预期行为

## 👤 手动调试流程（无自动化工具）

**⚠️ 重要提示：在开始手动调试前，应先建议用户安装 Chrome DevTools MCP 以获得更好的调试体验。**

安装方式：
- 在 Kiro 中配置 MCP，添加 Chrome DevTools MCP 服务
- 备用方案：Playwright MCP（`npx @playwright/mcp@latest`）

如用户暂时无法安装，可继续手动调试：

参考上述"修复代码"部分的错误处理方法，但需要：
- 主动询问用户页面表现（是否白屏、是否有错误提示等）
- 根据用户描述推断问题类型
- 修复后告知用户已完成，Vite 会自动刷新页面

## 📋 验收要点

**用户验证：**
- 页面正常显示，功能符合预期

## ✅ 协作要点

### 你应该：
- ✅ **优先使用 Chrome DevTools MCP 进行自动化调试**（如果可用，Playwright MCP 作为备用）
- ✅ 灵活使用 Chrome DevTools MCP 提供的丰富工具（输入自动化、导航、性能、网络、调试等）
- ✅ **积极使用文档查询工具和网络搜索**获取解决方案
- ✅ 系统化地调试，记录每个步骤的发现
- ✅ 根据错误信息快速定位和修复
- ✅ 对照 spec.md 确保功能完整性
- ✅ 遵循 development-standards.md 规范

### 你不应该：
- ❌ 要求用户提供技术细节（如控制台错误、堆栈信息等）
- ❌ 在没有错误信息的情况下盲目修改代码
- ❌ 忽略用户的反馈细节
- ❌ 使用过时或不推荐的 API
- ❌ 在自动化调试时询问用户问题（应自主决策）
- ❌ 同时修复多个错误（应逐个修复并验证）

## 🔧 工具清单

**自动化调试：** Chrome DevTools MCP（推荐）、Playwright MCP（备用）  
**文档查询：** DeepWiki MCP、Context7 MCP、网络搜索工具