import fs from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const sourceUrl = new URL('../../../bin/cursor-integration/axhub-make.cursor-launcher.js', import.meta.url);

describe('Cursor Agents launcher source contract', () => {
  it('adds one fixed click launcher without rendering Make or invoking AI', async () => {
    const source = await fs.readFile(sourceUrl, 'utf8');

    expect(source).toContain('window.__axhubMakeCursorLauncherInstalled');
    expect(source).toContain('axhub-make-cursor-entry');
    expect(source).toMatch(/aria-label[^\n]+IDE|new Set\(\["ide"\]\)/i);
    expect(source).toContain('__axhubMakeHostV1');
    expect(source).toContain('action: "open-make"');
    expect(source).not.toContain('webview[partition="persist:cursor-browser"]');
    expect(source).not.toMatch(/webview\.src|new PointerEvent/);
    expect(source).toContain('Open failed');
    expect(source).toContain('new MutationObserver');
    expect(source).toContain('reference.after(entry)');
    expect(source).not.toContain('cursor://');
    expect(source).not.toMatch(/createElement\(["']iframe["']\)|Page\.setBypassCSP/);
    expect(source).not.toMatch(/send.*task|chat|prompt|mcp/i);
    expect(source).not.toMatch(/https?:\/\/(?!127\.0\.0\.1:53817)/);
  });
});
