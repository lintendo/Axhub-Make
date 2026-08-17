# 设置页 API 测试按钮设计

## 目标

修正“图片生成 API”表单与操作按钮之间过小的垂直间距，并在“豆包语音 API”“网页任务 API”“视觉 API”三个配置面板中增加真实连通测试。

## 用户体验

- 图片生成 API 的操作区与表单保持 16px 垂直间距。
- 三个语音相关配置面板各自显示一个测试按钮；按钮文案分别为“测试豆包配置”“测试网页任务配置”“测试视觉配置”。
- 点击后仅对应按钮进入“测试中...”状态。成功和失败信息显示在按钮右侧，并通过现有 toast 给出简短反馈。
- 测试使用当前尚未保存的表单值。密钥输入为空且未被显式清除时，服务端沿用已保存密钥；已经点击“清除”的密钥不得回退到已保存值。
- 测试不会保存配置，也不会关闭设置抽屉。

## 服务端测试协议

新增项目作用域端点 `POST /api/config/voice-assistant/test`，请求体为：

```ts
type VoiceAssistantTestRequest = {
  section: 'doubao' | 'processing' | 'vision';
  patch: VoiceAssistantSettingsPatch;
  clearSecrets: VoiceAssistantSecretPath[];
};
```

服务端先把请求中的目标分组以内存方式合并到已保存全局配置，应用 `clearSecrets` 后执行测试，不写入配置文件。

- 豆包语音：使用 ACP 当前固定的实时语音 URL、App Key 和 Resource ID，携带 App ID 与 Access Key 建立 WebSocket，发送 `StartConnection` 和最小 `StartSession`，收到 `SessionStarted` 才算通过。若填写了发音人则使用该值，否则使用 ACP 当前默认发音人。测试不访问麦克风、不播放音频。
- 网页任务：将 Base URL 规范化为 OpenAI-compatible `chat/completions` 地址，发送要求只返回 `OK` 的最小文本请求，响应中存在非空 assistant content 才算通过。
- 视觉：将 Endpoint 规范化为 OpenAI-compatible `chat/completions` 地址，发送一张内置的 1×1 PNG 与简短识别提示，响应中存在非空 assistant content 才算通过。

所有外部请求使用 20 秒超时。错误信息最多返回 500 个规范化字符，并替换请求使用的密钥；响应和日志不得包含明文密钥。

## 代码边界

- 新建 `src/server/voiceAssistantConfigTest.ts`，集中负责配置合并、协议构造、外部请求、响应校验与错误脱敏。
- `src/server/projectCore/voice-assistant-settings.ts` 增加一个纯内存合并函数，写入逻辑继续复用它，确保测试与保存具有相同规范化和清除语义。
- `src/server/managementApi.config.ts` 只负责端点路由和 JSON 响应。
- `src/index/components/settings/voiceAssistantSettingsForm.ts` 构造仅包含目标分组的测试请求。
- `src/index/components/settings/VoiceAssistantSettingsSection.tsx` 管理三个独立测试状态并渲染操作区。
- `src/index/components/SettingsDialog.tsx` 仅调整图片 API 操作区间距。

## 安全与失败处理

- 缺少目标分组所需的 Key、App ID、模型或 Endpoint 时返回 400，不发出网络请求。
- 供应商鉴权失败、非 2xx 响应、空响应、WebSocket 会话失败与超时均返回失败，不伪造通过状态。
- 浏览器只接收 `{ success, message }` 或 `{ success: false, error }`，不接收合并后的配置或密钥。
- 现有 URL 规则保持不变：远端必须使用 HTTPS/WSS，本机 loopback 可使用 HTTP/WS，URL 不得携带账号、密码或 fragment。

## 验证

- 单元测试覆盖内存合并、显式清除、OpenAI-compatible URL 构造、文本/视觉请求体、豆包握手帧和密钥脱敏。
- API 测试覆盖项目作用域、已保存密钥回退、当前表单密钥覆盖、不持久化测试值以及响应不泄露密钥。
- 前端测试覆盖三个按钮、独立状态、测试请求体、行内结果和 16px 操作区间距。
- 运行聚焦 Vitest、`pnpm server:build`、`pnpm admin:build`，并通过现有完整 Make 开发服务器做浏览器视觉验证；不创建临时 HTML。
