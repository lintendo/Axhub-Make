import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getConfigPath, } from '../projectCore/index.ts';
import { readPrototypeReviewLanSubmitEnabled, writePrototypeReviewLanSubmitConfig, } from '../reviewLanSubmitConfig.ts';
import { cleanupProjectApiTestRoots, createTempRoot, registerProject, setActiveProject, startTestServer, writeJson, writeProjectMetadata, } from './projects-api.helpers';
afterEach(() => {
    cleanupProjectApiTestRoots();
});
function writePrototype(projectRoot, prototypeId = 'home') {
    const prototypeDir = path.join(projectRoot, 'src', 'prototypes', prototypeId);
    fs.mkdirSync(prototypeDir, { recursive: true });
    fs.writeFileSync(path.join(prototypeDir, 'index.tsx'), 'export default function Home() { return null; }\n', 'utf8');
    return prototypeDir;
}
function getReviewConfigPath(prototypeDir) {
    return path.join(prototypeDir, '.spec', 'reviews', 'config.json');
}
function writeMultipartBody(params) {
    return [
        ...Object.entries(params.fields || {}).flatMap(([name, value]) => [
            `--${params.boundary}`,
            `Content-Disposition: form-data; name="${name}"`,
            '',
            value,
        ]),
        ...params.files.flatMap((file) => [
            `--${params.boundary}`,
            `Content-Disposition: form-data; name="${file.fieldName}"; filename="${file.fileName}"`,
            `Content-Type: ${file.contentType || 'text/markdown'}`,
            '',
            file.content,
        ]),
        `--${params.boundary}--`,
        '',
    ].join('\r\n');
}
async function readJsonResponse(response) {
    const headers = {};
    response.headers.forEach((value, key) => {
        headers[key] = value;
    });
    return {
        status: response.status,
        headers,
        body: await response.json().catch(() => ({})),
    };
}
describe('review report APIs', () => {
    it('keeps review config limited to review-owned submission settings', () => {
        const projectRoot = createTempRoot();
        const prototypeDir = writePrototype(projectRoot);
        writePrototypeReviewLanSubmitConfig(prototypeDir, true);
        expect(readPrototypeReviewLanSubmitEnabled(prototypeDir)).toBe(true);
        expect(JSON.parse(fs.readFileSync(getReviewConfigPath(prototypeDir), 'utf8'))).toEqual({
            schemaVersion: 1,
            lanSubmitEnabled: true,
        });
    });
    it('lists current-prototype review reports by newest time and reads markdown details', async () => {
        const projectRoot = createTempRoot();
        const prototypeDir = writePrototype(projectRoot);
        const reviewsDir = path.join(prototypeDir, '.spec', 'reviews');
        fs.mkdirSync(reviewsDir, { recursive: true });
        fs.writeFileSync(path.join(prototypeDir, '.spec', 'ui-review.md'), [
            '---',
            'title: Legacy UI Review Should Be Ignored',
            'reviewer: AI',
            'createdAt: 2026-03-03T00:00:00.000Z',
            '---',
            '',
            '# Legacy body',
            '',
        ].join('\n'), 'utf8');
        fs.writeFileSync(path.join(reviewsDir, 'early-review.md'), [
            '---',
            'title: 快递官网首页 · TRAE UI Review',
            'reviewer: Product',
            'createdAt: 2026-01-01T00:00:00.000Z',
            'source: ai-review',
            'score: 86',
            '---',
            '',
            '# Early body',
            '',
        ].join('\n'), 'utf8');
        fs.writeFileSync(path.join(reviewsDir, 'invalid-score-review.md'), [
            '---',
            'title: Invalid Score Review',
            'reviewer: AI',
            'createdAt: 2026-01-02T00:00:00.000Z',
            'score: 142',
            '---',
            '',
            '# Invalid score body',
            '',
        ].join('\n'), 'utf8');
        fs.writeFileSync(path.join(reviewsDir, 'latest-review.md'), '# Latest Review\n\nNewest report body.\n', 'utf8');
        fs.utimesSync(path.join(reviewsDir, 'latest-review.md'), new Date('2026-02-01T00:00:00.000Z'), new Date('2026-02-01T00:00:00.000Z'));
        writeProjectMetadata(projectRoot, {
            project: { id: 'review-client', name: 'Review Client' },
            resources: {
                prototypes: [{ id: 'home', name: 'home', title: 'Home', clientUrl: 'http://localhost:3000/home' }],
                themes: [],
            },
            navigation: { prototypes: ['home'] },
        });
        const server = await startTestServer(projectRoot);
        try {
            await registerProject(server.origin, projectRoot, 'review-client', 'Review Client');
            await setActiveProject(server.origin, 'review-client');
            const list = await fetch(`${server.origin}/api/review-reports?projectId=review-client&prototypeId=home`).then(readJsonResponse);
            expect(list).toMatchObject({
                status: 200,
                body: {
                    projectId: 'review-client',
                    prototypeId: 'home',
                    reports: [
                        expect.objectContaining({
                            id: 'latest-review',
                            title: 'Latest Review',
                            reviewer: 'AI',
                            createdAt: '2026-02-01T00:00:00.000Z',
                        }),
                        expect.objectContaining({
                            id: 'invalid-score-review',
                            title: 'Invalid Score Review',
                            reviewer: 'AI',
                        }),
                        expect.objectContaining({
                            id: 'early-review',
                            title: 'UI 评审',
                            reviewer: 'Product',
                            score: 86,
                        }),
                    ],
                },
            });
            expect(list.body.reports.map((report) => report.id)).not.toContain('ui-review');
            const invalidScoreReport = list.body.reports.find((report) => report.id === 'invalid-score-review');
            expect(invalidScoreReport).not.toHaveProperty('score');
            const detail = await fetch(`${server.origin}/api/review-reports/latest-review?projectId=review-client&prototypeId=home`).then(readJsonResponse);
            expect(detail).toMatchObject({
                status: 200,
                body: {
                    report: expect.objectContaining({
                        id: 'latest-review',
                        title: 'Latest Review',
                        markdown: '# Latest Review\n\nNewest report body.\n',
                    }),
                },
            });
            const ignoredFixedFileDetail = await fetch(`${server.origin}/api/review-reports/ui-review?projectId=review-client&prototypeId=home`).then(readJsonResponse);
            expect(ignoredFixedFileDetail).toMatchObject({ status: 404, body: { code: 'REVIEW_REPORT_NOT_FOUND' } });
            const scoredDetail = await fetch(`${server.origin}/api/review-reports/early-review?projectId=review-client&prototypeId=home`).then(readJsonResponse);
            expect(scoredDetail).toMatchObject({
                status: 200,
                body: {
                    report: expect.objectContaining({
                        id: 'early-review',
                        title: 'UI 评审',
                        score: 86,
                        markdown: '# Early body\n',
                    }),
                },
            });
            const deleteLatest = await fetch(`${server.origin}/api/review-reports/latest-review?projectId=review-client&prototypeId=home`, {
                method: 'DELETE',
            }).then(readJsonResponse);
            expect(deleteLatest).toMatchObject({
                status: 200,
                body: {
                    projectId: 'review-client',
                    prototypeId: 'home',
                    reportId: 'latest-review',
                    deleted: true,
                },
            });
            expect(fs.existsSync(path.join(reviewsDir, 'latest-review.md'))).toBe(false);
            const deletedDetail = await fetch(`${server.origin}/api/review-reports/latest-review?projectId=review-client&prototypeId=home`).then(readJsonResponse);
            expect(deletedDetail).toMatchObject({ status: 404, body: { code: 'REVIEW_REPORT_NOT_FOUND' } });
        }
        finally {
            await server.close();
        }
    });
    it('normalizes loose AI report metadata and bare section titles before detail rendering', async () => {
        const projectRoot = createTempRoot();
        const prototypeDir = writePrototype(projectRoot);
        const reviewsDir = path.join(prototypeDir, '.spec', 'reviews');
        fs.mkdirSync(reviewsDir, { recursive: true });
        fs.writeFileSync(path.join(reviewsDir, 'loose-ai-review.md'), [
            '---',
            'title: "快递官网首页 · TRAE UI Review" reviewer: "AI"',
            'createdAt: "2026-07-06T01:23:03+08:00" source: "ai-review" score: 82',
            'UI Review',
            '',
            '- 审查目标：src/prototypes/express-homepage-trae',
            '',
            '总体点评',
            '',
            '当前原型整体能成立。',
            '',
            'P0-P3 优先级问题',
            '',
            'P1 - 移动端导航 CTA 横向溢出视口',
            '',
            '- 证据：移动端首屏。',
            '',
        ].join('\n'), 'utf8');
        writeProjectMetadata(projectRoot, {
            project: { id: 'review-loose-client', name: 'Review Loose Client' },
            resources: {
                prototypes: [{ id: 'home', name: 'home', title: 'Home', clientUrl: 'http://localhost:3000/home' }],
                themes: [],
            },
            navigation: { prototypes: ['home'] },
        });
        const server = await startTestServer(projectRoot);
        try {
            await registerProject(server.origin, projectRoot, 'review-loose-client', 'Review Loose Client');
            await setActiveProject(server.origin, 'review-loose-client');
            const detail = await fetch(`${server.origin}/api/review-reports/loose-ai-review?projectId=review-loose-client&prototypeId=home`).then(readJsonResponse);
            expect(detail).toMatchObject({
                status: 200,
                body: {
                    report: expect.objectContaining({
                        title: 'UI 评审',
                        reviewer: 'AI',
                        score: 82,
                        source: 'ai-review',
                        markdown: [
                            '# UI 评审',
                            '',
                            '- 审查目标：src/prototypes/express-homepage-trae',
                            '',
                            '## 总体点评',
                            '',
                            '当前原型整体能成立。',
                            '',
                            '## P0-P3 优先级问题',
                            '',
                            '### P1 - 移动端导航 CTA 横向溢出视口',
                            '',
                            '- 证据：移动端首屏。',
                            '',
                        ].join('\n'),
                    }),
                },
            });
            expect(detail.body.report.markdown).not.toContain('reviewer:');
            expect(detail.body.report.markdown).not.toContain('createdAt:');
        }
        finally {
            await server.close();
        }
    });
    it('uploads markdown reports with reviewer metadata and avoids filename collisions', async () => {
        const projectRoot = createTempRoot();
        writePrototype(projectRoot);
        writeProjectMetadata(projectRoot, {
            project: { id: 'review-upload-client', name: 'Review Upload Client' },
            resources: {
                prototypes: [{ id: 'home', name: 'home', title: 'Home', clientUrl: 'http://localhost:3000/home' }],
                themes: [],
            },
            navigation: { prototypes: ['home'] },
        });
        const server = await startTestServer(projectRoot);
        try {
            await registerProject(server.origin, projectRoot, 'review-upload-client', 'Review Upload Client');
            await setActiveProject(server.origin, 'review-upload-client');
            const firstBoundary = '----axhub-review-upload-1';
            const first = await fetch(`${server.origin}/api/review-reports/upload`, {
                method: 'POST',
                headers: { 'Content-Type': `multipart/form-data; boundary=${firstBoundary}` },
                body: writeMultipartBody({
                    boundary: firstBoundary,
                    fields: {
                        projectId: 'review-upload-client',
                        prototypeId: 'home',
                        reviewer: 'Dev Team',
                    },
                    files: [{ fieldName: 'file', fileName: 'report.md', content: '# Uploaded Review\n\nBody.\n' }],
                }),
            }).then(readJsonResponse);
            expect(first).toMatchObject({
                status: 201,
                body: {
                    report: expect.objectContaining({
                        id: 'uploaded-review',
                        title: 'Uploaded Review',
                        reviewer: 'Dev Team',
                    }),
                },
            });
            const secondBoundary = '----axhub-review-upload-2';
            const second = await fetch(`${server.origin}/api/review-reports/upload`, {
                method: 'POST',
                headers: { 'Content-Type': `multipart/form-data; boundary=${secondBoundary}` },
                body: writeMultipartBody({
                    boundary: secondBoundary,
                    fields: {
                        projectId: 'review-upload-client',
                        prototypeId: 'home',
                        reviewer: 'Dev Team',
                    },
                    files: [{ fieldName: 'file', fileName: 'report.md', content: '# Uploaded Review\n\nSecond body.\n' }],
                }),
            }).then(readJsonResponse);
            expect(second).toMatchObject({
                status: 201,
                body: {
                    report: expect.objectContaining({
                        id: 'uploaded-review-2',
                        title: 'Uploaded Review',
                        reviewer: 'Dev Team',
                    }),
                },
            });
            const scoredBoundary = '----axhub-review-upload-3';
            const scored = await fetch(`${server.origin}/api/review-reports/upload`, {
                method: 'POST',
                headers: { 'Content-Type': `multipart/form-data; boundary=${scoredBoundary}` },
                body: writeMultipartBody({
                    boundary: scoredBoundary,
                    fields: {
                        projectId: 'review-upload-client',
                        prototypeId: 'home',
                    },
                    files: [{
                            fieldName: 'file',
                            fileName: 'scored-report.md',
                            content: [
                                '---',
                                'title: Scored Review',
                                'reviewer: Human Reviewer',
                                'score: 92',
                                '---',
                                '',
                                '# Scored Review',
                                '',
                                'Body.',
                                '',
                            ].join('\n'),
                        }],
                }),
            }).then(readJsonResponse);
            expect(scored).toMatchObject({
                status: 201,
                body: {
                    report: expect.objectContaining({
                        id: 'scored-review',
                        title: 'Scored Review',
                        reviewer: 'Human Reviewer',
                        score: 92,
                    }),
                },
            });
            expect(fs.existsSync(path.join(projectRoot, 'src', 'prototypes', 'home', '.spec', 'reviews', 'uploaded-review.md'))).toBe(true);
            expect(fs.existsSync(path.join(projectRoot, 'src', 'prototypes', 'home', '.spec', 'reviews', 'uploaded-review-2.md'))).toBe(true);
            expect(fs.existsSync(path.join(projectRoot, 'src', 'prototypes', 'home', '.spec', 'reviews', 'scored-review.md'))).toBe(true);
        }
        finally {
            await server.close();
        }
    });
    it('gates LAN report submission behind the report switch and ignores legacy project allowLAN', async () => {
        const projectRoot = createTempRoot();
        const homePrototypeDir = writePrototype(projectRoot);
        const settingsPrototypeDir = writePrototype(projectRoot, 'settings');
        writeProjectMetadata(projectRoot, {
            project: { id: 'review-lan-client', name: 'Review LAN Client' },
            resources: {
                prototypes: [
                    { id: 'home', name: 'home', title: 'Home', clientUrl: 'http://localhost:3000/home' },
                    { id: 'settings', name: 'settings', title: 'Settings', clientUrl: 'http://localhost:3000/settings' },
                ],
                themes: [],
            },
            navigation: { prototypes: ['home', 'settings'] },
        });
        const server = await startTestServer(projectRoot);
        try {
            await registerProject(server.origin, projectRoot, 'review-lan-client', 'Review LAN Client');
            await setActiveProject(server.origin, 'review-lan-client');
            const missingPrototypeConfig = await fetch(`${server.origin}/api/review-reports/lan-submit-config?projectId=review-lan-client`).then(readJsonResponse);
            expect(missingPrototypeConfig).toMatchObject({
                status: 400,
                body: { code: 'MISSING_PROTOTYPE_ID' },
            });
            const initialConfig = await fetch(`${server.origin}/api/review-reports/lan-submit-config?projectId=review-lan-client&prototypeId=home`).then(readJsonResponse);
            expect(initialConfig).toMatchObject({
                status: 200,
                body: {
                    projectId: 'review-lan-client',
                    prototypeId: 'home',
                    lanSubmitEnabled: false,
                    projectLanAllowed: true,
                },
            });
            const disabledSubmit = await fetch(`${server.origin}/api/review-reports/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId: 'review-lan-client',
                    prototypeId: 'home',
                    title: 'API Review',
                    reviewer: 'Backend AI',
                    content: '# API Review\n\nSubmitted by API.\n',
                }),
            }).then(readJsonResponse);
            expect(disabledSubmit).toMatchObject({ status: 403, body: { code: 'LAN_REVIEW_SUBMIT_DISABLED' } });
            const enabledConfig = await fetch(`${server.origin}/api/review-reports/lan-submit-config`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId: 'review-lan-client', prototypeId: 'home', lanSubmitEnabled: true }),
            }).then(readJsonResponse);
            expect(enabledConfig).toMatchObject({
                status: 200,
                body: {
                    projectId: 'review-lan-client',
                    prototypeId: 'home',
                    lanSubmitEnabled: true,
                    projectLanAllowed: true,
                },
            });
            expect(JSON.parse(fs.readFileSync(getReviewConfigPath(homePrototypeDir), 'utf8'))).toEqual({
                schemaVersion: 1,
                lanSubmitEnabled: true,
            });
            expect(fs.existsSync(getReviewConfigPath(settingsPrototypeDir))).toBe(false);
            const settingsConfig = await fetch(`${server.origin}/api/review-reports/lan-submit-config?projectId=review-lan-client&prototypeId=settings`).then(readJsonResponse);
            expect(settingsConfig).toMatchObject({
                status: 200,
                body: {
                    prototypeId: 'settings',
                    lanSubmitEnabled: false,
                },
            });
            const settingsDisabledSubmit = await fetch(`${server.origin}/api/review-reports/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId: 'review-lan-client',
                    prototypeId: 'settings',
                    title: 'Settings API Review',
                    content: '# Settings API Review\n',
                }),
            }).then(readJsonResponse);
            expect(settingsDisabledSubmit).toMatchObject({ status: 403, body: { code: 'LAN_REVIEW_SUBMIT_DISABLED' } });
            const submitted = await fetch(`${server.origin}/api/review-reports/submit?projectId=review-lan-client&prototypeId=home`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: 'API Review',
                    reviewer: 'Backend AI',
                    content: '# API Review\n\nSubmitted by API.\n',
                    source: 'lan-api',
                }),
            }).then(readJsonResponse);
            expect(submitted).toMatchObject({
                status: 201,
                body: {
                    report: expect.objectContaining({
                        id: 'api-review',
                        title: 'API Review',
                        reviewer: 'Backend AI',
                        source: 'lan-api',
                    }),
                },
            });
            expect(submitted.body.report).not.toHaveProperty('markdown');
            const submittedExists = await fetch(`${server.origin}/api/review-reports/exists?projectId=review-lan-client&prototypeId=home&reportId=api-review`).then(readJsonResponse);
            expect(submittedExists).toMatchObject({
                status: 200,
                body: {
                    projectId: 'review-lan-client',
                    prototypeId: 'home',
                    reportId: 'api-review',
                    exists: true,
                },
            });
            const missingExists = await fetch(`${server.origin}/api/review-reports/exists?projectId=review-lan-client&prototypeId=home&reportId=missing-review`).then(readJsonResponse);
            expect(missingExists).toMatchObject({
                status: 200,
                body: {
                    projectId: 'review-lan-client',
                    prototypeId: 'home',
                    reportId: 'missing-review',
                    exists: false,
                },
            });
            writeJson(getConfigPath(projectRoot), { server: { host: 'localhost', allowLAN: false } });
            const legacyAllowLanIgnoredSubmit = await fetch(`${server.origin}/api/review-reports/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId: 'review-lan-client',
                    prototypeId: 'home',
                    title: 'Legacy AllowLAN Ignored',
                    content: '# Legacy AllowLAN Ignored\n',
                }),
            }).then(readJsonResponse);
            expect(legacyAllowLanIgnoredSubmit).toMatchObject({
                status: 201,
                body: {
                    report: expect.objectContaining({
                        id: 'legacy-allowlan-ignored',
                        title: 'Legacy AllowLAN Ignored',
                    }),
                },
            });
        }
        finally {
            await server.close();
        }
    });
    it('lets enabled LAN report submission bypass the global LAN password without opening other review APIs', async () => {
        const projectRoot = createTempRoot();
        writePrototype(projectRoot);
        writeProjectMetadata(projectRoot, {
            project: { id: 'review-lan-bypass-client', name: 'Review LAN Bypass Client' },
            resources: {
                prototypes: [{ id: 'home', name: 'home', title: 'Home', clientUrl: 'http://localhost:3000/home' }],
                themes: [],
            },
            navigation: { prototypes: ['home'] },
        });
        const server = await startTestServer(projectRoot);
        try {
            await registerProject(server.origin, projectRoot, 'review-lan-bypass-client', 'Review LAN Bypass Client');
            await setActiveProject(server.origin, 'review-lan-bypass-client');
            await fetch(`${server.origin}/api/access/password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: 'review-lan-secret' }),
            });
            const nonLocalHeaders = { 'x-forwarded-for': '192.168.1.55' };
            const protectedVersion = await fetch(`${server.origin}/api/version`, { headers: nonLocalHeaders }).then(readJsonResponse);
            expect(protectedVersion).toMatchObject({ status: 401, body: { code: 'LAN_AUTH_REQUIRED' } });
            const protectedList = await fetch(`${server.origin}/api/review-reports?projectId=review-lan-bypass-client&prototypeId=home`, { headers: nonLocalHeaders }).then(readJsonResponse);
            expect(protectedList).toMatchObject({ status: 401, body: { code: 'LAN_AUTH_REQUIRED' } });
            const protectedDetail = await fetch(`${server.origin}/api/review-reports/existing-report?projectId=review-lan-bypass-client&prototypeId=home`, { headers: nonLocalHeaders }).then(readJsonResponse);
            expect(protectedDetail).toMatchObject({ status: 401, body: { code: 'LAN_AUTH_REQUIRED' } });
            const disabledSubmit = await fetch(`${server.origin}/api/review-reports/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...nonLocalHeaders },
                body: JSON.stringify({
                    projectId: 'review-lan-bypass-client',
                    prototypeId: 'home',
                    title: 'Disabled LAN Submit',
                    content: '# Disabled LAN Submit\n',
                }),
            }).then(readJsonResponse);
            expect(disabledSubmit).toMatchObject({ status: 403, body: { code: 'LAN_REVIEW_SUBMIT_DISABLED' } });
            await fetch(`${server.origin}/api/review-reports/lan-submit-config`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId: 'review-lan-bypass-client', prototypeId: 'home', lanSubmitEnabled: true }),
            });
            const submitted = await fetch(`${server.origin}/api/review-reports/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...nonLocalHeaders },
                body: JSON.stringify({
                    projectId: 'review-lan-bypass-client',
                    prototypeId: 'home',
                    title: 'Bypassed LAN Submit',
                    reviewer: 'Team AI',
                    content: '# Bypassed LAN Submit\n\nSubmitted without LAN auth session.\n',
                }),
            }).then(readJsonResponse);
            expect(submitted).toMatchObject({
                status: 201,
                body: {
                    report: expect.objectContaining({
                        id: 'bypassed-lan-submit',
                        title: 'Bypassed LAN Submit',
                        reviewer: 'Team AI',
                    }),
                },
            });
            expect(submitted.body.report).not.toHaveProperty('markdown');
            const exists = await fetch(`${server.origin}/api/review-reports/exists?projectId=review-lan-bypass-client&prototypeId=home&reportId=bypassed-lan-submit`, { headers: nonLocalHeaders }).then(readJsonResponse);
            expect(exists).toMatchObject({
                status: 200,
                headers: {
                    'access-control-allow-origin': '*',
                },
                body: {
                    projectId: 'review-lan-bypass-client',
                    prototypeId: 'home',
                    reportId: 'bypassed-lan-submit',
                    exists: true,
                },
            });
            const missing = await fetch(`${server.origin}/api/review-reports/exists?projectId=review-lan-bypass-client&prototypeId=home&reportId=missing-report`, { headers: nonLocalHeaders }).then(readJsonResponse);
            expect(missing).toMatchObject({
                status: 200,
                body: {
                    projectId: 'review-lan-bypass-client',
                    prototypeId: 'home',
                    reportId: 'missing-report',
                    exists: false,
                },
            });
        }
        finally {
            await server.close();
        }
    });
    it('rejects unsafe prototype and report identifiers', async () => {
        const projectRoot = createTempRoot();
        writePrototype(projectRoot);
        writeProjectMetadata(projectRoot, {
            project: { id: 'review-safety-client', name: 'Review Safety Client' },
            resources: {
                prototypes: [{ id: 'home', name: 'home', title: 'Home', clientUrl: 'http://localhost:3000/home' }],
                themes: [],
            },
            navigation: { prototypes: ['home'] },
        });
        const server = await startTestServer(projectRoot);
        try {
            await registerProject(server.origin, projectRoot, 'review-safety-client', 'Review Safety Client');
            await setActiveProject(server.origin, 'review-safety-client');
            const unsafeList = await fetch(`${server.origin}/api/review-reports?projectId=review-safety-client&prototypeId=../secret`).then(readJsonResponse);
            expect(unsafeList).toMatchObject({ status: 400, body: { code: 'INVALID_PROTOTYPE_ID' } });
            const removedFeishuConfig = await fetch(`${server.origin}/api/review-reports/feishu-config?projectId=review-safety-client&prototypeId=home`).then(readJsonResponse);
            expect(removedFeishuConfig.status).toBe(404);
            const removedFeishuSync = await fetch(`${server.origin}/api/review-reports/feishu-sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId: 'review-safety-client', prototypeId: 'home' }),
            }).then(readJsonResponse);
            expect(removedFeishuSync.status).toBe(404);
            const unsafeDetail = await fetch(`${server.origin}/api/review-reports/../secret?projectId=review-safety-client&prototypeId=home`).then(readJsonResponse);
            expect(unsafeDetail.status).toBeGreaterThanOrEqual(400);
        }
        finally {
            await server.close();
        }
    });
});
