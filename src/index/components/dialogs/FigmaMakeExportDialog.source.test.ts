import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource() {
  return readFileSync(resolve(__dirname, './FigmaMakeExportDialog.tsx'), 'utf8');
}

describe('FigmaMakeExportDialog source', () => {
  it('uses Figma Make as the visible export object label', () => {
    const source = readSource();

    expect(source).toContain('导出 Figma Make');
    expect(source).toContain('Figma Make 文件');
    expect(source).toContain('下载 Figma Make');
    expect(source).not.toContain('导出 Figma.Make');
    expect(source).not.toContain('MAKE 文件');
    expect(source).not.toContain('下载 Make');
  });

  it('scopes probes, prompts, and downloads to the selected project', () => {
    const source = readSource();

    expect(source).toContain('projectId: string;');
    expect(source).toContain('const scope = React.useMemo(() => requireProjectScope(projectId), [projectId]);');
    expect(source).toContain('apiService.probeExportMake(resolvedTargetPath, scope)');
    expect(source).toContain("withProjectScope(`/api/export-make?path=${encodeURIComponent(resolvedTargetPath)}`, scope)");
    expect(source).toContain('apiService.getExportMakePrompt(resolvedTargetPath, scope)');
  });
});
