# Cursor 一键创建原生 Browser 设计

## 背景

Cursor Agents 顶部的 `Axhub Make` 入口目前只会启动或复用 Make，然后查找已经存在的 Cursor Browser WebView。如果用户从未打开 Browser，或已关闭 Browser 标签，点击会因找不到 WebView 而失败；错误只写入按钮的 `title`，界面看起来像没有反应。

## 目标

- 点击一次 `Axhub Make` 即可启动或复用 Make，并在 Cursor 原生内置 Browser 中打开 `http://127.0.0.1:53817/?surface=codex`。
- 用户不需要预先手动创建 Browser 标签。
- macOS 与 Windows 都使用 Cursor 自己注册的原生 Browser 命令。
- 不安装 Cursor 扩展，不打开外部浏览器，不开放任意命令或任意 URL。

## 方案

将 renderer 到 companion 的固定协议从 `ensure-make` 扩展为固定的 `open-make` 动作：

1. companion 启动或复用固定地址的 Make 服务。
2. companion 检查当前 Cursor Agents 页面是否已有 `persist:cursor-browser` WebView。
3. 如果不存在，companion 通过 CDP 发送 Cursor 内置的 `Open Browser` 快捷命令：macOS 为 `Shift+Meta+B`，Windows 为 `Shift+Control+B`。
4. companion 等待原生 Browser 标签和 WebView 创建完成。
5. companion 只把固定的 Make 专属模式 URL 写入该 WebView，并聚焦对应 Browser 标签。
6. companion 将结果返回给 renderer；入口恢复空闲状态。失败时入口保留可见的错误状态与说明，不能静默失败。

已有 Browser 时直接复用，不再创建新标签。连续点击仍只复用同一个 Axhub Make Browser。

## 安全边界

- host protocol 只接受带请求 id 的固定 `open-make` 动作。
- URL 和调试端口继续由 companion 配置校验固定，不接受 renderer 传入 URL、命令或快捷键。
- CDP WebSocket 继续只允许 `127.0.0.1:9230/devtools/page/...`。
- 创建 Browser 后仍验证 WebView partition 和 Make origin。

## 错误处理

- Make 启动失败：返回启动错误。
- Cursor Browser 命令执行后超时：返回“无法创建 Cursor 内置 Browser”。
- Browser DOM 结构不兼容：返回明确错误并让 `cursor doctor` 报警。
- renderer 在按钮上显示错误状态，至少在超时窗口内可直接看到，不只依赖 tooltip。

## 回归测试

- host protocol 接受 `open-make`，拒绝其他动作和缺失请求 id。
- 已有 Browser：不发送快捷键，直接载入固定 URL 并聚焦现有标签。
- 缺少 Browser：macOS 发送 `Shift+Meta+B`，Windows 发送 `Shift+Control+B`，等待后载入固定 URL。
- Browser 创建超时：返回错误，renderer 显示错误状态。
- 行为测试覆盖首次点击和再次点击复用。
- 运行 Cursor 集成测试、服务端构建、发布打包测试与本机 CDP smoke。
