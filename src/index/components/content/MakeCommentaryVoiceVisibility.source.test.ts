import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function read(relativeUrl: string): string {
  return readFileSync(new URL(relativeUrl, import.meta.url), 'utf8');
}

describe('Make Commentary voice visibility lifecycle', () => {
  it('restores the launcher preference without auto-connecting a voice session', () => {
    const source = read('../../app/IndexPage.tsx');

    expect(source).toContain('useState(getCommentaryVoiceVisible)');
    expect(source).toContain('setCommentaryVoiceVisible(nextVisible);');
    expect(source).not.toContain('setShowCommentaryVoice(false);');
    expect(source).toContain('enabled={commentaryVoiceVisible}');
    expect(source).toMatch(/commentaryVoiceAvailable\s*&& showCommentaryVoice/u);
  });

  it('wires exact show and hide labels into the existing Commentary more menu', () => {
    const toolbar = read('./PresentationToolbar.tsx');
    const area = read('./PresentationArea.tsx');

    const voiceMenuItem = toolbar.slice(
      toolbar.indexOf('{isQuickEditActive && onToggleCommentaryVoice ? ('),
      toolbar.indexOf('</button>', toolbar.indexOf('{isQuickEditActive && onToggleCommentaryVoice ? (')),
    );
    expect(toolbar).not.toContain("commentaryVoiceVisible ? '隐藏语音助手' : '显示语音助手'");
    expect(voiceMenuItem).toContain('role="menuitemcheckbox"');
    expect(voiceMenuItem).toContain('aria-checked={commentaryVoiceVisible}');
    expect(voiceMenuItem).toContain('<Mic className={hostMenuIconClass}');
    expect(voiceMenuItem).toContain('<Check className={hostMenuIconClass}');
    expect(voiceMenuItem).toContain('语音助手');
    expect(toolbar.slice(0, toolbar.indexOf('{isQuickEditActive && onToggleCommentaryVoice ? (')))
      .not.toContain('aria-checked={commentaryVoiceVisible}');
    expect(toolbar).toContain('onToggleCommentaryVoice?.();');
    expect(area).toContain('commentaryVoiceVisible={props.commentaryVoiceVisible}');
    expect(area).toContain('onToggleCommentaryVoice={props.onToggleCommentaryVoice}');
  });
});
