import fs from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const sidebarSourceUrl = new URL('../../../bin/codex-integration/axhub-make.sidebar.js', import.meta.url);

describe('Codex Axhub Make sidebar source contract', () => {
  it('adds one sidebar entry and opens only the fixed origin in Codex built-in browser', async () => {
    const source = await fs.readFile(sidebarSourceUrl, 'utf8');

    expect(source).toContain('window.__axhubMakeUserScriptInstalled');
    expect(source).toContain('axhub-make-sidebar-entry');
    expect(source).toContain('[data-app-action-sidebar-scroll]');
    expect(source).toMatch(/document\.querySelector\(['"]aside['"]\)/);
    expect(source).toContain('new Set(["plugins", "插件"])');
    expect(source).toContain('reference.after(entry)');
    expect(source).toContain('__axhubMakeHostV1');
    expect(source).toContain('action: "ensure-make"');
    expect(source).toContain('http://127.0.0.1:53817/?surface=codex');
    expect(source).toContain('sendMessageFromView');
    expect(source).toContain('type: "open-in-browser"');
    expect(source).toContain('openTarget: "in-app-browser"');
    expect(source).not.toMatch(/createElement\(["']iframe["']\)|Page\.setBypassCSP|window\.open\s*\(/);
    expect(source).not.toMatch(/send.*task|prompt|mcp/i);
  });
});
