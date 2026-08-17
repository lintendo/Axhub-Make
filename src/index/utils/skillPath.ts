const SKILLS_ROOT_SEGMENT = 'skills';
const SKILLS_ROOT_PREFIX = `/${SKILLS_ROOT_SEGMENT}/`;
const PROJECT_SKILLS_ROOTS = new Set(['.agents', '.claude']);

export function normalizeSkillPath(input: string): string | null {
    if (typeof input !== 'string') return null;
    if (input.includes('\0')) return null;

    const trimmed = input.trim();
    if (!trimmed) return null;

    if (trimmed.includes(':')) return null;

    const normalizedSeparators = trimmed.replace(/\\+/g, '/');
    const withLeadingSlash = normalizedSeparators.startsWith('.') || normalizedSeparators.startsWith('/')
        ? normalizedSeparators
        : `/${normalizedSeparators}`;

    const segments = withLeadingSlash.split('/').filter(Boolean);
    if (segments.length < 2) return null;
    const isProjectSkillsPath = PROJECT_SKILLS_ROOTS.has(segments[0]);
    if (isProjectSkillsPath) {
        if (segments[1] !== SKILLS_ROOT_SEGMENT || segments.length < 3) return null;
    } else if (segments[0] !== SKILLS_ROOT_SEGMENT) {
        return null;
    }

    const safeSegments: string[] = isProjectSkillsPath
        ? [segments[0], SKILLS_ROOT_SEGMENT]
        : [SKILLS_ROOT_SEGMENT];
    for (let i = isProjectSkillsPath ? 2 : 1; i < segments.length; i += 1) {
        const segment = segments[i];
        if (segment === '..') return null;
        if (segment === '.') continue;
        safeSegments.push(segment);
    }

    if (safeSegments.length < (isProjectSkillsPath ? 3 : 2)) return null;

    const normalizedPath = isProjectSkillsPath
        ? safeSegments.join('/')
        : `/${safeSegments.join('/')}`;
    if (!isProjectSkillsPath && !normalizedPath.startsWith(SKILLS_ROOT_PREFIX)) return null;

    return normalizedPath;
}

export function isValidSkillPath(input: string): boolean {
    return normalizeSkillPath(input) !== null;
}

export function normalizeSkillSource(input: string): string | null {
    if (typeof input !== 'string') return null;

    const normalizedPaths = input
        .split(/\r?\n/u)
        .map((entry) => normalizeSkillPath(entry))
        .filter((entry): entry is string => Boolean(entry));

    if (normalizedPaths.length === 0) return null;

    return Array.from(new Set(normalizedPaths)).join('\n');
}

export function selfCheckSkillPathNormalization(): boolean {
    const validCases: Array<[string, string]> = [
        ['skills/local-axure-workflow/SKILL.md', '/skills/local-axure-workflow/SKILL.md'],
        ['/skills/local-axure-workflow/SKILL.md', '/skills/local-axure-workflow/SKILL.md'],
        ['skills\\local-axure-workflow\\SKILL.md', '/skills/local-axure-workflow/SKILL.md'],
        ['/skills//nested///guide.md', '/skills/nested/guide.md'],
        ['.agents/skills/handle-comments/SKILL.md', '.agents/skills/handle-comments/SKILL.md'],
        ['.claude\\skills\\handle-comments\\SKILL.md', '.claude/skills/handle-comments/SKILL.md'],
    ];

    for (const [input, expected] of validCases) {
        if (normalizeSkillPath(input) !== expected) {
            return false;
        }
    }

    const invalidCases = [
        '',
        '/skills',
        'skills',
        '/other/skill.md',
        '/skills/../escape.md',
        'skills/..',
        '.agents/skills/../escape.md',
        '.claude/skills/../../escape.md',
        'C:/skills/file.md',
        'http://example.com/skills/file.md',
        'https://example.com/skills/file.md',
        '/skills/with\0nul.md',
    ];

    for (const input of invalidCases) {
        if (normalizeSkillPath(input) !== null) {
            return false;
        }
    }

    if (
        normalizeSkillSource([
            '.agents/skills/explore-options/SKILL.md',
            '.claude\\skills\\handle-comments\\SKILL.md',
        ].join('\n')) !== [
            '.agents/skills/explore-options/SKILL.md',
            '.claude/skills/handle-comments/SKILL.md',
        ].join('\n')
    ) {
        return false;
    }

    return true;
}
