import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const clientRoot = path.resolve(__dirname, '..');

function listFiles(root: string, relativeDirectory = ''): string[] {
  const directory = path.join(root, relativeDirectory);

  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const relativePath = path.join(relativeDirectory, entry.name);
      return entry.isDirectory() ? listFiles(root, relativePath) : [relativePath];
    })
    .sort();
}

describe('client skill mirrors', () => {
  it('keeps the .agents and .claude skill trees synchronized', () => {
    const agentsRoot = path.join(clientRoot, '.agents/skills');
    const claudeRoot = path.join(clientRoot, '.claude/skills');
    const agentsFiles = listFiles(agentsRoot);
    const claudeFiles = listFiles(claudeRoot);

    expect(claudeFiles).toEqual(agentsFiles);

    for (const relativePath of agentsFiles) {
      expect(fs.readFileSync(path.join(claudeRoot, relativePath))).toEqual(
        fs.readFileSync(path.join(agentsRoot, relativePath)),
      );
    }
  });

  it('documents the local-first search and bounded theme install contract', () => {
    const agents = fs.readFileSync(path.join(clientRoot, '.agents/skills/search-design-system/SKILL.md'), 'utf8');
    const response = fs.readFileSync(path.join(clientRoot, '.agents/skills/search-design-system/references/response-schema.md'), 'utf8');
    for (const text of [agents, response]) {
      expect(text).toContain('bundled');
      expect(text).toContain('spec-only');
    }
    expect(agents).toContain('design-knowledge/manifest.json');
    expect(agents).toContain('install');
    expect(agents).toContain('10 seconds');
    expect(agents).toContain('GitHub Pages');
    expect(agents).toContain('Gitee');
    expect(agents).not.toContain('默认使用 `scripts/cli.mjs search` 读取 Make-Template 的线上 manifest');
  });

  it('teaches prototype annotation skills to declare active foreground layers', () => {
    const skillPath = path.join('.agents/skills/prototype-annotation/SKILL.md');
    const referencePath = path.join(
      '.agents/skills/prototype-annotation/references/axhub-annotation.md',
    );
    const skill = fs.readFileSync(path.join(clientRoot, skillPath), 'utf8');
    const reference = fs.readFileSync(path.join(clientRoot, referencePath), 'utf8');

    expect(skill).toContain('presentation.layerSelectors');
    expect(skill).toContain('实际 DOM');
    expect(reference).toContain('"layerSelectors"');
    expect(reference).toContain('包含弹窗内容');
  });
});
