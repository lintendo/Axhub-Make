# Make 与 ACP 语音内部参数精简设计

## 目标

移除用户不需要配置的豆包内部协议参数，避免设置页把固定实现细节误导成用户凭据或连接配置。

## 用户可见配置

Make 与 ACP 的豆包语音设置只保留：

- App ID：豆包实时语音应用标识。
- Access Key：用户自己的豆包访问凭据。
- 发音人：可选覆盖项，留空使用默认发音人。

从设置 UI、脱敏状态、更新/清除协议和公开类型中移除：

- App Key
- Resource ID
- 实时语音 URL

## 运行时兼容

- 豆包实时协议仍发送所需的内部请求头。
- App Key 使用代码内固定协议常量，不再接受用户配置或环境覆盖。
- Resource ID 固定为 `volc.speech.dialog`。
- 实时语音地址固定为 `wss://openspeech.bytedance.com/api/v3/realtime/dialogue`。
- 旧配置文件中的 `appKey`、`resourceId`、`realtimeUrl` 字段读取时忽略，不主动删除或改写用户文件。
- Make 当前 Commentary 入口仍只检查 App ID 和 Access Key；其浏览器 Web Speech adapter 不消费上述三个内部参数。

## 边界

- Make：设置表单、配置 store、配置 API 类型和测试。
- ACP：语音设置面板、settings client/store、运行时配置适配和测试。
- 菜单：批注“更多”里的语音入口固定显示“语音助手”；关闭显示麦克风图标，开启显示勾选并使用已存在的选中高亮。
- 不改现有语音会话、工具、批注持久化、App ID/Access Key 校验或设置保存入口。

## 兼容与安全

- 真实 Access Key 仍不返回浏览器，仅返回 `hasAccessKey`。
- 新的设置更新 payload 不接受三个内部参数。
- 旧客户端提交三个字段时，服务端忽略这些字段，不覆盖内部常量。
- 清除操作只保留 Access Key（以及其他仍存在的 processing/vision secret，不改变其现有语义）。

## 验证

- 先为 Make、ACP store/form、运行时常量和菜单状态补充失败测试。
- 聚焦测试确认 UI、类型和 API 不再暴露三个字段。
- 运行 Make/ACP lint、TypeScript、语音聚焦测试和可用的构建验证。
