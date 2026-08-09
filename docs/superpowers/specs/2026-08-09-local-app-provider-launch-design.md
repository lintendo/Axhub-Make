# 本地应用供应商精简与启动兼容设计

## 目标

将“在本地应用中打开”统一为七个入口，并根据 Agent Surface 的已验证能力选择注入或普通启动：

1. ChatGPT
2. OpenCode
3. WorkBuddy
4. TRAEWORK
5. Cursor
6. QoderWork
7. TRAE

菜单不再展示“更多”、本地 CLI、VS Code、Windsurf、Antigravity、Qoder、TRAE CN 等独立入口。已有底层 CLI 和 IDE API 不在本次范围内删除，避免影响菜单之外的调用方。

## 供应商模型与菜单

`LOCAL_APP_AGENT_OPTIONS` 继续作为本地应用类型和标签的唯一来源，新增 `qoderwork` 与 `trae`。Cursor 仍复用 IDE 打开能力，但在本地应用菜单中固定插入 TRAEWORK 与 QoderWork 之间。

菜单不按本机安装状态增删入口，也不再将全部 `MAIN_IDE_OPTIONS` 合并进来。这样七个入口在不同机器上保持一致，点击后由服务端返回明确的缺失提示。

## 注入与普通启动

已验证 Agent Surface 适配的供应商走桌面集成协调器：

- ChatGPT -> `codex`
- Cursor -> `cursor`
- WorkBuddy -> `workbuddy`
- TRAEWORK -> `traework`

未验证或未接入 Agent Surface 的供应商直接携带项目路径启动：

- OpenCode：沿用 `opencode://open-project?directory=...`。
- QoderWork：普通启动应用并传入当前项目目录。
- TRAE：普通启动应用并传入当前项目目录。

QoderWork 和 TRAE 即使在第三方包中存在实验适配器，也不计为可注入，直到对应适配器通过冒烟验证并显式加入 Make 的桌面集成供应商集合。

## 主版与 CN 回退

TRAEWORK、QoderWork、TRAE 的应用路径按“主版本优先、CN 版本回退”排列。检测到的第一个存在路径即作为启动路径，不在菜单中额外展示 CN 项。

macOS 使用 `open -a <resolved-app-bundle> <project-directory>`，让 Launch Services 把项目目录交给应用。Windows 使用解析到的可执行文件并将项目目录作为单独参数传入，保持 `shell: false`。

macOS 候选包括：

- TRAEWORK：`TRAE SOLO.app` -> `TRAE SOLO CN.app`
- QoderWork：`QoderWork.app` -> `QoderWork CN.app`
- TRAE：`Trae.app` -> `Trae CN.app`

Windows 同样先枚举主版本的用户级与系统级安装位置，再枚举 CN 版本位置。

## 图标

- WorkBuddy 使用仓库已有的 `codeBuddyIconUrl`，来源为 LobeHub CodeBuddy 图标。
- QoderWork 使用现有 `qoderIconUrl`。
- TRAEWORK 与 TRAE 共用 `Trae.Color`。
- ChatGPT、OpenCode、Cursor 保持现有品牌图标。

带 Work/WORK 与不带 Work/WORK 的同品牌产品不再使用不同图标。

## 错误处理

服务端未检测到应用时继续返回现有缺失错误；直接启动失败时保留本地应用打开失败提示。直启供应商不会错误地落入 OpenCode deeplink。桌面集成供应商仍可在需要重启时展示“普通打开 / 重启并注入”对话框。

## 验证

- 类型与菜单测试精确断言六个本地应用类型和七个菜单入口顺序。
- UI 源码测试断言没有“更多”和本地 CLI 菜单，并校验图标与注入/直启路由。
- 可用性测试覆盖 TRAEWORK、QoderWork、TRAE 的主版优先与 CN 回退。
- 启动命令测试覆盖 macOS app bundle 和 Windows executable 的项目目录参数。
- 运行聚焦 Vitest、服务端 TypeScript 构建和前端构建/类型验证。
