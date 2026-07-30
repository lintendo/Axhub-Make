import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readStyles = () => readFileSync(resolve(__dirname, './styles/index-page.css'), 'utf8');

describe('responsive workspace styles', () => {
  it('uses device capability as well as width before entering the mobile layout', () => {
    const styles = readStyles();

    expect(styles).toContain('@media (max-width: 640px) and (hover: none) and (pointer: coarse)');
    expect(styles).not.toContain('@media (max-width: 640px) {');
    expect(styles).not.toContain('@media (min-width: 641px)');
    expect(styles).toContain('.pc-layout {\n    display: block;\n}');
    expect(styles).toContain('.mobile-layout {\n    display: none !important;\n}');
  });

  it('uses a compact hover-capable sidebar shell below the desktop breakpoint', () => {
    const styles = readStyles();

    expect(styles).toContain('@media (max-width: 1024px) and (hover: hover) and (pointer: fine)');
    expect(styles).toContain('flex-basis: 0 !important;');
    expect(styles).toContain('width: 0 !important;');
    expect(styles).toContain('width: 240px;');
    expect(styles).toContain('position: absolute;');
    expect(styles).toContain('.ax-sidebar-shell.is-compact-open .ax-sidebar-content');
    expect(styles).toContain('pointer-events: auto;');
    expect(styles).toContain('visibility: hidden;');
    expect(styles).toContain('visibility: visible;');
    expect(styles).not.toContain('.ax-sidebar-compact-trigger');
    expect(styles).not.toContain('width: 40px !important;');
    expect(styles).toContain('.ax-sidebar-compact-fallback-trigger');
    expect(styles).toContain('.axhub-canvas-sidebar-toggle-anchor');
  });

  it('hides contextual toolbar actions and publish together only when their container is narrow', () => {
    const styles = readStyles();

    expect(styles).toContain('.ax-presentation-toolbar {\n    container-type: inline-size;\n}');
    expect(styles).toContain('@container (max-width: 600px)');
    expect(styles).toContain('.ax-toolbar-adaptive-action {\n        display: none !important;\n    }');
  });
});
