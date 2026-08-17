import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function read(relativeUrl: string): string {
  return readFileSync(new URL(relativeUrl, import.meta.url), 'utf8');
}

describe('Make Commentary voice dependency boundary', () => {
  it('uses the assistant-ui runtime versions required by ACP voice', () => {
    const packageJson = JSON.parse(read('../../../../package.json')) as {
      dependencies: Record<string, string>;
      pnpm: { overrides: Record<string, string> };
    };
    const workspacePackageJson = JSON.parse(read('../../../../../../package.json')) as {
      pnpm: { overrides: Record<string, string> };
    };

    expect(packageJson.dependencies['@axhub/acp']).toBe('0.1.13');
    expect(packageJson.dependencies['@assistant-ui/react']).toBe('0.15.5');
    expect(packageJson.dependencies['@assistant-ui/react-ai-sdk']).toBe('1.4.4');
    expect(packageJson.pnpm.overrides['@assistant-ui/core']).toBe('0.3.7');
    expect(packageJson.pnpm.overrides['@assistant-ui/store']).toBe('0.3.6');
    expect(workspacePackageJson.pnpm.overrides['@assistant-ui/core']).toBe('0.3.7');
    expect(workspacePackageJson.pnpm.overrides['@assistant-ui/store']).toBe('0.3.6');
  });

  it('keeps only host tools and removes the duplicate browser speech stack', () => {
    const source = [
      read('./makeVoiceTools.ts'),
			read('./makeRealtimeVoice.ts'),
    ].join('\n');

    expect(source).not.toMatch(/@axhub\/acp|acp2aisdk|streamAcpChat|\/api\/chat|task-service|provider-registry/u);
    expect(source).not.toMatch(/from ['"].*annotationDirectRun/u);
    expect(source).toContain('dependencies.comments.submitCommentExecution');
    expect(source).not.toContain('dependencies.tasks.start');
    expect(source).toContain('dependencies.comments.create');
    expect(source).toContain('dependencies.page.capture');
		expect(source).not.toMatch(/SpeechRecognition|speechSynthesis|SpeechSynthesisUtterance/u);
  });

  it('imports ACP only at the thin Make product entry', () => {
    const source = read('../../components/content/MakeCommentaryVoiceEntry.tsx');

    expect(source).toContain("from '@axhub/acp/voice'");
		expect(source).toContain('AcpVoiceAssistant');
    expect(source).not.toMatch(/@\/lib\/acp2aisdk|streamAcpChat|\/api\/chat|task-service|localStorage|fetch\(/u);
  });

  it('opens the owning AI voice settings when realtime voice configuration is missing', () => {
    const indexPageSource = read('../../app/IndexPage.tsx');

    expect(indexPageSource).toContain("openSettingsDialog('ai', { voiceSection: 'voice-doubao' })");
    expect(indexPageSource).toContain('messageApi.warning(message)');
    expect(indexPageSource).not.toContain('openSettings={() => assistantController.handleOpenAcpWebAgent()}');
  });

  it('keeps the operation requestId in the production Commentary task projection', () => {
    const editorSource = read('../../../../vendor/axhub-commentary/src/core/editor/index.ts');
    const editorTypes = read('../../../../vendor/axhub-commentary/src/web-editor-types.ts');

    expect(editorSource).toContain('requestId: task.requestId');
    expect(editorTypes).toMatch(/visibleTasks: Array<\{[\s\S]*?requestId: string;/u);
  });
});
