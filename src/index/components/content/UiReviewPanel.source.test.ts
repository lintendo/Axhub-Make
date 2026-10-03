import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readUiReviewPanelSource() {
  return readFileSync(resolve(__dirname, './UiReviewPanel.tsx'), 'utf8');
}

function readUiReviewPromptSource() {
  return readFileSync(resolve(__dirname, '../../utils/uiReviewPrompt.ts'), 'utf8');
}

function readPresentationToolbarSource() {
  return readFileSync(resolve(__dirname, './PresentationToolbar.tsx'), 'utf8');
}

describe('UiReviewPanel source', () => {
  it('renders a report list, markdown detail, and bottom review actions without type filters', () => {
    const source = readUiReviewPanelSource();
    const promptSource = readUiReviewPromptSource();

    expect(source).toContain('reports: ReviewReportSummary[];');
    expect(source).toContain('selectedReport: ReviewReportDetail | null;');
    expect(source).toContain('lanSubmitConfig?: ReviewLanSubmitConfig | null;');
    expect(source).toContain('axhubSubmitConfig?: ReviewAxhubConfig | null;');
    expect(source).not.toContain('feishuConfig');
    expect(source).not.toContain('ReviewFeishuConfig');
    expect(source).toContain('reviewPrompts?: Partial<Record<ReviewKind, string>>;');
    expect(source).toContain('reviewDocumentPaths?: Partial<Record<ReviewKind, string>>;');
    expect(source).toContain('onSelectReport: (report: ReviewReportSummary) => void;');
    expect(source).toContain('onBackToList: () => void;');
    expect(source).toContain('onCopyReportPath: (report: ReviewReportDetail) => void | Promise<void>;');
    expect(source).toContain('onDeleteReport: (report: ReviewReportDetail) => void | Promise<void>;');
    expect(source).toContain('onStartReview: (kind: ReviewKind) => void | Promise<void>;');
    expect(source).toContain('onRunReviewDirect: (kind: ReviewKind) => Promise<boolean | void> | boolean | void;');
    expect(source).toContain('onUploadReport: (files: File[], meta: { title?: string; reviewer?: string }) => void | Promise<void>;');
    expect(source).toContain('onLanSubmitEnabledChange: (enabled: boolean) => void | Promise<void>;');
    expect(source).toContain('onAxhubSubmitEnabledChange: (enabled: boolean) => void | Promise<void>;');
    expect(source).not.toContain('onFeishu');
    expect(source).toContain("import { getReviewScoreTone, normalizeReviewScore } from './reviewScore';");
    expect(source).toContain('function ReviewScoreBadge');
    expect(source).toContain('report.score');
    expect(source).toContain('{score}分');
    expect(source).toContain('const scoreTone = getReviewScoreTone(score);');
    expect(source).toContain('conic-gradient(${scoreTone}');
    expect(source).not.toContain('conic-gradient(rgb(16 185 129)');
    expect(source).toContain('暂无评审报告');
    expect(source).toContain('directExecuteLabel="AI 执行"');
    expect(source).toContain('webExecuteLabel="网页中 AI 执行"');
    expect(source).toContain('copyLabel="复制提示词"');
    expect(source).not.toContain('提交报告');
    expect(source).not.toContain('上传报告');
    expect(source).not.toContain('局域网提交');
    expect(source).not.toContain('Axhub 提交');
    expect(source).not.toContain('技能提交');
    expect(source).not.toContain('获取飞书');
    expect(source).not.toContain("import { Checkbox } from '@/components/ui/checkbox';");
    expect(source).not.toContain("import { Switch } from '@/components/ui/switch';");
    expect(source.match(/<Checkbox/gu) || []).toHaveLength(0);
    expect(source).not.toContain('提交方式');
    expect(source).not.toContain('飞书提交');
    expect(source).not.toContain('飞书评审');
    expect(source).not.toMatch(/import \{[^}]*ListChecks[^}]*\} from 'lucide-react';/u);
    expect(source).not.toContain('<ListChecks className="h-4 w-4 shrink-0 text-muted-foreground" />');
    expect(source).not.toContain('lanSubmitPending');
    expect(source).not.toContain('axhubSubmitPending');
    expect(source).not.toContain('id="review-axhub-submit"');
    expect(source).not.toContain('重新发布到 Axhub 后可开启');
    expect(source).not.toContain('获取 Axhub');
    expect(source).not.toContain('feishuSubmitPending');
    expect(source).not.toContain('lanSubmitConfig?.lanSubmitEnabled === true || axhubSubmitConfig?.submitEnabled === true ? (');
    expect(source).not.toContain('INSTALL_REVIEW_REPORT_SUBMIT_SKILL_PROMPT');
    expect(source).not.toContain('https://github.com/lintendo/Axhub-Skills/blob/main/skills/axhub-prototype-context/SKILL.md');
    expect(source).not.toContain('$axhub-prototype-context');
    expect(source).not.toContain('$extract-annotation-source');
    expect(source).toContain('AI 评审');
    expect(source).not.toContain('人工评审');
    expect(source).not.toContain('TabsTrigger');
    expect(source).not.toContain('TabsContent');
    expect(source).not.toContain('TabsList');
    expect(source).not.toContain('human-review');
    expect(source).toContain('TooltipTrigger');
    expect(source).toContain('const REVIEW_ACTIONS');
    expect(source).toContain('h-[72px] space-y-1');
    expect(source).toContain('renderReviewActionRow');
    expect(source).toContain('aria-label={`${action.label}说明`}');
    expect(source).toContain('<ReviewPromptActionButton');
    expect(source).toContain('onDirectExecute={() => onRunReviewDirect(action.kind)}');
    expect(source).toContain('directExecuteLabel="AI 执行"');
    expect(source).toContain('webExecuteLabel="网页中 AI 执行"');
    expect(source).toContain('copyLabel="复制提示词"');
    expect(source).toContain('scene={`prototype-review-${action.kind}`}');
    expect(source).not.toContain('type="file"');
    expect(source).not.toContain('accept=".md,.markdown,text/markdown"');
    expect(source).not.toContain('uploadInputRef.current?.click()');
    expect(source).toContain('返回列表');
    expect(source).toContain('aria-label="复制报告路径"');
    expect(source).toContain('复制报告路径');
    expect(source).toContain('aria-label="删除报告"');
    expect(source).toContain('删除报告');
    expect(source).toContain('<Trash2 className="h-3.5 w-3.5" />');
    expect(source).toContain("window.confirm(`确定删除评审报告「${selectedReport.title}」吗？删除后无法恢复。`)");
    expect(source).toContain('void onCopyReportPath(selectedReport);');
    expect(source).toContain('void onDeleteReport(selectedReport);');
    expect(source).toContain('content={selectedReport.markdown}');
    expect(source).not.toContain('旧报告');
    expect(source).not.toContain('selectedReport?.title');
    expect(source).not.toContain('text-right');
    expect(source).toContain("kind: 'design'");
    expect(source).toContain("label: '设计评审'");
    expect(source).toContain("kind: 'requirements'");
    expect(source).toContain("label: '需求评审'");
    expect(source).toContain('DESIGN.md');
    expect(source).toContain('.spec/spec.html');
    expect(source).toContain('.spec/spec.md');
    expect(source).not.toContain('当前原型的评审报告按时间倒序展示。');
    expect(source).not.toContain('标题可选');
    expect(source).not.toContain('评审方');
    expect(source).not.toContain('<Input');
    expect(source).not.toContain('FileDropzone');
    expect(source).not.toContain('拖拽 Markdown 报告');
    expect(source).not.toContain('frontmatter');
    expect(source).not.toContain('apiExample');
    expect(source).not.toContain('API：');
    expect(source).not.toContain('必填字段：projectId、prototypeId、content。');
    expect(source).not.toContain('评审报告标题');
    expect(source).not.toContain('AI 或团队名称');
    expect(source).not.toContain("source: 'lan-api'");
    expect(source).not.toContain('rounded-md border border-border/60 bg-background');
    expect(source).not.toContain('type="primary"');
    expect(source).not.toContain('variant="outline"');
    expect(source).not.toContain('<Segmented');
    expect(source).not.toContain("import { Segmented } from 'antd';");
    expect(promptSource).toContain('rules/ui-review-guide.md');
    expect(promptSource).toContain('rules/prototype-review-guide.md');
    expect(promptSource).toContain('$handle-comments');
    expect(promptSource).toContain('外部批注');
    expect(promptSource).toContain('仅作为评审参考');
    expect(source).not.toContain('PanelRightClose');
    expect(source).not.toContain('aria-label="关闭评审"');
    expect(source).not.toContain('aria-label="复制提示词"');
    expect(source).not.toContain('aria-label="页面缩放模式"');
    expect(source).not.toContain('<Scaling');
  });

  it('keeps design decision and review entry points available for P0 frontend regression', () => {
    const panelSource = readUiReviewPanelSource();
    const promptSource = readUiReviewPromptSource();
    const toolbarSource = readPresentationToolbarSource();
    const normalPreviewActionsSource = toolbarSource.slice(
      toolbarSource.indexOf(') : viewMode === \'canvas\' ? ('),
      toolbarSource.indexOf('{contentMode === \'doc\' || contentMode === \'template\' ? ('),
    );

    expect(toolbarSource).toContain('<SlidersHorizontal /> 决策');
    expect(toolbarSource).toContain('<ListChecks /> 评审');
    expect(toolbarSource).toContain("const reviewPanelTooltip = reviewPanelOpen ? '关闭评审' : '评审';");
    expect(normalPreviewActionsSource.indexOf('<SlidersHorizontal /> 决策')).toBeLessThan(
      normalPreviewActionsSource.indexOf('<ListChecks /> 评审'),
    );
    expect(panelSource).toContain('暂无评审报告');
    expect(panelSource).toContain('directExecuteLabel="AI 执行"');
    expect(panelSource).toContain('webExecuteLabel="网页中 AI 执行"');
    expect(panelSource).not.toContain('提交报告');
    expect(panelSource).not.toContain('上传报告');
    expect(panelSource).not.toContain('局域网提交');
    expect(panelSource).not.toContain('技能提交');
    expect(panelSource).toContain('AI 评审');
    expect(panelSource).not.toContain('人工评审');
    expect(promptSource).toContain("fallbackPath: `src/prototypes/<prototype-id>/.spec/reviews/${UI_REVIEW_FILE_NAME}`");
    expect(promptSource).toContain("fallbackPath: `src/prototypes/<prototype-id>/.spec/reviews/${PROTOTYPE_REVIEW_FILE_NAME}`");
    expect(promptSource).toContain('rules/ui-review-guide.md');
    expect(promptSource).toContain('rules/prototype-review-guide.md');
    expect(promptSource).toContain('$handle-comments');
    expect(promptSource).toContain('外部批注');
    expect(promptSource).toContain('仅作为评审参考');
    expect(promptSource).toContain('优先读取当前原型附近的 DESIGN.md');
    expect(promptSource).toContain('<prototype-spec-root>/spec.html');
    expect(promptSource).toContain('<prototype-spec-root>/spec.md');
    expect(promptSource).toContain("'src/prototypes/<prototype-id>/.spec'");
    expect(promptSource).toContain('细节以规则文档和报告模板为准');
    expect(promptSource).toContain('输出 Markdown');
    expect(promptSource).not.toContain('不要输出 JSON');
    expect(promptSource).not.toContain('frontmatter');
    expect(promptSource).not.toContain('score');
    expect(promptSource).not.toContain('百分制整数总分');
    expect(promptSource).not.toContain('不要默认填写某个中庸分');
    expect(promptSource).not.toContain('设计评审报告的 title 固定写成 "UI Review"');
    expect(promptSource).not.toContain('需求评审报告的 title 固定写成 "Prototype Review"');
    expect(promptSource).not.toContain('使用 /impeccable critique 的评审方法');
  });

  it('uses a review prompt action with direct AI as the default and keeps sidebar/copy as secondary actions', () => {
    const source = readUiReviewPanelSource();

    expect(source).toContain('reviewPrompt: string;');
    expect(source).toContain('reviewDocumentPath?: string;');
    expect(source).toContain('onExecutePrompt?:');
    expect(source).toContain('onRunReviewDirect: (kind: ReviewKind) => Promise<boolean | void> | boolean | void;');
    expect(source).toContain('buildReviewPromptForKind');
    expect(source).toContain('getReviewDocumentPath');
    expect(source).toContain('buildPrompt={() => buildReviewPromptForKind(action.kind)}');
    expect(source).toContain('getTargetPath={() => getReviewDocumentPath(action.kind) || null}');
    expect(source).toContain('onExecutePrompt={onExecutePrompt}');
    expect(source).toContain('onDirectExecute={() => onRunReviewDirect(action.kind)}');
    expect(source).toContain("type ReviewPromptActionKind = 'direct' | 'web' | 'copy';");
    expect(source).toContain("const defaultAction: ReviewPromptActionKind = 'direct';");
    expect(source).toContain("const secondaryActions: ReviewPromptActionKind[] = ['web', 'copy'];");
    expect(source).toContain("if (action === 'direct') {");
    expect(source).toContain('await onDirectExecute();');
    expect(source).toContain("if (action === 'web') {");
    expect(source).toContain('autoSend: false');
    expect(source).toContain("toast.success('已发送到网页 AI 侧栏');");
    expect(source).toContain("toast.success('评审 Prompt 已复制到剪贴板');");
    expect(source).toContain('<ChevronDown className="h-3.5 w-3.5" />');
    expect(source).not.toContain('{loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronDown');
    expect(source).not.toContain("import PromptActionButton from '../PromptActionButton';");
    expect(source).not.toContain('<PromptActionButton');
    expect(source).not.toContain('void onExecutePrompt?.(reviewPrompt, {');
    expect(source).not.toContain('startReviewKind');
    expect(source).not.toContain('onCopyPrompt');
    expect(source).not.toContain('onTogglePageZoom');
    expect(source).not.toContain('pageZoomEnabled');
  });

  it('applies explicit typography to review markdown headings', () => {
    const source = readUiReviewPanelSource();

    expect(source).toContain('const reviewMarkdownComponents');
    expect(source).toContain('h1: ReviewMarkdownHeading1');
    expect(source).toContain('h2: ReviewMarkdownHeading2');
    expect(source).toContain('h3: ReviewMarkdownHeading3');
    expect(source).toContain('!mt-7');
    expect(source).toContain('!mt-5');
    expect(source).toContain('components={reviewMarkdownComponents}');
  });
});
