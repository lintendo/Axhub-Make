import fs from 'node:fs';
import path from 'node:path';
import { AxhubApiError, createAxhubAuthClient, } from './axhubAuthClient.ts';
import { readJsonBody, sendJson } from './http.ts';
import { readLatestAxhubPublishBinding } from './axhubPublishBinding.ts';
import { getPrototypeDir, getPrototypeReviewsDir, } from './reviewLanSubmitConfig.ts';
const AXHUB_REVIEW_SERVICE_UNAVAILABLE_MESSAGE = 'Axhub 在线评审服务暂不可用';
function createClient(options) {
    return createAxhubAuthClient({
        registryPath: options.registryPath,
        serverInfoHomeDir: options.serverInfoHomeDir,
        onlineBaseUrl: options.axhubOnlineBaseUrl,
    });
}
function sendError(res, error, fallback) {
    if (error instanceof AxhubApiError && Number(error.status) === 404) {
        sendJson(res, {
            error: AXHUB_REVIEW_SERVICE_UNAVAILABLE_MESSAGE,
            code: 'AXHUB_REVIEW_SERVICE_UNAVAILABLE',
        }, { status: 503 });
        return;
    }
    sendJson(res, {
        error: error?.message || fallback,
        ...(error?.code ? { code: error.code } : {}),
        ...(error?.details !== undefined ? { details: error.details } : {}),
    }, { status: Number(error?.status) || Number(error?.statusCode) || 500 });
}
function getPrototypeContext(res, context, prototypeId) {
    const prototypeDir = getPrototypeDir(context.project.root, prototypeId);
    if (!prototypeDir) {
        sendJson(res, { error: 'Invalid prototype id', code: 'INVALID_PROTOTYPE_ID', prototypeId }, { status: 400 });
        return null;
    }
    if (!fs.existsSync(prototypeDir) || !fs.statSync(prototypeDir).isDirectory()) {
        sendJson(res, { error: 'Prototype not found', code: 'PROTOTYPE_NOT_FOUND', prototypeId }, { status: 404 });
        return null;
    }
    return prototypeDir;
}
function createConfigResponse(context, prototypeId, remote) {
    const binding = readLatestAxhubPublishBinding(context.project.root, {
        projectId: context.project.id,
        prototypeId,
    });
    if (!binding) {
        return {
            projectId: context.project.id,
            prototypeId,
            bound: false,
            submitEnabled: false,
            reviewReportCount: 0,
        };
    }
    if (remote && (remote.pid !== binding.pid
        || remote.path !== binding.path
        || remote.projectId !== binding.projectId
        || remote.prototypeId !== binding.prototypeId)) {
        throw new AxhubApiError('Axhub 发布绑定已失效，请重新发布', {
            status: 409,
            code: 'AXHUB_REVIEW_BINDING_INVALID',
        });
    }
    return {
        projectId: context.project.id,
        prototypeId,
        bound: true,
        submitEnabled: remote?.submitEnabled === true,
        reviewReportCount: Number(remote?.reviewReportCount) || 0,
        binding,
    };
}
function escapeFrontmatterValue(value) {
    return String(value || '')
        .replace(/\r?\n/gu, ' ')
        .replace(/\\/gu, '\\\\')
        .replace(/"/gu, '\\"')
        .trim();
}
function createSyncedReportMarkdown(report) {
    const body = report.content
        .replace(/^\s*---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/u, '')
        .replace(/^\s+/u, '');
    const content = body.endsWith('\n') ? body : `${body}\n`;
    return [
        '---',
        `title: "${escapeFrontmatterValue(report.title)}"`,
        `reviewer: "${escapeFrontmatterValue(report.reviewer || 'AI')}"`,
        `createdAt: ${report.createdAt}`,
        `source: "${escapeFrontmatterValue(report.source || 'axhub')}"`,
        typeof report.score === 'number' ? `score: ${report.score}` : null,
        `axhubReportId: "${escapeFrontmatterValue(report.id)}"`,
        `axhubPayloadHash: "${escapeFrontmatterValue(report.payloadHash)}"`,
        '---',
        '',
        content,
    ].filter((line) => line !== null).join('\n');
}
function readSyncedPayloadHash(filePath) {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        return '';
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return content.match(/^axhubPayloadHash:\s*["']?([^"'\r\n]+)["']?\s*$/mu)?.[1]?.trim() || '';
}
function writeFileAtomic(filePath, content) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    try {
        fs.writeFileSync(tempPath, content, 'utf8');
        fs.renameSync(tempPath, filePath);
    }
    finally {
        if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
        }
    }
}
function syncReportsToPrototype(prototypeDir, reports) {
    const reviewsDir = getPrototypeReviewsDir(prototypeDir);
    let created = 0;
    let updated = 0;
    let unchanged = 0;
    const changedReportIds = [];
    for (const report of reports) {
        if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(String(report.id || '')) || !String(report.payloadHash || '').trim()) {
            throw new AxhubApiError('Axhub 返回了无效的评审报告标识', {
                status: 502,
                code: 'AXHUB_REVIEW_REPORT_INVALID',
            });
        }
        const filePath = path.join(reviewsDir, `axhub-${report.id}.md`);
        const exists = fs.existsSync(filePath);
        if (exists && readSyncedPayloadHash(filePath) === report.payloadHash) {
            unchanged += 1;
            continue;
        }
        writeFileAtomic(filePath, createSyncedReportMarkdown(report));
        if (exists) {
            updated += 1;
        }
        else {
            created += 1;
        }
        changedReportIds.push(report.id);
    }
    return { created, updated, unchanged, changedReportIds };
}
export function handleAxhubReviewReportsApi(req, res, options, pathname, url, handlers) {
    if (pathname === '/api/review-reports/axhub-sync' && req.method === 'POST') {
        readJsonBody(req).then(async (body) => {
            const context = handlers.createProjectContextFromBody(req, res, options, body);
            if (!context)
                return;
            const prototypeId = String(body.prototypeId || '').trim();
            const prototypeDir = getPrototypeContext(res, context, prototypeId);
            if (!prototypeDir)
                return;
            const local = createConfigResponse(context, prototypeId);
            if (!local.bound) {
                sendJson(res, {
                    error: '重新发布到 Axhub 后可同步',
                    code: 'AXHUB_REVIEW_NOT_BOUND',
                }, { status: 409 });
                return;
            }
            const remote = await createClient(options).listHtmlProjectReviewReports(local.binding.pid);
            if (remote.pid !== local.binding.pid
                || remote.path !== local.binding.path
                || remote.projectId !== local.binding.projectId
                || remote.prototypeId !== local.binding.prototypeId) {
                throw new AxhubApiError('Axhub 发布绑定已失效，请重新发布', {
                    status: 409,
                    code: 'AXHUB_REVIEW_BINDING_INVALID',
                });
            }
            const reports = remote.reports.filter((report) => (report.projectId === local.binding.projectId
                && report.prototypeId === local.binding.prototypeId));
            const result = syncReportsToPrototype(prototypeDir, reports);
            sendJson(res, {
                projectId: context.project.id,
                prototypeId,
                ...result,
            });
        }).catch((error) => sendError(res, error, '同步 Axhub 评审报告失败'));
        return true;
    }
    if (pathname !== '/api/review-reports/axhub-config') {
        return false;
    }
    if (req.method === 'GET') {
        const context = handlers.resolveProjectContext(req, res, options, 'explicit-required');
        if (!context)
            return true;
        const prototypeId = String(url.searchParams.get('prototypeId') || '').trim();
        const prototypeDir = getPrototypeContext(res, context, prototypeId);
        if (!prototypeDir)
            return true;
        const local = createConfigResponse(context, prototypeId);
        if (!local.bound) {
            sendJson(res, local);
            return true;
        }
        createClient(options).getHtmlProjectReviewConfig(local.binding.pid)
            .then((remote) => sendJson(res, createConfigResponse(context, prototypeId, remote)))
            .catch((error) => sendError(res, error, '读取 Axhub 评审提交配置失败'));
        return true;
    }
    if (req.method === 'PUT') {
        readJsonBody(req).then(async (body) => {
            const context = handlers.createProjectContextFromBody(req, res, options, body);
            if (!context)
                return;
            const prototypeId = String(body.prototypeId || '').trim();
            const prototypeDir = getPrototypeContext(res, context, prototypeId);
            if (!prototypeDir)
                return;
            const local = createConfigResponse(context, prototypeId);
            if (!local.bound) {
                sendJson(res, {
                    error: '重新发布到 Axhub 后可开启',
                    code: 'AXHUB_REVIEW_NOT_BOUND',
                }, { status: 409 });
                return;
            }
            const remote = await createClient(options).updateHtmlProjectReviewConfig(local.binding.pid, body.submitEnabled === true);
            sendJson(res, createConfigResponse(context, prototypeId, remote));
        }).catch((error) => sendError(res, error, '更新 Axhub 评审提交配置失败'));
        return true;
    }
    sendJson(res, { error: 'Method not allowed' }, { status: 405 });
    return true;
}
