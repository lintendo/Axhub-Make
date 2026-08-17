export async function fetchItemCode(fullJsUrl: string) {
    const response = await fetch(fullJsUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch code: ${response.statusText}`);
    }
    return response.text();
}

function parseDownloadFileName(contentDisposition: string | null, fallback: string) {
    if (!contentDisposition) {
        return fallback;
    }

    const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match?.[1]) {
        try {
            return decodeURIComponent(utf8Match[1]);
        } catch {
            return utf8Match[1];
        }
    }

    const quotedMatch = contentDisposition.match(/filename="([^"]+)"/i);
    if (quotedMatch?.[1]) {
        return quotedMatch[1];
    }

    const plainMatch = contentDisposition.match(/filename=([^;]+)/i);
    if (plainMatch?.[1]) {
        return plainMatch[1].trim();
    }

    return fallback;
}

async function parseResponseError(response: Response) {
    try {
        const data = await response.json();
        if (typeof data?.error === 'string' && data.error.trim()) {
            return data.error.trim();
        }
    } catch {
        // ignore and fall through to text parsing
    }

    try {
        const text = await response.text();
        if (text.trim()) {
            return text.trim();
        }
    } catch {
        // ignore
    }

    return `导出失败（${response.status}）`;
}

export async function downloadExportHtmlArchive(
    targetPath: string | undefined,
    scope: ProjectScope,
    options: { includeSource?: boolean } = {},
) {
    const query = new URLSearchParams();
    if (targetPath) {
        query.set('path', targetPath);
    }
    if (options.includeSource === true) {
        query.set('includeSource', '1');
    }
    const suffix = query.toString();
    const url = withProjectScope(`/api/export-html${suffix ? `?${suffix}` : ''}`, scope);
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(await parseResponseError(response));
    }

    const fallbackFileName = targetPath
        ? `${targetPath.split('/').pop() || 'export'}-html.zip`
        : 'export-html.zip';
    const fileName = parseDownloadFileName(response.headers.get('Content-Disposition'), fallbackFileName);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);

    try {
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } finally {
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    }

    return fileName;
}
import type { ProjectScope } from '../../services/projectScope';
import { withProjectScope } from '../../services/projectScope';
