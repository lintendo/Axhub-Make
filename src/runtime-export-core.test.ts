import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { captureDocumentScreenshot } from './runtime-export-core';

const snapdomToPng = vi.fn();
const snapdomToJpg = vi.fn();

class FakeHTMLElement {
  style: Record<string, string> & {
    setProperty: (name: string, value: string, priority?: string) => void;
    removeProperty: (name: string) => void;
  };
  scrollWidth = 0;
  scrollHeight = 0;
  clientWidth = 0;
  clientHeight = 0;
  offsetWidth = 0;
  offsetHeight = 0;
  scrollLeft = 0;
  scrollTop = 0;

  constructor() {
    this.style = {
      marginLeft: '',
      marginRight: '',
      marginTop: '',
      marginBottom: '',
      paddingTop: '',
      paddingBottom: '',
      width: '',
      height: '',
      minHeight: '',
      display: '',
      alignItems: '',
      justifyContent: '',
      placeItems: '',
      backgroundImage: '',
      setProperty: (name: string, value: string) => {
        this.style[name] = value;
        if (name === 'background-image') {
          this.style.backgroundImage = value;
        }
      },
      removeProperty: (name: string) => {
        delete this.style[name];
        if (name === 'background-image') {
          this.style.backgroundImage = '';
        }
      },
    };
  }

  getBoundingClientRect() {
    return { width: 0, height: 0 };
  }

  querySelectorAll() {
    return [];
  }
}

class FakeHTMLImageElement extends FakeHTMLElement {
  currentSrc = '';
  private attributes = new Map<string, string>();

  getAttribute(name: string) {
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
    if (name === 'src') {
      this.currentSrc = value;
    }
  }

  removeAttribute(name: string) {
    this.attributes.delete(name);
  }
}

const originalGlobals = {
  HTMLElement: globalThis.HTMLElement,
  HTMLImageElement: globalThis.HTMLImageElement,
  document: globalThis.document,
  window: globalThis.window,
};

describe('runtime-export-core captureDocumentScreenshot', () => {
  beforeEach(() => {
    snapdomToPng.mockReset();
    snapdomToJpg.mockReset();
    (globalThis as any).__AXHUB_RUNTIME_EXPORT_CORE_TEST_SNAPDOM_TO_PNG__ = snapdomToPng;
    (globalThis as any).__AXHUB_RUNTIME_EXPORT_CORE_TEST_SNAPDOM_TO_JPG__ = snapdomToJpg;
    globalThis.HTMLElement = FakeHTMLElement as any;
    globalThis.HTMLImageElement = FakeHTMLImageElement as any;
    globalThis.window = {
      devicePixelRatio: 3,
      scrollX: 0,
      scrollY: 0,
      location: { href: 'http://localhost:51720/prototypes/home', origin: 'http://localhost:51720' },
      scrollTo: vi.fn((left: number, top: number) => {
        (globalThis.window as any).scrollX = left;
        (globalThis.window as any).scrollY = top;
      }),
      setTimeout: (callback: () => void) => {
        callback();
        return 1;
      },
      getComputedStyle: () => ({ backgroundImage: 'none' }),
    } as any;
    globalThis.document = {
      baseURI: 'http://localhost:51720/prototypes/home',
      querySelector: vi.fn(),
    } as any;
  });

  afterEach(() => {
    delete (globalThis as any).__AXHUB_RUNTIME_EXPORT_CORE_TEST_SNAPDOM_TO_PNG__;
    delete (globalThis as any).__AXHUB_RUNTIME_EXPORT_CORE_TEST_SNAPDOM_TO_JPG__;
    globalThis.HTMLElement = originalGlobals.HTMLElement;
    globalThis.HTMLImageElement = originalGlobals.HTMLImageElement;
    globalThis.document = originalGlobals.document;
    globalThis.window = originalGlobals.window;
  });

  it('captures a PNG with snapDOM using normalized dimensions and restores root styles', async () => {
    const element = new FakeHTMLElement();
    element.style.marginLeft = 'auto';
    element.style.marginRight = 'auto';
    element.style.width = '48%';
    element.style.height = 'auto';
    element.scrollWidth = 390.4;
    element.scrollHeight = 845.8;
    snapdomToPng.mockResolvedValue({
      src: 'data:image/png;base64,c25hcGRvbQ==',
      getAttribute: vi.fn(),
    });

    const result = await captureDocumentScreenshot(element as any, {
      targetWidth: 390.2,
      targetHeight: 845.6,
    });

    const [calledElement, calledOptions] = snapdomToPng.mock.calls[0];
    expect(calledElement).toBe(element);
    expect(calledOptions).toEqual(expect.objectContaining({
      width: 390,
      height: 846,
      dpr: 2,
      backgroundColor: '#fff',
      embedFonts: true,
      fallbackURL: expect.stringContaining('data:image/svg+xml'),
      cache: 'soft',
      fast: true,
      placeholders: false,
      outerTransforms: false,
      outerShadows: false,
    }));
    expect(result).toEqual({
      dataUrl: 'data:image/png;base64,c25hcGRvbQ==',
      width: 390,
      height: 846,
    });
    expect(element.style.marginLeft).toBe('auto');
    expect(element.style.marginRight).toBe('auto');
    expect(element.style.width).toBe('48%');
    expect(element.style.height).toBe('auto');
  });

  it('uses an explicit screenshot pixel ratio when provided', async () => {
    const element = new FakeHTMLElement();
    element.scrollWidth = 390;
    element.scrollHeight = 846;
    snapdomToPng.mockResolvedValue({
      src: 'data:image/png;base64,c25hcGRvbQ==',
      getAttribute: vi.fn(),
    });

    await captureDocumentScreenshot(element as any, {
      targetWidth: 390,
      targetHeight: 846,
      targetPixelRatio: 1,
    });

    const [calledElement, calledOptions] = snapdomToPng.mock.calls[0];
    expect(calledElement).toBe(element);
    expect(calledOptions).toEqual(expect.objectContaining({
      dpr: 1,
    }));
  });

  it('compresses JPEG screenshots until they fit the requested byte limit', async () => {
    const element = new FakeHTMLElement();
    element.scrollWidth = 1440;
    element.scrollHeight = 6746;
    snapdomToPng.mockResolvedValue({
      src: 'data:image/png;base64,cG5n',
      getAttribute: vi.fn(),
    });
    snapdomToJpg
      .mockResolvedValueOnce({
        src: `data:image/jpeg;base64,${Buffer.alloc(12).toString('base64')}`,
        getAttribute: vi.fn(),
      })
      .mockResolvedValueOnce({
        src: `data:image/jpeg;base64,${Buffer.alloc(8).toString('base64')}`,
        getAttribute: vi.fn(),
      });

    const result = await captureDocumentScreenshot(element as any, {
      targetWidth: 1440,
      targetHeight: 1080,
      format: 'jpeg',
      quality: 0.8,
      maxBytes: 10,
    });

    expect(snapdomToPng).not.toHaveBeenCalled();
    expect(snapdomToJpg).toHaveBeenCalledTimes(2);
    expect(snapdomToJpg.mock.calls[0][1]).toEqual(expect.objectContaining({
      format: 'jpeg',
      quality: 0.8,
    }));
    expect(snapdomToJpg.mock.calls[1][1].quality).toBeLessThan(0.8);
    expect(result.dataUrl).toMatch(/^data:image\/jpeg;base64,/);
    expect(Buffer.from(result.dataUrl.split(',')[1], 'base64')).toHaveLength(8);
  });

  it('uses requested screenshot dimensions as the viewport and exports the full scroll size', async () => {
    const element = new FakeHTMLElement();
    element.clientWidth = 1440;
    element.clientHeight = 1583;
    element.offsetWidth = 1440;
    element.offsetHeight = 1583;
    element.scrollWidth = 1440;
    element.scrollHeight = 1995;
    snapdomToPng.mockImplementation(async () => {
      expect(element.style.width).toBe('1440px');
      expect(element.style.height).toBe('1995px');
      expect(element.style.minHeight).toBe('1995px');
      return {
      src: 'data:image/png;base64,c25hcGRvbQ==',
      getAttribute: vi.fn(),
      };
    });

    const result = await captureDocumentScreenshot(element as any, {
      targetWidth: 1440,
      targetHeight: 1583,
      targetPixelRatio: 1,
    });

    const [calledElement, calledOptions] = snapdomToPng.mock.calls[0];
    expect(calledElement).toBe(element);
    expect(calledOptions).toEqual(expect.objectContaining({
      width: 1440,
      height: 1995,
    }));
    expect(result).toEqual({
      dataUrl: 'data:image/png;base64,c25hcGRvbQ==',
      width: 1440,
      height: 1995,
    });
  });

  it('captures only the requested viewport without expanding to the full scroll size', async () => {
    const element = new FakeHTMLElement();
    element.clientWidth = 390;
    element.clientHeight = 846;
    element.offsetWidth = 390;
    element.offsetHeight = 846;
    element.scrollWidth = 390;
    element.scrollHeight = 1995;
    snapdomToPng.mockResolvedValue({
      src: 'data:image/png;base64,c25hcGRvbQ==',
      getAttribute: vi.fn(),
    });

    const result = await captureDocumentScreenshot(element as any, {
      targetWidth: 390,
      targetHeight: 846,
      scope: 'viewport',
    });

    expect(snapdomToPng.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      width: 390,
      height: 846,
    }));
    expect(result).toEqual({
      dataUrl: 'data:image/png;base64,c25hcGRvbQ==',
      width: 390,
      height: 846,
    });
  });

  it('temporarily anchors the screenshot root and page chrome to the top-left viewport', async () => {
    const element = new FakeHTMLElement();
    const documentElement = new FakeHTMLElement();
    const body = new FakeHTMLElement();
    element.style.marginLeft = 'auto';
    element.style.marginRight = 'auto';
    element.style.marginTop = '48px';
    element.style.marginBottom = '24px';
    documentElement.style.width = '100%';
    documentElement.style.height = '100%';
    body.style.width = '100%';
    body.style.height = '100%';
    body.style.minHeight = '100vh';
    body.style.marginTop = '32px';
    body.style.paddingTop = '16px';
    body.style.paddingBottom = '8px';
    body.style.display = 'flex';
    body.style.alignItems = 'center';
    body.style.justifyContent = 'center';
    body.style.placeItems = 'center';
    element.scrollWidth = 390;
    element.scrollHeight = 846;
    document.body = body as any;
    document.documentElement = documentElement as any;
    snapdomToPng.mockImplementation(async (calledElement) => {
      expect(calledElement).toBe(element);
      expect(element.style.marginLeft).toBe('0');
      expect(element.style.marginRight).toBe('0');
      expect(element.style.marginTop).toBe('0');
      expect(element.style.marginBottom).toBe('0');
      expect(documentElement.style.width).toBe('390px');
      expect(documentElement.style.height).toBe('846px');
      expect(body.style.width).toBe('390px');
      expect(body.style.height).toBe('846px');
      expect(body.style.minHeight).toBe('846px');
      expect(body.style.marginTop).toBe('0');
      expect(body.style.paddingTop).toBe('0');
      expect(body.style.paddingBottom).toBe('0');
      expect(body.style.display).toBe('block');
      expect(body.style.alignItems).toBe('initial');
      expect(body.style.justifyContent).toBe('initial');
      expect(body.style.placeItems).toBe('initial');
      return {
        src: 'data:image/png;base64,c25hcGRvbQ==',
        getAttribute: vi.fn(),
      };
    });

    await captureDocumentScreenshot(element as any, {
      targetWidth: 390,
      targetHeight: 846,
    });

    expect(element.style.marginLeft).toBe('auto');
    expect(element.style.marginRight).toBe('auto');
    expect(element.style.marginTop).toBe('48px');
    expect(element.style.marginBottom).toBe('24px');
    expect(documentElement.style.width).toBe('100%');
    expect(documentElement.style.height).toBe('100%');
    expect(body.style.width).toBe('100%');
    expect(body.style.height).toBe('100%');
    expect(body.style.minHeight).toBe('100vh');
    expect(body.style.marginTop).toBe('32px');
    expect(body.style.paddingTop).toBe('16px');
    expect(body.style.paddingBottom).toBe('8px');
    expect(body.style.display).toBe('flex');
    expect(body.style.alignItems).toBe('center');
    expect(body.style.justifyContent).toBe('center');
    expect(body.style.placeItems).toBe('center');
  });

  it('captures from the scroll origin and restores previous scroll offsets', async () => {
    const element = new FakeHTMLElement();
    const documentElement = new FakeHTMLElement();
    const body = new FakeHTMLElement();
    element.scrollWidth = 390;
    element.scrollHeight = 846;
    element.scrollLeft = 9;
    element.scrollTop = 45;
    documentElement.scrollLeft = 11;
    documentElement.scrollTop = 67;
    body.scrollLeft = 13;
    body.scrollTop = 89;
    document.body = body as any;
    document.documentElement = documentElement as any;
    (globalThis.window as any).scrollX = 15;
    (globalThis.window as any).scrollY = 111;
    snapdomToPng.mockImplementation(async () => {
      expect((globalThis.window as any).scrollTo).toHaveBeenCalledWith(0, 0);
      expect((globalThis.window as any).scrollX).toBe(0);
      expect((globalThis.window as any).scrollY).toBe(0);
      expect(documentElement.scrollLeft).toBe(0);
      expect(documentElement.scrollTop).toBe(0);
      expect(body.scrollLeft).toBe(0);
      expect(body.scrollTop).toBe(0);
      expect(element.scrollLeft).toBe(0);
      expect(element.scrollTop).toBe(0);
      return {
        src: 'data:image/png;base64,c25hcGRvbQ==',
        getAttribute: vi.fn(),
      };
    });

    await captureDocumentScreenshot(element as any, {
      targetWidth: 390,
      targetHeight: 846,
    });

    expect((globalThis.window as any).scrollTo).toHaveBeenLastCalledWith(15, 111);
    expect((globalThis.window as any).scrollX).toBe(15);
    expect((globalThis.window as any).scrollY).toBe(111);
    expect(documentElement.scrollLeft).toBe(11);
    expect(documentElement.scrollTop).toBe(67);
    expect(body.scrollLeft).toBe(13);
    expect(body.scrollTop).toBe(89);
    expect(element.scrollLeft).toBe(9);
    expect(element.scrollTop).toBe(45);
  });

  it('temporarily disables root flex centering that can create blank top screenshot space', async () => {
    const element = new FakeHTMLElement();
    element.style.display = 'flex';
    element.style.alignItems = 'center';
    element.style.justifyContent = 'center';
    element.style.placeItems = 'center';
    element.scrollWidth = 390;
    element.scrollHeight = 846;
    snapdomToPng.mockImplementation(async (calledElement) => {
      expect(calledElement).toBe(element);
      expect(element.style.display).toBe('flex');
      expect(element.style.alignItems).toBe('initial');
      expect(element.style.justifyContent).toBe('initial');
      expect(element.style.placeItems).toBe('initial');
      return {
        src: 'data:image/png;base64,c25hcGRvbQ==',
        getAttribute: vi.fn(),
      };
    });

    await captureDocumentScreenshot(element as any, {
      targetWidth: 390,
      targetHeight: 846,
    });

    expect(element.style.display).toBe('flex');
    expect(element.style.alignItems).toBe('center');
    expect(element.style.justifyContent).toBe('center');
    expect(element.style.placeItems).toBe('center');
  });

  it('throws when snapDOM returns an empty image and still restores styles', async () => {
    const element = new FakeHTMLElement();
    element.style.marginLeft = 'auto';
    element.style.marginRight = 'auto';
    element.scrollWidth = 100;
    element.scrollHeight = 200;
    snapdomToPng.mockResolvedValue({
      src: '',
      getAttribute: vi.fn(() => ''),
    });

    await expect(captureDocumentScreenshot(element as any)).rejects.toThrow('snapdom returned an empty screenshot');
    expect(element.style.marginLeft).toBe('auto');
    expect(element.style.marginRight).toBe('auto');
  });

  it('propagates snapDOM failures without calling html-to-image fallback', async () => {
    const element = new FakeHTMLElement();
    element.scrollWidth = 100;
    element.scrollHeight = 200;
    snapdomToPng.mockRejectedValue(new Error('snapdom failed'));

    await expect(captureDocumentScreenshot(element as any)).rejects.toThrow('snapdom failed');
    expect(snapdomToPng).toHaveBeenCalledTimes(1);
  });
});

describe('runtime-export-core bundle boundaries', () => {
  it('keeps snapDOM as a static dependency so Vite does not emit cross-origin modulepreload paths', () => {
    const source = readFileSync(resolve(__dirname, './runtime-export-core.ts'), 'utf8');

    expect(source).toContain("import { snapdom, type SnapdomOptions } from '@zumer/snapdom';");
    expect(source).toContain('const snapdomToPng = testSnapdomToPng ?? snapdom.toPng;');
    expect(source).not.toContain("await import('@zumer/snapdom')");
    expect(source).not.toContain("import('@zumer/snapdom')");
  });
});
