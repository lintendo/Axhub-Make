import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

function readSource(relativePath: string): string {
  return readFileSync(resolve(__dirname, '..', relativePath), 'utf8');
}

function readPackageSource(relativePath: string): string {
  return readFileSync(resolve(__dirname, '../../..', relativePath), 'utf8');
}

describe('project-scoped Admin API source contract', () => {
  it('requires project identity in assistant, IDE, review, and Axhub publish requests', () => {
    const source = readSource('services/api.ts');

    expect(source).toContain('interface GetAssistantRuntimeOptions {\n    projectId: string;');
    expect(source).toContain('interface AssistantBootstrapRequest {\n    projectId: string;');
    expect(source).toContain('interface OpenIDERequest {\n    projectId: string;');
    expect(source).toContain('interface OpenCLIAgentRequest {\n    projectId: string;');
    expect(source).toContain('interface OpenWebAgentRequest {\n    projectId: string;');
    expect(source).toContain('interface OpenLocalAppAgentRequest {\n    projectId: string;');
    expect(source).toContain('export interface ReviewReportScopeOptions {\n    projectId: string;');
    expect(source).toContain('export interface ReviewReportSubmitPayload {\n    projectId: string;');
    expect(source).toContain('async getReviewLanSubmitConfig(projectId: string, prototypeId: string)');
    expect(source).toContain('async getReviewAxhubConfig(projectId: string, prototypeId: string)');
    expect(source).toContain('async publishAxhubHtmlProject(payload: { pid: number; path: string; projectId: string })');
  });

  it('does not issue known project-owned fetches without an explicit scope carrier', () => {
    const sourceExpectations = [
      ['app/IndexPage.tsx', ["fetch('/api/docs/upload'", "fetch('/api/entries.json'"]],
      ['components/content/ContentAreaView.tsx', ["fetch('/api/template-library/import'", "fetch('/api/docs/open-system'"]],
      ['components/dialogs/CreateDialogView.tsx', ["fetch('/api/upload'"]],
      ['components/sidebar/ContentPanel.tsx', ["fetch('/api/docs/upload'"]],
      ['domains/prototype-generation/CanvasPrototypeGenerationTool.tsx', ["fetch('/api/entries.json'"]],
      ['domains/workspace/hooks/useWorkspaceNavigationController.ts', ["fetch('/api/entries.json'"]],
      ['domains/ai-image/aiImageStore.ts', ["fetch('/api/ai/runs'"]],
      ['domains/prototype-generation/acpPrototypeAgentClient.ts', ["fetch('/api/ai/runs'"]],
      ['services/api.ts', [
        "fetch('/api/assistant/bootstrap'",
        "fetch('/api/ide/open'",
        "fetch('/api/agent/cli/open'",
        "fetch('/api/agent/web/open'",
        "fetch('/api/agent/local-app/open'",
      ]],
    ] as const;

    for (const [relativePath, forbiddenSnippets] of sourceExpectations) {
      const source = readSource(relativePath);
      for (const forbiddenSnippet of forbiddenSnippets) {
        expect(source, `${relativePath} contains ${forbiddenSnippet}`).not.toContain(forbiddenSnippet);
      }
    }
  });

  it('scopes canvas screenshots and Markdown file URLs to their owning project', () => {
    const screenshotSource = readSource('components/content/canvas-embeds/screenshotPersistence.ts');
    const embedPreviewSource = readSource('components/content/canvas-embeds/embedPreviewSession.ts');
    const markdownPreviewSource = readSource('utils/markdownPreview.ts');

    expect(screenshotSource).toContain('projectId: string;');
    expect(screenshotSource).toContain('withProjectScope(');
    expect(embedPreviewSource).toContain('projectId: string;');
    expect(embedPreviewSource).toContain('withProjectScope(');
    expect(markdownPreviewSource).toContain('export function buildMarkdownFileUrl(markdownPath: string, projectId: string): string');
    expect(markdownPreviewSource).toContain('export function buildMarkdownFileMetaUrl(markdownPath: string, projectId: string): string');
  });

  it('keeps smoke and browser regressions on explicit project-scoped requests', () => {
    const smokeSource = readPackageSource('scripts/smoke/run-smoke.mjs');
    const realAcpSource = readPackageSource('scripts/regression/run-real-acp-canvas-artifact-regression.mjs');

    expect(smokeSource).toContain("projectId: 'smoke-client',");
    expect(smokeSource).toContain('buildProjectApiUrl(context.origin,');
    expect(smokeSource).not.toContain('`${context.origin}/api/export-html');
    expect(smokeSource).not.toContain('`${context.origin}/api/git/status`');
    expect(realAcpSource).toContain("throw new Error('Project-scoped regression request requires projectId');");
    expect(realAcpSource).toContain("appendProjectIdSearchParam(new URL('/api/prototypes/create-placeholder', baseUrl), projectId)");
  });

  it('configures the canvas bridge from the explicit request context', () => {
    const source = readPackageSource('src/server/managementApi.ts');

    expect(source).toContain('getCanvasBridgeHub().configureProjectRoot(requestContext.project.root);');
    expect(source).not.toContain('activeProjectContextForBridge');
    expect(source).not.toContain("'active-fallback'");
  });
});
