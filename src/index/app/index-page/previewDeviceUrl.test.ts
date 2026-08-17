import { describe, expect, it } from 'vitest';

import { createDefaultPreviewConfig } from '../../domains/device/preview-layout';
import {
  parsePreviewDeviceParam,
  serializePreviewDeviceParam,
} from './previewDeviceUrl';

describe('preview device URL', () => {
  it('parses preset and custom dimensions', () => {
    expect(parsePreviewDeviceParam('desktop')).toEqual({
      preset: 'desktop',
      width: 1440,
      height: 900,
    });
    expect(parsePreviewDeviceParam('393x852')).toEqual({
      preset: 'mobile',
      width: 393,
      height: 852,
    });
    expect(parsePreviewDeviceParam('820x1180')).toEqual({
      preset: 'tablet',
      width: 820,
      height: 1180,
    });
    expect(parsePreviewDeviceParam('1440x900')).toEqual({
      preset: 'custom',
      width: 1440,
      height: 900,
    });
  });

  it('rejects malformed and invalid dimensions', () => {
    for (const value of ['', '393X852', '393×852', '0x900', '-1x900', '279x900', '393x239', 'abc']) {
      expect(parsePreviewDeviceParam(value)).toBeNull();
    }
  });

  it('omits default desktop and serializes manual single devices only', () => {
    expect(serializePreviewDeviceParam(createDefaultPreviewConfig())).toBeNull();
    expect(serializePreviewDeviceParam(createDefaultPreviewConfig(), { explicitDesktop: true })).toBe('desktop');
    expect(serializePreviewDeviceParam({
      ...createDefaultPreviewConfig(),
      singlePreset: 'mobile',
    })).toBe('393x852');
    expect(serializePreviewDeviceParam({
      ...createDefaultPreviewConfig(),
      singlePreset: 'tablet',
    })).toBe('820x1180');
    expect(serializePreviewDeviceParam({
      ...createDefaultPreviewConfig(),
      singlePreset: 'custom',
      customWidth: 1280,
      customHeight: 800,
    })).toBe('1280x800');
    expect(serializePreviewDeviceParam({
      ...createDefaultPreviewConfig(),
      previewMode: 'split',
    })).toBeNull();
    expect(serializePreviewDeviceParam({
      ...createDefaultPreviewConfig(),
      previewMode: 'multi-page',
    })).toBeNull();
  });
});
