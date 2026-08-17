import { describe, expect, it } from 'vitest';

import { isValidSkillPath, normalizeSkillPath, normalizeSkillSource } from './skillPath';

describe('normalizeSkillPath', () => {
  it('normalizes valid skill paths', () => {
    expect(normalizeSkillPath('skills/local-axure-workflow/SKILL.md')).toBe(
      '/skills/local-axure-workflow/SKILL.md'
    );
    expect(normalizeSkillPath('/skills//nested///guide.md')).toBe('/skills/nested/guide.md');
    expect(normalizeSkillPath('skills\\stitch-skills\\design-md\\SKILL.md')).toBe(
      '/skills/stitch-skills/design-md/SKILL.md'
    );
    expect(normalizeSkillPath(' /skills/foo/./bar.md ')).toBe('/skills/foo/bar.md');
    expect(normalizeSkillPath('.agents/skills/handle-comments/SKILL.md')).toBe(
      '.agents/skills/handle-comments/SKILL.md',
    );
    expect(normalizeSkillPath('.claude\\skills\\handle-comments\\SKILL.md')).toBe(
      '.claude/skills/handle-comments/SKILL.md',
    );
  });

  it('rejects invalid skill paths', () => {
    const invalidCases = [
      '',
      'skills',
      '/skills',
      '/other/path.md',
      '/skills/../escape.md',
      '.agents/skills/../escape.md',
      '.claude/skills/../../escape.md',
      'C:/skills/file.md',
      'https://example.com/skills/file.md',
      '/skills/with\0nul.md',
    ];

    for (const input of invalidCases) {
      expect(normalizeSkillPath(input)).toBeNull();
      expect(isValidSkillPath(input)).toBe(false);
    }
  });
});

describe('normalizeSkillSource', () => {
  it('normalizes multiple project-local skill paths while dropping invalid entries', () => {
    expect(
      normalizeSkillSource(`
        .agents/skills/explore-options/SKILL.md
        .claude\\skills\\explore-options\\SKILL.md
        https://example.com/skills/remote.md
        .agents/skills/handle-comments/SKILL.md
      `),
    ).toBe(
      [
        '.agents/skills/explore-options/SKILL.md',
        '.claude/skills/explore-options/SKILL.md',
        '.agents/skills/handle-comments/SKILL.md',
      ].join('\n'),
    );
  });

  it('returns null when no valid local skill path remains', () => {
    expect(normalizeSkillSource('https://example.com/skills/remote.md')).toBeNull();
    expect(normalizeSkillSource('')).toBeNull();
  });
});
