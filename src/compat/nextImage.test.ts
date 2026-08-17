import { createElement, type ComponentType, type ImgHTMLAttributes } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

type NextImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  src: string;
  unoptimized?: boolean;
};

describe('Vite next/image adapter', () => {
  it('renders ACP QR data URLs as native images without Next-only attributes', async () => {
    const modulePath = './nextImage.tsx';
    const nextImageModule = await import(/* @vite-ignore */ modulePath).catch(() => null) as {
      default: ComponentType<NextImageProps>;
    } | null;

    expect(nextImageModule).not.toBeNull();
    if (!nextImageModule) return;

    const html = renderToStaticMarkup(createElement(nextImageModule.default, {
      src: 'data:image/png;base64,qr-code',
      alt: 'LAN access QR code',
      width: 208,
      height: 208,
      unoptimized: true,
      className: 'qr-code',
    }));

    expect(html).toContain('src="data:image/png;base64,qr-code"');
    expect(html).toContain('alt="LAN access QR code"');
    expect(html).toContain('width="208"');
    expect(html).toContain('height="208"');
    expect(html).toContain('class="qr-code"');
    expect(html).not.toContain('unoptimized');
  });
});
