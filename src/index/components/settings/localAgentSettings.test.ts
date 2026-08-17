import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const modulePath = resolve(__dirname, './localAgentSettings.ts');

async function loadLocalAgentSettings() {
  expect(existsSync(modulePath)).toBe(true);
  return import('./localAgentSettings');
}

describe('local Agent settings', () => {
  it('reads configured desktop and CLI paths and emits deletion-safe tool state patches', async () => {
    const {
      buildLocalAgentToolOpenStatePatch,
      readLocalAgentPathEntries,
    } = await loadLocalAgentSettings();
    const toolOpenState = {
      'web:opencode': { commandPath: 'keep-this-entry' },
      'ide:cursor': { executablePath: 'C:\\Program Files\\Cursor\\Cursor.exe' },
      'local-app:codex': { commandPath: 'C:\\Users\\demo\\ChatGPT.exe' },
      'cli:codex': { commandPath: 'codex' },
      'cli:opencode': { commandPath: '/usr/local/bin/opencode' },
    };

    expect(readLocalAgentPathEntries(toolOpenState, 'desktop')).toEqual([
      { agent: 'cursor', path: 'C:\\Program Files\\Cursor\\Cursor.exe' },
      { agent: 'codex', path: 'C:\\Users\\demo\\ChatGPT.exe' },
    ]);
    expect(readLocalAgentPathEntries(toolOpenState, 'cli')).toEqual([
      { agent: 'codex', path: 'codex' },
      { agent: 'opencode', path: '/usr/local/bin/opencode' },
    ]);

    expect(buildLocalAgentToolOpenStatePatch(toolOpenState, [
      { agent: 'cursor', path: 'D:\\Apps\\Cursor\\Cursor.exe' },
      { agent: 'workbuddy', path: 'D:\\Apps\\WorkBuddy\\WorkBuddy.exe' },
    ], [
      { agent: 'opencode', path: '/opt/opencode/bin/opencode' },
    ])).toEqual({
      'web:opencode': { commandPath: 'keep-this-entry' },
      'ide:cursor': { executablePath: 'D:\\Apps\\Cursor\\Cursor.exe' },
      'local-app:codex': null,
      'local-app:workbuddy': { commandPath: 'D:\\Apps\\WorkBuddy\\WorkBuddy.exe' },
      'cli:codex': null,
      'cli:opencode': { commandPath: '/opt/opencode/bin/opencode' },
    });
  });

  it('builds a secret-safe prompt with the current Make API and project-scoped verification steps', async () => {
    const { buildGlobalSettingsAiPrompt } = await loadLocalAgentSettings();
    const prompt = buildGlobalSettingsAiPrompt({
      makeApiOrigin: 'http://127.0.0.1:53817/',
      projectId: 'demo/project',
    });

    expect(prompt).toContain('http://127.0.0.1:53817');
    expect(prompt).toContain('demo%2Fproject');
    expect(prompt).toContain('rules/axhub-make-global-settings.md');
    expect(prompt).toContain('server.config.json');
    expect(prompt).toContain('voice-assistant.settings.json');
    expect(prompt).toContain('只合并用户明确要求的字段');
    expect(prompt).toContain('保留未知字段');
    expect(prompt).toContain('无法解析时不得覆盖原文件');
    expect(prompt).toContain('密钥、密码、token、secret');
    expect(prompt).toContain('GET http://127.0.0.1:53817/api/agent/versions?agent=<agent>');
    expect(prompt).toContain('agents.<agent>.status');
    expect(prompt).toContain('POST http://127.0.0.1:53817/api/ai/runs?projectId=demo%2Fproject');
    expect(prompt).toContain('scene: "agent-provider-test"');
    expect(prompt).toContain('client: "acp:<agent>"');
    expect(prompt).toContain('AXHUB_AGENT_TEST_OK');
    expect(prompt).toContain('路径验证通过、CLI 版本检测不适用');
  });

  it('preserves existing CLI Agent paths when only desktop settings are saved', async () => {
    const { buildLocalAgentToolOpenStatePatch } = await loadLocalAgentSettings();
    expect(buildLocalAgentToolOpenStatePatch({
      'cli:codex': { commandPath: '/Users/demo/.local/bin/codex' },
      'ide:cursor': { executablePath: '/Applications/Cursor.app/Contents/MacOS/Cursor' },
    }, [
      { agent: 'cursor', path: '/Applications/Cursor.app/Contents/MacOS/Cursor-new' },
    ])).toEqual({
      'cli:codex': { commandPath: '/Users/demo/.local/bin/codex' },
      'ide:cursor': { executablePath: '/Applications/Cursor.app/Contents/MacOS/Cursor-new' },
    });
  });
});
