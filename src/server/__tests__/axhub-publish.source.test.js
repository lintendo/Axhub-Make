import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
function readServerSource(relativePath) {
    return readFileSync(resolve(__dirname, '..', relativePath), 'utf8');
}
function readIndexSource(relativePath) {
    return readFileSync(resolve(__dirname, '../../index', relativePath), 'utf8');
}
describe('Axhub publish source contracts', () => {
    it('keeps auth tokens server-side and uses loopback HTTP callback with PKCE state', () => {
        const source = readServerSource('axhubAuthClient.ts');
        expect(source).toContain("const AUTH_FILE_NAME = 'axhub-auth.json';");
        expect(source).toContain('getGlobalMakeStateDir(homeDir)');
        expect(source).toContain('const redirectUri = `${params.localOrigin.replace(/\\/+$/u, \'\')}/api/axhub/callback`;');
        expect(source).toContain("authorizeUrl.searchParams.set('redirect_uri', redirectUri);");
        expect(source).toContain("authorizeUrl.searchParams.set('state', state);");
        expect(source).toContain("authorizeUrl.searchParams.set('code_challenge', sha256Base64Url(codeVerifier));");
        expect(source).toContain("grant_type: 'authorization_ticket'");
        expect(source).toContain('code_verifier: session.codeVerifier');
        expect(source).toContain('state !== session.state');
        expect(source).toContain('return `http://${host}`;');
    });
    it('refreshes access tokens and disconnects by revoking online tokens while clearing local auth', () => {
        const source = readServerSource('axhubAuthClient.ts');
        expect(source).toContain("grant_type: 'refresh_token'");
        expect(source).toContain('isTokenFresh(tokens.accessTokenExpiresAt)');
        expect(source).toContain("throw new AxhubApiError('Axhub 授权已过期，请重新授权'");
        expect(source).toContain("await request<{ success: boolean }>('/revoke', { method: 'POST' });");
        expect(source).toContain('Local disconnect should still complete if the online revoke request is unavailable.');
        expect(source).toContain('finally {');
        expect(source).toContain('tokens: undefined');
        expect(source).toContain('pendingSession: undefined');
    });
    it('mounts local Axhub API endpoints for connect, callback, project listing, creation, publishing, and disconnect', () => {
        const source = readServerSource('managementApi.axhub.ts');
        expect(source).toContain("pathname.startsWith('/api/axhub/')");
        expect(source).toContain("pathname === '/api/axhub/status'");
        expect(source).toContain("pathname === '/api/axhub/connect'");
        expect(source).toContain("pathname === '/api/axhub/connect-enterprise'");
        expect(source).toContain("pathname === '/api/axhub/callback'");
        expect(source).toContain("window.opener&&window.opener.postMessage({type:\"axhub-auth-success\"}");
        expect(source).toContain("pathname === '/api/axhub/disconnect'");
        expect(source).toContain("pathname === '/api/axhub/html-projects'");
        expect(source).toContain("pathname === '/api/axhub/publish'");
        expect(source).toContain('onlineBaseUrl: options.axhubOnlineBaseUrl');
        expect(source).toContain('buildExportHtmlStaticFiles');
        expect(source).toContain('createProjectCommunicationStore');
        expect(source).toContain("operationType: 'cloud.publish.axhub'");
        expect(source).toContain('axhubProjectId: result.pid');
        expect(source).toContain('prototypeId: built.reviewContext?.prototypeId');
        expect(source).not.toContain('writePrototypeReviewAxhubBinding');
        expect(source).toContain('reviewContext: reviewSubmitPrototypeId');
        expect(source).toContain('client.publishHtmlProject(pid, normalizeFilesForAxhub(built.files), built.reviewContext)');
        expect(source).not.toContain('createReviewSubmitInjectionOptions');
        expect(source).not.toContain('assertAxhubHostedHtmlCompatibility');
        expect(source).toContain('publishHtmlProject(pid, normalizeFilesForAxhub(built.files), built.reviewContext)');
    });
    it('does not require local annotation runtime compatibility before uploading HTML to Axhub', () => {
        const axhubSource = readServerSource('managementApi.axhub.ts');
        const cloudPublishingSource = readServerSource('managementApi.cloudPublishing.ts');
        const compatibilityModulePath = resolve(__dirname, '../axhubHtmlCompatibility.ts');
        const combinedSource = `${axhubSource}\n${cloudPublishingSource}`;
        expect(existsSync(compatibilityModulePath)).toBe(false);
        expect(combinedSource).not.toContain('assertAxhubHostedHtmlCompatibility');
        expect(combinedSource).not.toContain('AXHUB_HTML_MIN_ANNOTATION_VERSION');
        expect(combinedSource).not.toContain('AXHUB_HTML_ANNOTATION_RUNTIME_REQUIRED');
        expect(combinedSource).not.toContain('__AXHUB_ANNOTATION_RUNTIME__');
        expect(axhubSource).toContain('const rawResult = await client.publishHtmlProject(pid, normalizeFilesForAxhub(built.files), built.reviewContext);');
        expect(axhubSource).toContain('const result = normalizeAxhubPublishResultUrl(rawResult, client.getActiveBaseUrl());');
        expect(cloudPublishingSource).toContain('const result = await publishAxhubHtmlTarget({');
        expect(cloudPublishingSource).toContain("target !== 'axhub'");
        expect(cloudPublishingSource).toContain('prototypeId: reviewSubmitPrototypeId');
        expect(cloudPublishingSource).not.toContain('writePrototypeReviewAxhubBinding');
    });
    it('adds Axhub as a cloud publishing target without requiring generic cloud credentials', () => {
        const source = readServerSource('managementApi.cloudPublishing.ts');
        expect(source).toContain("export type CloudPublishTarget = 'vercel' | 'cloudflare-pages' | 's3' | 'github-pages' | 'axhub';");
        expect(source).toContain("const TARGETS = new Set<CloudPublishTarget>(['vercel', 'cloudflare-pages', 's3', 'github-pages', 'axhub'])");
        expect(source).toContain("if (target === 'axhub') {");
        expect(source).toContain('publishAxhubHtmlTarget');
        expect(source).toContain("if (target === 'axhub') {");
        expect(source).not.toContain('assertAxhubHostedHtmlCompatibility');
        expect(source).toContain('axhubProjectId: Number(body?.axhubProjectId || body?.pid)');
        expect(source).toContain("code: 'AXHUB_PROJECT_REQUIRED'");
        expect(source).toContain('Number(error?.status) || Number(error?.statusCode) || 500');
        expect(source).toContain('operationType: `cloud.publish.${target}`');
        expect(source).toContain('axhub: latest.axhub');
        expect(source).toContain('return []');
    });
    it('keeps the Axhub dialog Plus-gated and limited to HTML projects returned by the local API', () => {
        const source = readIndexSource('components/dialogs/AxhubPublishDialog.tsx');
        expect(source).toContain('apiService.getAxhubStatus()');
        expect(source).toContain('apiService.getAxhubHtmlProjects()');
        expect(source).toContain('const isPlus = status?.me?.isPlus === true;');
        expect(source).toContain('目前只有 Plus 会员支持创建和发布 HTML 项目。');
        expect(source).toContain("toast.error('目前只有 Plus 会员支持创建 HTML 项目')");
        expect(source).toContain("toast.error('目前只有 Plus 会员支持发布 HTML 项目')");
        expect(source).toContain('apiService.createAxhubHtmlProject(name)');
        expect(source).toContain('apiService.publishAxhubHtmlProject({');
        expect(source).toContain('function buildProjectPreviewUrl');
        expect(source).toContain("return `${normalizedBase}/html/${encodeURIComponent(String(project.path || ''))}/`;");
        expect(source).toContain('function buildEnterpriseProjectPreviewUrl');
        expect(source).toContain("return `${normalizedBase}/pro/${encodeURIComponent(String(project.path || ''))}/`;");
        expect(source).toContain('apiService.disconnectAxhub()');
    });
    it('keeps the disconnected Axhub auth UI compact and de-emphasizes enterprise auth', () => {
        const source = readIndexSource('components/dialogs/AxhubPublishDialog.tsx');
        expect(source).toContain('选择 Axhub 授权，或使用企业版地址和 Enterprise Token 连接。');
        expect(source).toContain('whitespace-nowrap');
        expect(source).toContain("{authorizing ? '等待授权完成' : '连接 Axhub'}");
        expect(source).not.toContain('连接 Axhub Online');
        expect(source).toContain('variant="link"');
        expect(source).toContain('连接企业版');
        expect(source).toContain('enterpriseFormOpen ? (');
        expect(source).toContain('className="flex items-center justify-between gap-2"');
        expect(source).not.toContain('className="flex justify-end"');
        expect(source).toContain('返回');
        expect(source).toContain('setEnterpriseFormOpen(false)');
    });
    it('exposes frontend API methods only through localhost runtime routes', () => {
        const source = readIndexSource('services/api.ts');
        expect(source).toContain("fetch('/api/axhub/status')");
        expect(source).toContain("fetch('/api/axhub/connect'");
        expect(source).toContain("fetch('/api/axhub/connect-enterprise'");
        expect(source).toContain("fetch('/api/axhub/disconnect'");
        expect(source).toContain('fetch(`/api/axhub/html-projects${query}`)');
        expect(source).toContain("fetch('/api/axhub/html-projects'");
        expect(source).toContain("fetch('/api/axhub/publish'");
        expect(source).toContain('async publishAxhubHtmlProject(payload: { pid: number; path: string; projectId?: string | null }): Promise<AxhubPublishResponse>');
    });
    it('keeps the Make client annotation dependency independent from Axhub publish gating', () => {
        const packageJson = readFileSync(resolve(__dirname, '../../../client/package.json'), 'utf8');
        const parsed = JSON.parse(packageJson);
        expect(typeof parsed.dependencies?.['@axhub/annotation']).toBe('string');
        expect(parsed.dependencies['@axhub/annotation']).not.toBe('');
    });
});
