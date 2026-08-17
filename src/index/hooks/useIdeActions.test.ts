import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('useIdeActions source', () => {
  it('opens selected resources only from explicit metadata paths', () => {
    const source = readFileSync(resolve(__dirname, './useIdeActions.ts'), 'utf8');

    expect(source).toContain('resolveExplicitItemFilePath');
    expect(source).toContain('resolveExplicitItemBasePath');
    expect(source).toContain('resolveVisibleIDEPreference');
    expect(source).toContain('ideAvailability?: IDEAvailabilityMap;');
    expect(source).toContain('preferredIDE: resolveVisibleIDEPreference(preferredIDE, ideAvailability),');
    expect(source).toContain('projectId?: string;');
    expect(source).toContain('projectId: requireProjectScope(projectId?.trim() || activeProjectId).projectId,');
    expect(source).toContain('fetch(withProjectScope(endpoint, requireProjectScope(projectId)))');
    expect(source).toContain('resolveResourceProjectId(effectiveItem) || activeProjectId,');
    expect(source).not.toContain('fetch(endpoint)');
    expect(source).toContain('let copySucceeded = false;');
    expect(source).toContain('console.warn(\'Failed to copy IDE helper text:\', error);');
    expect(source).toContain('activeProjectId: string | null;');
    expect(source).toContain('当前资源未声明本地文件路径，无法在 IDE 中打开');
    expect(source).not.toContain('isLegacyWsUnavailable');
    expect(source).not.toContain('sendWsMessage');
    expect(source).not.toContain("type: 'handshake'");
    expect(source).not.toContain("type: 'open-file'");
    expect(source).not.toContain('旧版联动插件');
    expect(source).not.toContain('fallbackPath');
    expect(source).not.toContain('fallbackPaths');
    expect(source).not.toContain('`src/${activeTab}/${selectedItem.name}');
    expect(source).not.toContain('`src/themes/${targetTheme.name}');
    expect(source).not.toContain('`src/database/${rawFileName}');
  });
});
