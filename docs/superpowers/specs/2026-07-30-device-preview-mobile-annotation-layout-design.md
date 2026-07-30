# 设备预览移动批注布局设计

## 目标

修复手机预设中批注 Prompt Card 被 iframe 左边界裁切的问题，并复用现有移动端批注交互；同时保证平板和其他非移动布局中的浮卡始终留在自身 viewport 内。

## 根因

- 单栏手机预览使用主 iframe，但宿主当前只按 `pane === 'secondary'` 设置 `mobileMode`，因此单栏手机预览被显式标记为桌面模式。
- 桌面 Prompt Card 定位会为属性面板预留 268px。在 393px viewport 中，可用右边界小于卡片宽度，当前算法因此产生负 `left`。
- iframe 按规范裁切超出自身 viewport 的内容，所以截图中只剩卡片右侧的一小部分可见。

## 方案比较

### 方案 A：启用既有移动交互并补 viewport 边界保护（采用）

宿主根据预览配置判定交互模式：手机预设和宽度不超过 768px 的自定义单栏预览启用 `mobileMode`；分屏的手机副窗保持移动模式；桌面、平板和其他主窗保持桌面模式。Runtime 继续复用现有的底部全宽 Prompt Card、选中元素缩略图、遮罩和 `VisualViewport` 软键盘避让。

桌面定位同时增加最终边界保护：属性面板预留空间不足时，优先保证 Prompt Card 完整位于 viewport 内，不能产生负坐标。

### 方案 B：只修定位边界

改动最少，但手机预览仍使用桌面浮卡，无法获得现有移动输入与软键盘交互。

### 方案 C：把 Prompt Card 提升到宿主页面

可让浮层跨出 iframe，但需要跨窗口坐标映射、缩放换算、事件转发、焦点和生命周期同步，超出本次定向修复范围。

## 数据流

1. Make 宿主根据 `resourceType`、pane 和当前 `PreviewConfig` 计算 `mobileMode`。
2. 启用批注时，`mobileMode` 通过同源 API 或 postMessage bridge 传入 Commentary Runtime。
3. 手机和窄自定义预览走既有移动 Prompt Card；平板和桌面继续走桌面 Prompt Card。
4. 桌面定位的最终坐标始终 clamp 在 viewport 安全边距内，属性面板预留不得把卡片推出 iframe。

## 边界

- 不修改 iframe DOM 架构，不把浮层提升到宿主页面。
- 不改变真实桌面端交互。
- 不把 820px 平板强制变成全宽底部卡片；平板使用桌面浮卡和 viewport 边界保护。
- 不新增旧版本兼容分支。

## 验证

- 纯函数测试覆盖桌面、手机、平板、窄自定义、宽自定义和分屏副窗的模式判定。
- Prompt Card 定位测试覆盖 393px viewport 加属性面板时不产生负坐标。
- 运行 Make 聚焦测试和 Commentary 定位测试。
- 构建 Admin UI，确认跨 workspace 类型和打包正常。

