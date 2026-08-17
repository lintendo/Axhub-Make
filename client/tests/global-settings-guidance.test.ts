import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const rulePath = resolve(__dirname, '../rules/axhub-make-global-settings.md');

function readRule(): string {
  expect(existsSync(rulePath)).toBe(true);
  return readFileSync(rulePath, 'utf8');
}

describe('Axhub Make global settings guidance', () => {
  it('limits edits to the two user-level UTF-8 JSON files and requires merge-safe writes', () => {
    const rule = readRule();

    expect(rule).toContain(String.raw`%USERPROFILE%\.axhub\make\server.config.json`);
    expect(rule).toContain(String.raw`%USERPROFILE%\.axhub\make\voice-assistant.settings.json`);
    expect(rule).toContain('~/.axhub/make/server.config.json');
    expect(rule).toContain('~/.axhub/make/voice-assistant.settings.json');
    expect(rule).toContain('UTF-8');
    expect(rule).toContain('两空格缩进');
    expect(rule).toContain('保留未知字段');
    expect(rule).toContain('无法解析时不得覆盖原文件');
    expect(rule).toContain('项目目录内的 `.axhub/make/axhub.config.json`');
  });

  it('documents every supported top-level group and both local Agent path formats', () => {
    const rule = readRule();

    for (const field of [
      '`automation`',
      '`assistant`',
      '`ai.imageGeneration`',
      '`uiPreferences`',
      '`toolOpenState`',
      '`accessControl.lanPassword`',
      '`cloudPublishing`',
      '`doubao`',
      '`processing`',
      '`vision`',
    ]) {
      expect(rule).toContain(field);
    }

    expect(rule).toContain('网页任务 API');
    expect(rule).toContain('`ide:<agent>.executablePath`');
    expect(rule).toContain('`local-app:<agent>.commandPath`');
    expect(rule).toContain('`cli:<agent>.commandPath`');
  });

  it('protects secrets and defines CLI, provider, and desktop verification outcomes', () => {
    const rule = readRule();

    expect(rule).toContain('不得擅自生成、删除、回显或迁移');
    expect(rule).toContain('密钥、密码、token、secret');
    expect(rule).toContain('官方渠道');
    expect(rule).toContain('GET <MAKE_API_ORIGIN>/api/agent/versions?agent=<agent>');
    expect(rule).toContain('`agents.<agent>.status`');
    expect(rule).toContain('`installed`');
    expect(rule).toContain('恢复原值');
    expect(rule).toContain('POST <MAKE_API_ORIGIN>/api/ai/runs?projectId=<PROJECT_ID>');
    expect(rule).toContain('`scene: "agent-provider-test"`');
    expect(rule).toContain('`client: "acp:<agent>"`');
    expect(rule).toContain('`AXHUB_AGENT_TEST_OK`');
    expect(rule).toContain('路径验证通过、CLI 版本检测不适用');
  });

  it('guides users to the official Doubao Speech console and stays concise', () => {
    const rule = readRule();
    const lines = rule.trimEnd().split(/\r?\n/u);

    expect(rule).toContain('[火山引擎豆包语音控制台](https://console.volcengine.com/speech/new/overview)');
    expect(rule).toContain('配置缺失时，引导用户');
    expect(rule).toContain('App ID、Resource ID');
    expect(lines.length).toBeLessThanOrEqual(100);
  });
});
