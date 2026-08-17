import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('PresentationArea Commentary voice placement', () => {
  it('renders the shell-provided entry only in preview content', () => {
    const source = readFileSync(new URL('./PresentationArea.tsx', import.meta.url), 'utf8');

    expect(source).toContain('isPreviewContentMode && props.commentaryVoiceEntry');
    expect(source).toContain('{props.commentaryVoiceEntry}');
  });
});
