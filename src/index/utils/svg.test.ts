import { describe, expect, it } from 'vitest';

import type { ImageConfig } from '../types';
import { generateSvgContent } from './svg';

describe('generateSvgContent', () => {
  it('uses the captured screenshot size for screenshot covers instead of the capture viewport size', () => {
    const config: ImageConfig = {
      width: 1440,
      height: 1583,
      includeConfig: 'code',
      includeImageAssets: false,
      contentType: 'screenshot',
      isFullScreen: true,
      rawScreenshotUrl: 'data:image/png;base64,c2NyZWVuc2hvdA==',
      screenshotWidth: 1440,
      screenshotHeight: 1995,
      previewUrl: '',
    };

    const svg = generateSvgContent(config.rawScreenshotUrl, config, '新手指导', '原型');

    expect(svg).toContain('width="1440" height="1995"');
    expect(svg).toContain('viewBox="0 0 1440 1995"');
    expect(svg).toContain('<image x="0" y="0" width="1440" height="1995"');
    expect(svg).not.toContain('viewBox="0 0 1440 1583"');
  });
});
