import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

describe('spec-template HTML', () => {
  it('includes the x-markdown stylesheet required by x-markdown-light', () => {
    const htmlPath = path.resolve(__dirname, 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    expect(html).toContain('/assets/vendor-editor.css');
    expect(html).toContain('/assets/spec-template-reset.css');
    expect(html).toContain('/assets/spec-template-styles.css');
    expect(html).toContain('/assets/vendor-antd.css');
    expect(html).not.toContain('/assets/spec-template-vendor.css');
    expect(html).not.toContain('/assets/simple-editor.css');
    expect(html).not.toContain('/assets/spec-template-bootstrap.css');
  });

  it('centers the initial loading state in the preview viewport', () => {
    const htmlPath = path.resolve(__dirname, 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    expect(html).toMatch(/#spec-root\.loading\s*\{[\s\S]*min-height:\s*100vh/);
    expect(html).toMatch(/#spec-root\.loading\s*\{[\s\S]*display:\s*flex/);
    expect(html).toMatch(/#spec-root\.loading\s*\{[\s\S]*align-items:\s*center/);
    expect(html).toMatch(/#spec-root\.loading\s*\{[\s\S]*justify-content:\s*center/);
    expect(html).not.toMatch(/\.loading\s*\{[\s\S]*padding:\s*60px 20px/);
  });
});
