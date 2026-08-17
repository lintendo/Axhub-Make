import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./MakeCommentaryVoiceEntry.tsx', import.meta.url), 'utf8');
const appStyles = readFileSync(new URL('../../../index.css', import.meta.url), 'utf8');

describe('Make Commentary voice entry boundary', () => {
  it('keeps the launcher in the Make shell without importing ACP app globals', () => {
    expect(source).toContain("from '@axhub/acp/voice'");
    expect(source).not.toContain("import '@axhub/acp/react/styles.css';");
    expect(appStyles).toContain('@source "../node_modules/@axhub/acp/dist/components/assistant-ui/voice/*.mjs";');
    expect(appStyles).toContain('@source "../node_modules/@axhub/acp/dist/components/assistant-ui/voice.mjs";');
    expect(appStyles).toContain('@source "../node_modules/@axhub/acp/dist/components/ui/popover.mjs";');
    expect(source).toContain('AcpVoiceAssistant');
    expect(source).toContain('enabled');
    expect(source).toContain('if (!enabled) return null;');
		expect(source).toContain('serviceBaseUrl={serviceBaseUrl}');
    expect(source).toContain('injectAcpTools={false}');
    expect(source).toContain('draggable');
    expect(source).toContain('tools={tools}');
    expect(source).toContain('prompt={prompt}');
    expect(source).toContain('openSettings={openSettings}');
    expect(source).toContain('checkVoiceConfiguration={checkVoiceConfiguration}');
  });

  it('does not create an ACP transport or task store in the product wrapper', () => {
    expect(source).not.toMatch(/@\/lib\/acp2aisdk|\/api\/chat|streamAcpChat|task-service|localStorage|fetch\(/u);
		expect(source).not.toMatch(/MakeVoiceAssistant|VoiceSpeechAdapter|VoiceConversationBridge/u);
    expect(source).not.toMatch(/MicIcon|VoiceOrb|transcript|make-voice-panel|role=["'](?:log|alert|status)["']/u);
  });
});
