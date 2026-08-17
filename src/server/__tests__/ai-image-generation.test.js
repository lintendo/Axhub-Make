import { describe, expect, it, vi } from 'vitest';
import { generateAiImages, normalizeAiImageRequestParams } from '../aiImageGeneration.ts';
function sseJson(chunk) {
    return `data: ${JSON.stringify(chunk)}\n\n`;
}
function createSseResponse(events) {
    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
        start(controller) {
            for (const event of events) {
                controller.enqueue(encoder.encode(event));
            }
            controller.close();
        },
    }), {
        status: 200,
        headers: {
            'Content-Type': 'text/event-stream',
            'x-acp-thread-id': encodeURIComponent('image-thread-1'),
        },
    });
}
describe('AI image generation ACP bridge', () => {
    it('normalizes image request sizes against the configured image model', () => {
        expect(normalizeAiImageRequestParams({ size: '1024x1024' }).size).toBe('1024x1024');
        expect(normalizeAiImageRequestParams({ size: '1024x1536' }).size).toBe('1024x1536');
        expect(normalizeAiImageRequestParams({ size: '1536x1024' }).size).toBe('1536x1024');
        expect(normalizeAiImageRequestParams({ size: '768x1664' }, undefined, { model: 'gpt-image-2' }).size).toBe('768x1664');
        expect(normalizeAiImageRequestParams({ size: '1168x2528' }, undefined, { model: 'gpt-image-2' }).size).toBe('1168x2528');
        expect(normalizeAiImageRequestParams({ size: '1440x896' }, undefined, { model: 'gpt-image-2' }).size).toBe('1440x896');
        expect(normalizeAiImageRequestParams({ size: '1920x1200' }, undefined, { model: 'gpt-image-2' }).size).toBe('1920x1200');
        expect(normalizeAiImageRequestParams({ size: '1170x2532' }).size).toBe('auto');
        expect(normalizeAiImageRequestParams({ size: '3840x2160' }, undefined, { model: 'gpt-image-2' }).size).toBe('auto');
        expect(normalizeAiImageRequestParams({ size: '1440x896' }, { size: '1024x1536' }, { model: 'gpt-image-1' }).size).toBe('1024x1536');
        expect(normalizeAiImageRequestParams(undefined, { size: '1440x896' }, { model: 'gpt-image-2' }).size).toBe('1440x896');
    });
    it('directs UI image requests through the project ui-design-image skill', async () => {
        const fetchImpl = vi.fn(async () => createSseResponse([
            sseJson({
                type: 'tool-output-available',
                toolCallId: 'tool-call-image',
                toolName: 'generate_image',
                output: {
                    status: 'completed',
                    images: [
                        { url: 'data:image/png;base64,aW1hZ2U=', fileName: 'image.png' },
                    ],
                },
            }),
            sseJson({ type: 'finish', finishReason: 'stop' }),
            'data: [DONE]\n\n',
        ]));
        await generateAiImages({
            acpApiBaseUrl: 'http://acp.local/api',
            workspacePath: '/workspace',
            prompt: '生成一个移动端二手交易首页设计图',
            params: { n: 1 },
            config: {
                baseUrl: '',
                apiKey: '',
                model: '',
            },
            fetchImpl,
        });
        const requestBody = JSON.parse(String(fetchImpl.mock.calls[0][1].body));
        const prompt = requestBody.messages[0].parts[0].text;
        expect(prompt).toContain('$ui-design-image');
    });
    it('passes image API connection settings to ACP builtin tool settings', async () => {
        const fetchImpl = vi.fn(async () => createSseResponse([
            sseJson({
                type: 'tool-output-available',
                toolCallId: 'tool-call-image',
                toolName: 'generate_image',
                output: {
                    status: 'completed',
                    images: [
                        { url: 'data:image/png;base64,aW1hZ2U=', fileName: 'image.png' },
                    ],
                },
            }),
            sseJson({ type: 'finish', finishReason: 'stop' }),
            'data: [DONE]\n\n',
        ]));
        await generateAiImages({
            acpApiBaseUrl: 'http://acp.local/api',
            workspacePath: '/workspace',
            prompt: '生成图片',
            params: { n: 1 },
            config: {
                baseUrl: 'https://images.example.com/v1',
                apiKey: 'sk-image',
                model: 'gpt-image-2',
            },
            fetchImpl,
        });
        const requestBody = JSON.parse(String(fetchImpl.mock.calls[0][1].body));
        expect(requestBody.builtinToolSettings).toEqual({
            imageGeneration: {
                baseUrl: 'https://images.example.com/v1',
                apiKey: 'sk-image',
                model: 'gpt-image-2',
            },
        });
    });
    it('includes transparent background requests in the ACP image generation prompt', async () => {
        const fetchImpl = vi.fn(async () => createSseResponse([
            sseJson({
                type: 'tool-output-available',
                toolCallId: 'tool-call-image',
                toolName: 'generate_image',
                output: {
                    status: 'completed',
                    images: [
                        { url: 'data:image/png;base64,aW1hZ2U=', fileName: 'image.png' },
                    ],
                },
            }),
            sseJson({ type: 'finish', finishReason: 'stop' }),
            'data: [DONE]\n\n',
        ]));
        await generateAiImages({
            acpApiBaseUrl: 'http://acp.local/api',
            workspacePath: '/workspace',
            prompt: '生成透明背景图标',
            params: { n: 1, output_format: 'png', background: 'transparent' },
            config: {
                baseUrl: '',
                apiKey: '',
                model: '',
            },
            fetchImpl,
        });
        const requestBody = JSON.parse(String(fetchImpl.mock.calls[0][1].body));
        const prompt = requestBody.messages[0].parts[0].text;
        expect(prompt).toContain('- background: transparent');
    });
    it('omits background prompt lines for default image background requests', async () => {
        const fetchImpl = vi.fn(async () => createSseResponse([
            sseJson({
                type: 'tool-output-available',
                toolCallId: 'tool-call-image',
                toolName: 'generate_image',
                output: {
                    status: 'completed',
                    images: [
                        { url: 'data:image/png;base64,aW1hZ2U=', fileName: 'image.png' },
                    ],
                },
            }),
            sseJson({ type: 'finish', finishReason: 'stop' }),
            'data: [DONE]\n\n',
        ]));
        await generateAiImages({
            acpApiBaseUrl: 'http://acp.local/api',
            workspacePath: '/workspace',
            prompt: '生成普通图片',
            params: { n: 1, output_format: 'png', background: 'auto' },
            config: {
                baseUrl: '',
                apiKey: '',
                model: '',
            },
            fetchImpl,
        });
        const requestBody = JSON.parse(String(fetchImpl.mock.calls[0][1].body));
        const prompt = requestBody.messages[0].parts[0].text;
        expect(prompt).not.toContain('- background:');
    });
});
