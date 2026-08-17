import { AcpChatRunError, createAcpOneShotThreadId, normalizeAcpChatProvider, runAcpChatCommand, } from './acpChatRunner.ts';
const DEFAULT_ACP_API_BASE_URL = 'http://localhost:32124/api';
const DEFAULT_IMAGE_REQUEST_PARAMS = {
    size: 'auto',
    quality: 'auto',
    output_format: 'png',
    output_compression: null,
    moderation: 'auto',
    background: 'auto',
    n: 1,
    disable_prompt_optimization: false,
};
const SUPPORTED_IMAGE_REQUEST_SIZES = new Set([
    'auto',
    '1024x1024',
    '1024x1536',
    '1536x1024',
]);
function normalizeImageModel(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
}
function isGptImage2Model(value) {
    return normalizeImageModel(value) === 'gpt-image-2';
}
function parseImageSize(value) {
    const match = value.match(/^(\d+)x(\d+)$/u);
    if (!match)
        return null;
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0)
        return null;
    return { width, height };
}
function isSupportedGptImage2Size(value) {
    if (value === 'auto')
        return true;
    const parsed = parseImageSize(value);
    if (!parsed)
        return false;
    const { width, height } = parsed;
    const pixels = width * height;
    const maxSide = Math.max(width, height);
    const ratio = maxSide / Math.min(width, height);
    return width % 16 === 0
        && height % 16 === 0
        && maxSide < 3840
        && ratio <= 3
        && pixels >= 655_360
        && pixels <= 8_294_400;
}
function isSupportedImageRequestSize(value, model) {
    return isGptImage2Model(model)
        ? isSupportedGptImage2Size(value)
        : SUPPORTED_IMAGE_REQUEST_SIZES.has(value);
}
export function normalizeAiImageRequestParams(input, defaults = DEFAULT_IMAGE_REQUEST_PARAMS, options = {}) {
    const resolvedDefaults = {
        ...DEFAULT_IMAGE_REQUEST_PARAMS,
        ...defaults,
    };
    const quality = input?.quality === 'auto' || input?.quality === 'low' || input?.quality === 'medium' || input?.quality === 'high'
        ? input.quality
        : resolvedDefaults.quality;
    const outputFormat = input?.output_format === 'png' || input?.output_format === 'jpeg' || input?.output_format === 'webp'
        ? input.output_format
        : resolvedDefaults.output_format;
    const moderation = input?.moderation === 'auto' || input?.moderation === 'low'
        ? input.moderation
        : resolvedDefaults.moderation;
    const resolvedBackground = input?.background === 'auto' || input?.background === 'transparent'
        ? input.background
        : resolvedDefaults.background;
    const background = outputFormat === 'png' && resolvedBackground === 'transparent'
        ? 'transparent'
        : 'auto';
    const n = typeof input?.n === 'number' && Number.isFinite(input.n)
        ? Math.min(10, Math.max(1, Math.round(input.n)))
        : resolvedDefaults.n;
    const outputCompression = input?.output_compression == null
        ? resolvedDefaults.output_compression
        : typeof input.output_compression === 'number' && Number.isFinite(input.output_compression)
            ? Math.min(100, Math.max(0, Math.round(input.output_compression)))
            : resolvedDefaults.output_compression;
    const requestedSize = typeof input?.size === 'string' ? input.size.trim() : '';
    const defaultSize = typeof resolvedDefaults.size === 'string' ? resolvedDefaults.size.trim() : '';
    const size = isSupportedImageRequestSize(requestedSize, options.model)
        ? requestedSize
        : isSupportedImageRequestSize(defaultSize, options.model)
            ? defaultSize
            : DEFAULT_IMAGE_REQUEST_PARAMS.size;
    return {
        size,
        quality,
        output_format: outputFormat,
        output_compression: outputCompression,
        moderation,
        background,
        n,
        disable_prompt_optimization: input?.disable_prompt_optimization === true,
    };
}
function isRecordValue(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function mergeActualParams(...sources) {
    const merged = Object.assign({}, ...sources.filter((source) => source && Object.keys(source).length));
    return Object.keys(merged).length ? merged : undefined;
}
function pickActualParams(source) {
    if (!isRecordValue(source))
        return undefined;
    const actualParams = {};
    if (typeof source.size === 'string')
        actualParams.size = source.size;
    if (source.quality === 'auto' || source.quality === 'low' || source.quality === 'medium' || source.quality === 'high') {
        actualParams.quality = source.quality;
    }
    if (source.output_format === 'png' || source.output_format === 'jpeg' || source.output_format === 'webp') {
        actualParams.output_format = source.output_format;
    }
    if (typeof source.output_compression === 'number')
        actualParams.output_compression = source.output_compression;
    if (source.moderation === 'auto' || source.moderation === 'low')
        actualParams.moderation = source.moderation;
    if (source.background === 'auto' || source.background === 'transparent')
        actualParams.background = source.background;
    if (typeof source.n === 'number')
        actualParams.n = source.n;
    if (typeof source.disable_prompt_optimization === 'boolean') {
        actualParams.disable_prompt_optimization = source.disable_prompt_optimization;
    }
    return Object.keys(actualParams).length ? actualParams : undefined;
}
function normalizeAcpApiBaseUrl(value) {
    const raw = typeof value === 'string' ? value.trim().replace(/\/+$/u, '') : '';
    return raw || DEFAULT_ACP_API_BASE_URL;
}
function normalizeImageProvider(value) {
    const provider = normalizeAcpChatProvider(value);
    return provider === 'manual' ? 'codex' : provider;
}
function buildImageBuiltinToolSettings(config) {
    const imageGeneration = {
        ...(typeof config.baseUrl === 'string' && config.baseUrl.trim() ? { baseUrl: config.baseUrl.trim() } : {}),
        ...(typeof config.apiKey === 'string' && config.apiKey.trim() ? { apiKey: config.apiKey.trim() } : {}),
        ...(typeof config.model === 'string' && config.model.trim() ? { model: config.model.trim() } : {}),
    };
    return Object.keys(imageGeneration).length ? { imageGeneration } : undefined;
}
export function buildImageGenerationPrompt(params) {
    const requestParams = params.requestParams;
    const model = normalizeImageModel(params.imageModel);
    return [
        'Generate image assets for Axhub Make.',
        'Use the generate_image tool and return the generated image metadata.',
        'Do not call any direct image generation HTTP endpoint.',
        'For UI, web, app, interface, product-screen, or design-mockup requests, first use the project-local $ui-design-image skill and follow its device/aspect-ratio defaults when size is auto or the user did not specify a canvas ratio.',
        isGptImage2Model(model)
            ? 'When passing image size to gpt-image-2, custom WxH sizes must use dimensions divisible by 16, max side below 3840px, aspect ratio no wider than 3:1, and total pixels from 655,360 to 8,294,400; express exact phone/desktop proportions in the prompt text.'
            : 'When passing image size to non-gpt-image-2 models, use only auto, 1024x1024, 1024x1536, or 1536x1024; express exact phone/desktop proportions in the prompt text.',
        '',
        `Prompt: ${params.prompt}`,
        '',
        'Requested image parameters:',
        ...(params.imageModel ? [`- model: ${params.imageModel}`] : []),
        `- size: ${requestParams.size}`,
        `- quality: ${requestParams.quality}`,
        `- output format: ${requestParams.output_format}`,
        `- moderation: ${requestParams.moderation}`,
        ...(requestParams.background === 'transparent' ? [`- background: ${requestParams.background}`] : []),
        `- count: ${requestParams.n}`,
        ...(requestParams.output_compression == null ? [] : [`- output compression: ${requestParams.output_compression}`]),
        ...(requestParams.disable_prompt_optimization ? ['- preserve the prompt text; do not rewrite it before using the tool'] : []),
        ...(params.savePathPattern
            ? [
                '',
                'Project asset storage:',
                `- When calling generate_image, pass savePath using this workspace-relative pattern: ${params.savePathPattern}`,
                '- Use one generated image file per savePath, and keep files inside the requested project path.',
            ]
            : []),
        ...(params.referenceImages.length
            ? [
                '',
                'Reference images:',
                ...params.referenceImages.map((image, index) => `- Reference image ${index + 1}: ${image}`),
                'Use the reference images as visual, layout, and style context.',
            ]
            : []),
    ].join('\n');
}
function getNestedRecord(value, key) {
    if (!isRecordValue(value))
        return null;
    const nested = value[key];
    return isRecordValue(nested) ? nested : null;
}
function getRecordString(value, keys) {
    for (const key of keys) {
        const raw = value[key];
        if (typeof raw === 'string' && raw.trim())
            return raw.trim();
    }
    return '';
}
function getRecordNumber(value, keys) {
    for (const key of keys) {
        const raw = value[key];
        const numberValue = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() ? Number(raw) : NaN;
        if (Number.isFinite(numberValue))
            return numberValue;
    }
    return undefined;
}
export function collectImageRecordsFromValue(value, output) {
    if (!value)
        return;
    if (Array.isArray(value)) {
        value.forEach((item) => collectImageRecordsFromValue(item, output));
        return;
    }
    if (!isRecordValue(value))
        return;
    const record = value;
    if (Array.isArray(record.images)) {
        output.push(record);
    }
    collectImageRecordsFromValue(record.structuredContent, output);
    collectImageRecordsFromValue(record.output, output);
    collectImageRecordsFromValue(record.content, output);
    collectImageRecordsFromValue(record.result, output);
    collectImageRecordsFromValue(record.records, output);
}
export function collectImageRecords(toolOutputs) {
    const records = [];
    for (const toolOutput of toolOutputs) {
        if (toolOutput.toolName && toolOutput.toolName !== 'generate_image' && toolOutput.toolName !== 'image-generation') {
            continue;
        }
        collectImageRecordsFromValue(toolOutput.output, records);
        collectImageRecordsFromValue(getNestedRecord(toolOutput.chunk, 'structuredContent'), records);
    }
    return records;
}
function isRemoteHttpImageUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
    }
    catch {
        return false;
    }
}
function normalizeImageMimeType(value, fallback = 'image/png') {
    const fallbackMimeType = fallback.trim().split(';', 1)[0].toLowerCase();
    const safeFallback = fallbackMimeType.startsWith('image/') ? fallbackMimeType : 'image/png';
    const mimeType = (value || '').trim().split(';', 1)[0].toLowerCase();
    return mimeType.startsWith('image/') ? mimeType : safeFallback;
}
function isImageMimeType(value) {
    return value.trim().split(';', 1)[0].toLowerCase().startsWith('image/');
}
async function fetchRemoteImageAsDataUrl(params) {
    const response = await params.fetchImpl(params.url, { cache: 'no-store' });
    if (!response.ok) {
        throw new Error(`ACP image URL 下载失败：${response.status}`);
    }
    const contentType = response.headers.get('content-type') || '';
    if (contentType.trim() && !isImageMimeType(contentType)) {
        throw new Error('ACP image URL 没有返回图片内容。');
    }
    const mimeType = normalizeImageMimeType(contentType, params.fallbackMimeType || 'image/png');
    return `data:${mimeType};base64,${Buffer.from(await response.arrayBuffer()).toString('base64')}`;
}
async function getImageDataUrl(image, fetchImpl) {
    const url = getRecordString(image, ['url', 'dataUrl', 'dataURL']);
    if (url.startsWith('data:image/'))
        return url;
    const base64 = getRecordString(image, ['b64_json', 'base64', 'data']);
    const mimeType = getRecordString(image, ['mimeType', 'mime_type']) || 'image/png';
    if (base64)
        return `data:${mimeType};base64,${base64}`;
    if (isRemoteHttpImageUrl(url)) {
        return fetchRemoteImageAsDataUrl({ url, fetchImpl, fallbackMimeType: mimeType });
    }
    return '';
}
function normalizeImageMetadata(params) {
    const recordValue = params.record;
    const url = getRecordString(params.image, ['url', 'dataUrl', 'dataURL']) || params.dataUrl;
    const metadata = {
        ...(url ? { url } : {}),
        ...(getRecordString(params.image, ['fileName', 'file_name', 'filename']) ? { fileName: getRecordString(params.image, ['fileName', 'file_name', 'filename']) } : {}),
        ...(getRecordString(params.image, ['mimeType', 'mime_type']) ? { mimeType: getRecordString(params.image, ['mimeType', 'mime_type']) } : {}),
        ...(getRecordNumber(params.image, ['sizeBytes', 'size_bytes']) != null ? { sizeBytes: getRecordNumber(params.image, ['sizeBytes', 'size_bytes']) } : {}),
        ...(getRecordString(params.image, ['savedPath', 'saved_path', 'path']) ? { savedPath: getRecordString(params.image, ['savedPath', 'saved_path', 'path']) } : {}),
        ...(getRecordNumber(params.image, ['width']) != null ? { width: getRecordNumber(params.image, ['width']) } : {}),
        ...(getRecordNumber(params.image, ['height']) != null ? { height: getRecordNumber(params.image, ['height']) } : {}),
        ...(getRecordString(recordValue, ['recordId', 'record_id', 'id']) ? { recordId: getRecordString(recordValue, ['recordId', 'record_id', 'id']) } : {}),
        ...(getRecordString(recordValue, ['requestId', 'request_id']) ? { requestId: getRecordString(recordValue, ['requestId', 'request_id']) } : {}),
        ...(getRecordString(recordValue, ['prompt']) ? { prompt: getRecordString(recordValue, ['prompt']) } : {}),
        ...(params.revisedPrompt ? { revisedPrompt: params.revisedPrompt } : {}),
    };
    return Object.keys(metadata).length ? metadata : undefined;
}
export async function normalizeAcpImageRecord(record, fallbackActualParams, fetchImpl) {
    const status = typeof record.status === 'string' ? record.status.trim().toLowerCase() : '';
    if (status && !['succeeded', 'completed', 'success', 'done'].includes(status)) {
        throw new Error(`图片生成失败：${record.status}`);
    }
    const revisedPrompt = getRecordString(record, ['revisedPrompt', 'revised_prompt']);
    const images = [];
    for (const image of Array.isArray(record.images) ? record.images.filter(isRecordValue) : []) {
        const dataUrl = await getImageDataUrl(image, fetchImpl);
        if (!dataUrl)
            continue;
        const imageRevisedPrompt = getRecordString(image, ['revisedPrompt', 'revised_prompt']) || revisedPrompt;
        const rawUrl = getRecordString(image, ['url', 'dataUrl', 'dataURL']);
        const metadata = normalizeImageMetadata({ image, record, dataUrl, revisedPrompt: imageRevisedPrompt });
        images.push({
            dataUrl,
            ...(imageRevisedPrompt
                ? { revisedPrompt: imageRevisedPrompt }
                : {}),
            ...(rawUrl ? { rawUrl } : {}),
            ...(metadata ? { metadata } : {}),
        });
    }
    return {
        images,
        actualParams: mergeActualParams(fallbackActualParams, pickActualParams(record)),
    };
}
export async function fetchImageRecordsFallback(params) {
    const baseUrl = normalizeAcpApiBaseUrl(params.acpApiBaseUrl);
    const url = new URL(`${baseUrl}/tools/image-generation/records`);
    url.searchParams.set('workspacePath', params.workspacePath);
    url.searchParams.set('threadId', params.threadId);
    const response = await params.fetchImpl(url.toString(), { cache: 'no-store' });
    if (!response.ok)
        return [];
    const body = await response.json().catch(() => null);
    const records = [];
    collectImageRecordsFromValue(body, records);
    return records;
}
export function createPersistableRawResponsePayload(payload) {
    return JSON.stringify(payload, (key, value) => {
        if (typeof value !== 'string')
            return value;
        if (value.startsWith('data:image/')) {
            return '<image_data_url>';
        }
        if (key === 'b64_json'
            || key === 'base64'
            || key === 'data'
            || key === 'result'
            || (value.length > 96 && /^[A-Za-z0-9+/]+={0,2}$/u.test(value))) {
            return '<base64_data>';
        }
        return value;
    }, 2);
}
async function createResultFromRecords(params) {
    const normalizedRecords = (await Promise.all(params.records.map((record) => (normalizeAcpImageRecord(record, params.requestParams, params.fetchImpl))))).filter((record) => record.images.length);
    const images = normalizedRecords.flatMap((record) => record.images);
    if (!images.length) {
        const error = new Error('ACP image tool 没有返回可识别的图片数据。');
        error.rawResponsePayload = createPersistableRawResponsePayload(params.rawPayload);
        throw error;
    }
    const actualParamsList = normalizedRecords.flatMap((record) => (record.images.map(() => record.actualParams)));
    const revisedPrompts = images.map((image) => image.revisedPrompt);
    const hasImageMetadata = images.some((image) => Boolean(image.metadata));
    const imageMetadata = hasImageMetadata ? images.map((image) => image.metadata || {}) : [];
    const rawImageUrls = images.map((image) => image.rawUrl).filter((url) => Boolean(url));
    return {
        images: images.map((image) => image.dataUrl),
        actualParams: mergeActualParams(params.requestParams, { n: images.length }),
        actualParamsList,
        revisedPrompts,
        ...(imageMetadata.length ? { imageMetadata } : {}),
        ...(rawImageUrls.length ? { rawImageUrls } : {}),
        rawResponsePayload: createPersistableRawResponsePayload(params.rawPayload),
    };
}
export async function generateAiImages(options) {
    const prompt = options.prompt.trim();
    if (!prompt) {
        throw new Error('请输入提示词');
    }
    const imageModel = typeof options.config.model === 'string' ? options.config.model.trim() : '';
    const requestParams = normalizeAiImageRequestParams(options.params, undefined, { model: imageModel });
    const referenceImages = Array.isArray(options.referenceImages)
        ? options.referenceImages.filter((image) => typeof image === 'string' && image.trim().length > 0)
        : [];
    const fetchImpl = options.fetchImpl ?? fetch;
    const threadId = createAcpOneShotThreadId('image');
    try {
        const result = await runAcpChatCommand({
            acpApiBaseUrl: normalizeAcpApiBaseUrl(options.acpApiBaseUrl),
            id: threadId,
            threadId,
            provider: normalizeImageProvider(options.provider),
            workspacePath: options.workspacePath,
            prompt: buildImageGenerationPrompt({ prompt, requestParams, referenceImages, imageModel }),
            builtinTools: ['image-generation'],
            builtinToolSettings: buildImageBuiltinToolSettings(options.config),
        }, {
            fetchImpl,
            timeoutMs: options.timeoutMs,
        });
        const streamRecords = collectImageRecords(result.toolOutputs);
        const records = streamRecords.length
            ? streamRecords
            : await fetchImageRecordsFallback({
                acpApiBaseUrl: options.acpApiBaseUrl,
                workspacePath: options.workspacePath,
                threadId: result.threadId,
                fetchImpl,
            });
        return createResultFromRecords({
            records,
            requestParams,
            rawPayload: streamRecords.length ? result.toolOutputs.map((toolOutput) => toolOutput.output) : records,
            fetchImpl,
        });
    }
    catch (error) {
        if (error instanceof AcpChatRunError) {
            throw Object.assign(new Error(error.message || 'ACP image chat run failed'), {
                rawResponsePayload: error.result ? createPersistableRawResponsePayload(error.result.toolOutputs) : undefined,
            });
        }
        throw error;
    }
}
