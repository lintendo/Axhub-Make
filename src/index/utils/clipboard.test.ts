import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyImageDataUrlToClipboard, copyToClipboard, writeFigmaOfficialClipboardPayload } from './clipboard';

const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
const clipboardItemDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'ClipboardItem');

function mockClipboardEnvironment(options: {
    hostname?: string;
    write?: ReturnType<typeof vi.fn>;
    writeText?: ReturnType<typeof vi.fn>;
}) {
    Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: {
            location: {
                hostname: options.hostname ?? 'localhost',
            },
        } satisfies Partial<Window>,
    });

    Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: {
            clipboard: {
                write: options.write,
                writeText: options.writeText ?? vi.fn().mockResolvedValue(undefined),
            },
        } satisfies Partial<Navigator>,
    });
}

function mockClipboardItem() {
    class ClipboardItemMock {
        readonly data: Record<string, Blob>;

        constructor(data: Record<string, Blob>) {
            this.data = data;
        }
    }

    Object.defineProperty(globalThis, 'ClipboardItem', {
        configurable: true,
        value: ClipboardItemMock,
    });
}

function restoreGlobal(name: 'navigator' | 'window' | 'document' | 'ClipboardItem', descriptor: PropertyDescriptor | undefined) {
    if (descriptor) {
        Object.defineProperty(globalThis, name, descriptor);
        return;
    }
    delete (globalThis as Record<string, unknown>)[name];
}

afterEach(() => {
    restoreGlobal('navigator', navigatorDescriptor);
    restoreGlobal('window', windowDescriptor);
    restoreGlobal('document', documentDescriptor);
    restoreGlobal('ClipboardItem', clipboardItemDescriptor);
});

describe('copyToClipboard', () => {
    it('surfaces a LAN-friendly hint when clipboard access is blocked because the document is not focused', async () => {
        mockClipboardEnvironment({
            hostname: '192.168.1.9',
            writeText: vi.fn().mockRejectedValue(
                new DOMException(
                    "Failed to execute 'writeText' on 'Clipboard': Document is not focused.",
                    'NotAllowedError',
                ),
            ),
        });

        await expect(copyToClipboard('runtime payload')).rejects.toThrow(/局域网 IP/);
        await expect(copyToClipboard('runtime payload')).rejects.toThrow(/切回当前页面后重试/);
    });

    it('writes Figma official clipboard payload as text/html in the focused host document', async () => {
        const write = vi.fn().mockResolvedValue(undefined);
        mockClipboardItem();
        mockClipboardEnvironment({ write });

        await writeFigmaOfficialClipboardPayload('{"title":"首页"}');

        expect(write).toHaveBeenCalledTimes(1);
        const [items] = write.mock.calls[0];
        expect(items).toHaveLength(1);
        const clipboardItem = items[0] as { data: Record<string, Blob> };
        const html = await clipboardItem.data['text/html'].text();
        const payloadBase64 = html.match(/<!--\(figh2d\)(.*)\(\/figh2d\)-->/)?.[1] || '';
        const payloadText = new TextDecoder().decode(
            Uint8Array.from(atob(payloadBase64), (char) => char.charCodeAt(0)),
        );

        expect(payloadText).toBe('{"title":"首页"}');
    });

    it('normalizes Figma clipboard focus failures from the host write path', async () => {
        mockClipboardItem();
        mockClipboardEnvironment({
            hostname: '192.168.1.9',
            write: vi.fn().mockRejectedValue(
                new DOMException(
                    "Failed to execute 'write' on 'Clipboard': Document is not focused.",
                    'NotAllowedError',
                ),
            ),
        });

        await expect(writeFigmaOfficialClipboardPayload('runtime payload')).rejects.toThrow(/局域网 IP/);
        await expect(writeFigmaOfficialClipboardPayload('runtime payload')).rejects.toThrow(/切回当前页面后重试/);
    });

    it('falls back to a copy event when async Figma clipboard writes are blocked by permissions policy', async () => {
        const write = vi.fn().mockRejectedValue(
            new DOMException(
                "Failed to execute 'write' on 'Clipboard': The Clipboard API has been blocked because of a permissions policy applied to the current document.",
                'NotAllowedError',
            ),
        );
        let copyListener: ((event: ClipboardEvent) => void) | null = null;
        const clipboardData = new Map<string, string>();
        const textarea = {
            value: '',
            style: {},
            setAttribute: vi.fn(),
            focus: vi.fn(),
            select: vi.fn(),
            remove: vi.fn(),
        };
        const documentMock = {
            body: { appendChild: vi.fn() },
            activeElement: { focus: vi.fn() },
            createElement: vi.fn(() => textarea),
            addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
                if (type === 'copy') copyListener = listener as (event: ClipboardEvent) => void;
            }),
            removeEventListener: vi.fn(),
            execCommand: vi.fn((command: string) => {
                expect(command).toBe('copy');
                copyListener?.({
                    preventDefault: vi.fn(),
                    clipboardData: {
                        setData: vi.fn((type: string, value: string) => {
                            clipboardData.set(type, value);
                        }),
                    },
                } as unknown as ClipboardEvent);
                return true;
            }),
        };
        mockClipboardItem();
        mockClipboardEnvironment({ write });
        Object.defineProperty(globalThis, 'document', {
            configurable: true,
            value: documentMock,
        });

        await writeFigmaOfficialClipboardPayload('{"title":"首页"}');

        expect(write).toHaveBeenCalledTimes(1);
        expect(documentMock.execCommand).toHaveBeenCalledWith('copy');
        expect(clipboardData.get('text/html')).toContain('<!--(figh2d)');
        expect(clipboardData.get('text/plain')).toBe('{"title":"首页"}');
    });
});

describe('copyImageDataUrlToClipboard', () => {
    it('writes the original image data URL as an image clipboard item', async () => {
        const write = vi.fn().mockResolvedValue(undefined);
        mockClipboardItem();
        mockClipboardEnvironment({ write });

        await copyImageDataUrlToClipboard('data:image/png;base64,aGVsbG8=');

        expect(write).toHaveBeenCalledTimes(1);
        const [items] = write.mock.calls[0];
        expect(items).toHaveLength(1);
        const clipboardItem = items[0] as { data: Record<string, Blob> };
        expect(Object.keys(clipboardItem.data)).toEqual(['image/png']);
        const blob = clipboardItem.data['image/png'];
        expect(blob.type).toBe('image/png');
        expect(await blob.text()).toBe('hello');
    });

    it('rejects non-image data URLs before writing to the clipboard', async () => {
        const write = vi.fn().mockResolvedValue(undefined);
        mockClipboardItem();
        mockClipboardEnvironment({ write });

        await expect(copyImageDataUrlToClipboard('data:text/plain;base64,aGVsbG8=')).rejects.toThrow(/图片数据/);

        expect(write).not.toHaveBeenCalled();
    });

    it('keeps image data URL parameters such as SVG charset while copying', async () => {
        const write = vi.fn().mockResolvedValue(undefined);
        mockClipboardItem();
        mockClipboardEnvironment({ write });

        await copyImageDataUrlToClipboard('data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E');

        const [items] = write.mock.calls[0];
        const clipboardItem = items[0] as { data: Record<string, Blob> };
        const blob = clipboardItem.data['image/svg+xml'];
        expect(blob.type).toBe('image/svg+xml');
        expect(await blob.text()).toBe('<svg/>');
    });
});
