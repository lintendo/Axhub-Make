import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(new URL('./MakeCanvasVoiceEntry.tsx', import.meta.url), 'utf8');

describe('MakeCanvasVoiceEntry source contract', () => {
  it('keeps Canvas voice as an isolated ACP host surface', () => {
    expect(source).toContain('data-testid="make-canvas-voice-entry"');
    expect(source).toContain('injectAcpTools={false}');
    expect(source).toContain('tools={tools}');
    expect(source).not.toContain('MakeCommentaryVoiceEntry');
  });
});
