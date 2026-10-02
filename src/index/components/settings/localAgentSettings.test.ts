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
      'local-app:codex': {
        executablePath: 'C:\\Users\\demo\\ChatGPT.exe',
        commandPath: 'C:\\Users\\demo\\codex.cmd',
      },
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
      'local-app:workbuddy': { executablePath: 'D:\\Apps\\WorkBuddy\\WorkBuddy.exe' },
      'cli:codex': null,
      'cli:opencode': { commandPath: '/opt/opencode/bin/opencode' },
    });
  });

  it('ignores legacy command paths for desktop Agent entries', async () => {
    const { readLocalAgentPathEntries } = await loadLocalAgentSettings();

    expect(readLocalAgentPathEntries({
      'local-app:codex': { commandPath: '/Users/demo/.local/bin/codex' },
    }, 'desktop')).toEqual([]);
  });

  it('removes CLI fields from desktop entries and desktop fields from CLI entries', async () => {
    const { buildLocalAgentToolOpenStatePatch } = await loadLocalAgentSettings();

    expect(buildLocalAgentToolOpenStatePatch({
      'local-app:codex': {
        executablePath: '/Applications/Old ChatGPT.app/Contents/MacOS/ChatGPT',
        commandPath: '/Users/demo/.local/bin/codex',
        lastOpenMode: 'direct-app',
      },
      'cli:codex': {
        executablePath: '/Applications/ChatGPT.app/Contents/MacOS/ChatGPT',
        commandPath: '/usr/local/bin/codex',
        lastOpenMode: 'terminal',
      },
    }, [
      { agent: 'codex', path: '/Applications/ChatGPT.app/Contents/MacOS/ChatGPT' },
    ], [
      { agent: 'codex', path: '/opt/homebrew/bin/codex' },
    ])).toEqual({
      'local-app:codex': {
        executablePath: '/Applications/ChatGPT.app/Contents/MacOS/ChatGPT',
        lastOpenMode: 'direct-app',
      },
      'cli:codex': {
        commandPath: '/opt/homebrew/bin/codex',
        lastOpenMode: 'terminal',
      },
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
    expect(prompt).toContain('server.secrets.json');
    expect(prompt).toContain('不得直接读取、写入或回显');
    expect(prompt).not.toContain('voice-assistant.settings.json');
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
