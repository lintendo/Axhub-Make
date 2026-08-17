import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

function readSource() {
  return readFileSync(resolve(__dirname, './AxhubPublishDialog.tsx'), 'utf8');
}

describe('AxhubPublishDialog hosted review reports', () => {
  it('selects the Axhub project from the current resource latest publish record', () => {
    const source = readSource();

    expect(source).toContain('apiService.getCloudPublishingLatest(targetPath, requireProjectScope(projectId))');
    expect(source).toContain('const boundProjectId = String(latest.targets.axhub?.axhubProjectId || \'\');');
    expect(source).toContain('result.projects?.some((project) => String(project.pid) === boundProjectId)');
    expect(source).toContain('return boundProjectId;');
  });

  it('shows report count and clear action only for projects that have reports', () => {
    const source = readSource();
    const projectRow = source.slice(source.indexOf('{projects.map((project)'), source.indexOf('</RadioGroup>', source.indexOf('{projects.map((project)')));

    expect(source).toContain("import { ExternalLink, Loader2, Plus, RefreshCw, Send, Trash2, X } from 'lucide-react';");
    expect(source).toContain("from '@/components/ui/tooltip';");
    expect(projectRow).toContain('Number(project.reviewReportCount || 0) > 0 ? (');
    expect(projectRow).toContain('评审报告 {project.reviewReportCount} 份');
    expect(projectRow).toContain('<Trash2 className="h-4 w-4" />');
    expect(projectRow).toContain('<TooltipContent>清空评审报告</TooltipContent>');
    expect(projectRow).toContain('<TooltipContent>打开 Axhub 项目</TooltipContent>');
    expect(projectRow.indexOf('清空评审报告')).toBeLessThan(projectRow.indexOf('打开 Axhub 项目'));
    expect(source).toContain('将删除云端 ${count} 份评审报告，不影响已同步到本地的报告');
    expect(source).toContain('apiService.clearAxhubHtmlProjectReviewReports(project.pid)');
    expect(source).toContain('reviewReportCount: 0');
  });
});
