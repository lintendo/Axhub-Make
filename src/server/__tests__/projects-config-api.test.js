import fs from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getGlobalServerConfigPath, getMakeClientMarkerPath, getProjectMetadataPath, } from '../projectCore/index.ts';
import { cleanupProjectApiTestRoots, createTempRoot, registerProject, scopeProjectApiUrl, startTestServer, writeJson, writeProjectMetadata, } from './projects-api.helpers';
import { handleConfigApi } from '../managementApi.config.ts';
afterEach(() => {
    vi.restoreAllMocks();
    cleanupProjectApiTestRoots();
});
async function startRegisteredConfigTestServer(projectRoot, registryHome, projectId, projectName = projectId) {
    const server = await startTestServer(projectRoot, registryHome);
    try {
        await registerProject(server.origin, projectRoot, projectId, projectName);
        return server;
    }
    catch (error) {
        await server.close();
        throw error;
    }
}
async function startImageApiProbeServer(responseBody = {
    data: [{ b64_json: 'aW1hZ2UtYnl0ZXM=' }],
}) {
    const requests = [];
    const server = createServer((req, res) => {
        const chunks = [];
        req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        req.on('end', () => {
            const rawBody = Buffer.concat(chunks).toString('utf8');
            requests.push({
                method: req.method || '',
                url: req.url || '',
                headers: req.headers,
                body: rawBody ? JSON.parse(rawBody) : null,
            });
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(responseBody));
        });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') {
        throw new Error('Image API probe test server did not bind to a TCP port');
    }
    return {
        origin: `http://127.0.0.1:${address.port}`,
        requests,
        close: () => new Promise((resolve, reject) => {
            server.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve();
            });
        }),
    };
}
describe('make-server project config APIs', () => {
    it('exposes config handling from its domain module', () => {
        expect(handleConfigApi).toBeTypeOf('function');
    });
    it('moves automation and assistant config writes to global server config', async () => {
        const projectRoot = createTempRoot();
        writeProjectMetadata(projectRoot, {
            project: { id: 'config-client', name: 'Config Client' },
        });
        writeJson(path.join(projectRoot, '.axhub', 'make', 'axhub.config.json'), {
            server: { host: 'localhost', allowLAN: true },
            projectInfo: { name: 'Project Config' },
            automation: {
                defaultPromptClient: 'acp:claude',
                defaultIDE: 'cursor',
            },
            assistant: {
                webBaseUrl: 'http://legacy.local',
                apiBaseUrl: 'http://legacy.local/api',
            },
        });
        const registryHome = createTempRoot('axhub-make-projects-api-home-');
        const server = await startRegisteredConfigTestServer(projectRoot, registryHome, 'config-client', 'Config Client');
        try {
            const legacyConfig = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/config`)).then((response) => response.json());
            expect(legacyConfig.automation).toEqual({
                conversationPromptClient: 'acp:claude',
                conversationModel: null,
                defaultIDE: 'cursor',
                injectLocalAiEntry: true,
                acp: {
                    mode: 'prompt',
                    permission: 'approve-all',
                    timeout: 1800,
                },
                annotationPromptClient: 'acp:claude',
                annotationModel: null,
                canvasPromptClient: 'acp:claude',
                canvasModel: null,
                agentRunConcurrency: 5,
            });
            expect(legacyConfig.automation).not.toHaveProperty('defaultPromptClient');
            expect(legacyConfig.assistant).toEqual({
                webBaseUrl: 'http://legacy.local',
                apiBaseUrl: 'http://legacy.local/api',
            });
            const saved = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/config`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    server: { host: '0.0.0.0', allowLAN: false, port: 51720 },
                    projectInfo: { name: 'Updated Project' },
                    automation: {
                        conversationPromptClient: 'acp:codex',
                        conversationModel: 'gpt-5.1-codex',
                        annotationPromptClient: 'acp:cursor',
                        annotationModel: 'fast-cursor',
                        canvasPromptClient: 'acp:qoder',
                        canvasModel: 'qoder-canvas',
                        defaultIDE: 'qoder',
                        injectLocalAiEntry: false,
                    },
                    assistant: {
                        webBaseUrl: 'http://assistant.local',
                        apiBaseUrl: 'http://assistant.local/api',
                    },
                }),
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(saved).toMatchObject({ status: 200, body: { success: true } });
            const projectConfig = JSON.parse(fs.readFileSync(path.join(projectRoot, '.axhub', 'make', 'axhub.config.json'), 'utf8'));
            expect(projectConfig).toEqual({
                server: { host: '0.0.0.0' },
            });
            expect(projectConfig.projectInfo).toBeUndefined();
            expect(projectConfig.automation).toBeUndefined();
            expect(projectConfig.assistant).toBeUndefined();
            const metadata = JSON.parse(fs.readFileSync(getProjectMetadataPath(projectRoot), 'utf8'));
            expect(metadata.project.name).toBe('Updated Project');
            const projects = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/projects`)).then((response) => response.json());
            expect(projects.projects).toEqual([
                expect.objectContaining({
                    id: 'config-client',
                    name: 'Updated Project',
                }),
            ]);
            const serverConfig = JSON.parse(fs.readFileSync(getGlobalServerConfigPath(registryHome), 'utf8'));
            expect(serverConfig).toEqual({
                automation: {
                    conversationPromptClient: 'acp:codex',
                    conversationModel: 'gpt-5.1-codex',
                    defaultIDE: 'qoder',
                    injectLocalAiEntry: false,
                    acp: {
                        mode: 'prompt',
                        permission: 'approve-all',
                        timeout: 1800,
                    },
                    annotationPromptClient: 'acp:cursor',
                    annotationModel: 'fast-cursor',
                    canvasPromptClient: 'acp:qoder',
                    canvasModel: 'qoder-canvas',
                    agentRunConcurrency: 5,
                },
                assistant: {
                    webBaseUrl: 'http://assistant.local',
                    apiBaseUrl: 'http://assistant.local/api',
                },
                ai: {
                    imageGeneration: {
                        baseUrl: 'https://api.openai.com/v1',
                        apiKey: null,
                        model: 'gpt-image-2',
                    },
                },
                uiPreferences: {
                    excalidrawPropertyPanelMode: 'collapsed',
                    excalidrawPropertyPanelPosition: 'right',
                },
                toolOpenState: {},
            });
            const nextConfig = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/config`)).then((response) => response.json());
            expect(nextConfig).toMatchObject({
                projectId: 'config-client',
                projectPath: projectRoot,
                server: { host: '0.0.0.0' },
                projectInfo: { name: 'Updated Project' },
                automation: {
                    conversationPromptClient: 'acp:codex',
                    conversationModel: 'gpt-5.1-codex',
                    annotationPromptClient: 'acp:cursor',
                    annotationModel: 'fast-cursor',
                    canvasPromptClient: 'acp:qoder',
                    canvasModel: 'qoder-canvas',
                    defaultIDE: 'qoder',
                    injectLocalAiEntry: false,
                    acp: {
                        mode: 'prompt',
                        permission: 'approve-all',
                        timeout: 1800,
                    },
                },
                assistant: {
                    webBaseUrl: 'http://assistant.local',
                    apiBaseUrl: 'http://assistant.local/api',
                },
                ai: {
                    imageGeneration: {
                        baseUrl: 'https://api.openai.com/v1',
                        model: 'gpt-image-2',
                    },
                },
            });
        }
        finally {
            await server.close();
        }
    });
    it('prefers explicit purpose fields when legacy and new AI preferences coexist', async () => {
        const projectRoot = createTempRoot();
        writeProjectMetadata(projectRoot, {
            project: { id: 'mixed-ai-preferences', name: 'Mixed AI Preferences' },
        });
        writeJson(path.join(projectRoot, '.axhub', 'make', 'axhub.config.json'), {
            server: { host: 'localhost' },
            projectInfo: { name: 'Mixed AI Preferences' },
        });
        const registryHome = createTempRoot('axhub-make-projects-api-home-');
        writeJson(getGlobalServerConfigPath(registryHome), {
            automation: {
                defaultPromptClient: 'acp:claude',
                conversationPromptClient: 'acp:qoder',
                conversationModel: '  conversation-model  ',
                annotationPromptClient: 'acp:cursor',
                annotationModel: '  annotation-model  ',
                canvasPromptClient: 'acp:codebuddy',
                canvasModel: '  canvas-model  ',
            },
        });
        const server = await startRegisteredConfigTestServer(projectRoot, registryHome, 'mixed-ai-preferences', 'Mixed AI Preferences');
        try {
            const config = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/config`))
                .then((response) => response.json());
            expect(config.automation).toMatchObject({
                conversationPromptClient: 'acp:qoder',
                conversationModel: 'conversation-model',
                annotationPromptClient: 'acp:cursor',
                annotationModel: 'annotation-model',
                canvasPromptClient: 'acp:codebuddy',
                canvasModel: 'canvas-model',
            });
            expect(config.automation).not.toHaveProperty('defaultPromptClient');
        }
        finally {
            await server.close();
        }
    });
    it('syncs project info into AGENTS and CLAUDE when project settings are saved', async () => {
        const projectRoot = createTempRoot();
        writeProjectMetadata(projectRoot, {
            project: { id: 'agent-instructions-client', name: 'Agent Instructions Client' },
            resources: {
                prototypes: [],
                themes: [
                    {
                        id: 'brand',
                        name: 'brand',
                        path: 'src/themes/brand',
                        sourcePath: 'src/themes/brand',
                    },
                ],
            },
        });
        writeJson(path.join(projectRoot, '.axhub', 'make', 'axhub.config.json'), {
            server: { host: 'localhost', allowLAN: true },
        });
        fs.writeFileSync(path.join(projectRoot, 'AGENTS.md'), [
            '# Agent 工作流程',
            '',
            '## 额外产物',
            '',
            '原有说明。',
            '',
        ].join('\n'), 'utf8');
        fs.writeFileSync(path.join(projectRoot, 'CLAUDE.md'), [
            '# Agent 工作流程',
            '',
            '## 项目信息',
            '',
            '- 项目名称：旧项目',
            '',
            '## 额外产物',
            '',
            '原有说明。',
            '',
        ].join('\n'), 'utf8');
        const registryHome = createTempRoot('axhub-make-projects-api-home-');
        const server = await startRegisteredConfigTestServer(projectRoot, registryHome, 'agent-instructions-client', 'Agent Instructions Client');
        try {
            const saved = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/config`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    server: { host: 'localhost', allowLAN: true },
                    projectInfo: {
                        name: '运营活动配置台',
                        description: '面向运营人员的活动配置后台',
                    },
                    projectDefaults: {
                        defaultTheme: 'brand',
                    },
                }),
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(saved).toMatchObject({ status: 200, body: { success: true } });
            const expectedProjectInfo = [
                '## 项目信息',
                '',
                '- 项目名称：运营活动配置台',
                '- 项目简介：面向运营人员的活动配置后台',
                '- 默认设计：brand（`src/themes/brand/DESIGN.md`）',
            ].join('\n');
            for (const fileName of ['AGENTS.md', 'CLAUDE.md']) {
                const source = fs.readFileSync(path.join(projectRoot, fileName), 'utf8');
                expect(source).toContain(expectedProjectInfo);
                expect(source).not.toContain('旧项目');
                expect(source).toContain('## 额外产物');
            }
        }
        finally {
            await server.close();
        }
    });
    it('syncs project info when the default design is changed from the design list', async () => {
        const projectRoot = createTempRoot();
        writeProjectMetadata(projectRoot, {
            project: { id: 'default-design-client', name: '运营活动配置台' },
            resources: {
                prototypes: [],
                themes: [
                    {
                        id: 'brand',
                        name: 'brand',
                        path: 'src/themes/brand',
                        sourcePath: 'src/themes/brand',
                    },
                ],
            },
        });
        writeJson(path.join(projectRoot, '.axhub', 'make', 'axhub.config.json'), {
            server: { host: 'localhost', allowLAN: true },
            projectInfo: { description: '面向运营人员的活动配置后台' },
            projectDefaults: { defaultTheme: 'legacy' },
        });
        fs.writeFileSync(path.join(projectRoot, 'AGENTS.md'), [
            '# Agent 工作流程',
            '',
            '## 项目信息',
            '',
            '- 项目名称：运营活动配置台',
            '- 项目简介：面向运营人员的活动配置后台',
            '- 默认设计：legacy（`src/themes/legacy/DESIGN.md`）',
            '',
            '## 额外产物',
            '',
            '原有说明。',
            '',
        ].join('\n'), 'utf8');
        const registryHome = createTempRoot('axhub-make-projects-api-home-');
        const server = await startRegisteredConfigTestServer(projectRoot, registryHome, 'default-design-client', '运营活动配置台');
        try {
            const saved = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/config`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectDefaults: {
                        defaultTheme: 'brand',
                    },
                }),
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(saved).toMatchObject({ status: 200, body: { success: true } });
            const expectedProjectInfo = [
                '## 项目信息',
                '',
                '- 项目名称：运营活动配置台',
                '- 项目简介：面向运营人员的活动配置后台',
                '- 默认设计：brand（`src/themes/brand/DESIGN.md`）',
            ].join('\n');
            for (const fileName of ['AGENTS.md', 'CLAUDE.md']) {
                const source = fs.readFileSync(path.join(projectRoot, fileName), 'utf8');
                expect(source).toContain(expectedProjectInfo);
                expect(source).not.toContain('legacy');
            }
        }
        finally {
            await server.close();
        }
    });
    it('preserves the configured LAN share host and exposes detected LAN host options', async () => {
        const projectRoot = createTempRoot();
        writeProjectMetadata(projectRoot, {
            project: { id: 'lan-config-client', name: 'LAN Config Client' },
        });
        writeJson(path.join(projectRoot, '.axhub', 'make', 'axhub.config.json'), {
            server: { host: 'localhost', allowLAN: true },
        });
        const registryHome = createTempRoot('axhub-make-projects-api-home-');
        const server = await startRegisteredConfigTestServer(projectRoot, registryHome, 'lan-config-client', 'LAN Config Client');
        try {
            const before = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/config`)).then((response) => response.json());
            expect(before.server).toEqual(expect.objectContaining({
                host: 'localhost',
            }));
            expect(before.server).not.toHaveProperty('allowLAN');
            expect(before.availableLANHosts).toEqual(expect.any(Array));
            const saved = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/config`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    server: {
                        host: 'localhost',
                        allowLAN: true,
                        lanHost: '10.0.8.42',
                        skipLanPreviewAuth: true,
                    },
                    projectInfo: { name: 'LAN Config Client' },
                }),
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(saved).toMatchObject({ status: 200, body: { success: true } });
            const projectConfig = JSON.parse(fs.readFileSync(path.join(projectRoot, '.axhub', 'make', 'axhub.config.json'), 'utf8'));
            expect(projectConfig.server).toEqual({
                host: 'localhost',
                lanHost: '10.0.8.42',
                skipLanPreviewAuth: true,
            });
            const after = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/config`)).then((response) => response.json());
            expect(after.server).toEqual(expect.objectContaining({
                host: 'localhost',
                lanHost: '10.0.8.42',
                skipLanPreviewAuth: true,
            }));
            expect(after.server).not.toHaveProperty('allowLAN');
            expect(after.availableLANHosts).toEqual(expect.any(Array));
        }
        finally {
            await server.close();
        }
    });
    it('defaults Excalidraw property panel mode to collapsed and only persists collapsed or expanded', async () => {
        const projectRoot = createTempRoot();
        writeProjectMetadata(projectRoot, {
            project: { id: 'canvas-ui-client', name: 'Canvas UI Client' },
        });
        writeJson(path.join(projectRoot, '.axhub', 'make', 'axhub.config.json'), {
            server: { host: 'localhost', allowLAN: true },
            projectInfo: { name: 'Canvas UI Client' },
        });
        const registryHome = createTempRoot('axhub-make-projects-api-home-');
        const server = await startRegisteredConfigTestServer(projectRoot, registryHome, 'canvas-ui-client', 'Canvas UI Client');
        try {
            const defaultConfig = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/config`)).then((response) => response.json());
            expect(defaultConfig.uiPreferences).toEqual({
                excalidrawPropertyPanelMode: 'collapsed',
                excalidrawPropertyPanelPosition: 'right',
            });
            const savedExpanded = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/config`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    uiPreferences: {
                        excalidrawPropertyPanelMode: 'expanded',
                        excalidrawPropertyPanelPosition: 'left',
                    },
                }),
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(savedExpanded).toMatchObject({ status: 200, body: { success: true } });
            const serverConfig = JSON.parse(fs.readFileSync(getGlobalServerConfigPath(registryHome), 'utf8'));
            expect(serverConfig.uiPreferences).toEqual({
                excalidrawPropertyPanelMode: 'expanded',
                excalidrawPropertyPanelPosition: 'left',
            });
            const nextConfig = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/config`)).then((response) => response.json());
            expect(nextConfig.uiPreferences).toEqual({
                excalidrawPropertyPanelMode: 'expanded',
                excalidrawPropertyPanelPosition: 'left',
            });
            await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/config`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    uiPreferences: {
                        excalidrawPropertyPanelMode: 'tray',
                        excalidrawPropertyPanelPosition: 'bottom',
                    },
                }),
            });
            const invalidIgnoredConfig = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/config`)).then((response) => response.json());
            expect(invalidIgnoredConfig.uiPreferences).toEqual({
                excalidrawPropertyPanelMode: 'expanded',
                excalidrawPropertyPanelPosition: 'left',
            });
        }
        finally {
            await server.close();
        }
    });
    it('serves config without probing local IDE or agent availability', async () => {
        const projectRoot = createTempRoot();
        writeProjectMetadata(projectRoot, {
            project: { id: 'bootstrap-client', name: 'Bootstrap Client' },
        });
        writeJson(path.join(projectRoot, '.axhub', 'make', 'axhub.config.json'), {
            server: { host: 'localhost', allowLAN: true },
            projectInfo: { name: 'Bootstrap Client' },
            projectDefaults: { defaultTheme: 'brand' },
        });
        const registryHome = createTempRoot('axhub-make-projects-api-home-');
        const server = await startRegisteredConfigTestServer(projectRoot, registryHome, 'bootstrap-client', 'Bootstrap Client');
        try {
            const bootstrap = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/config/bootstrap`)).then((response) => response.json());
            expect(bootstrap).toMatchObject({
                projectId: 'bootstrap-client',
                projectPath: projectRoot,
                projectInfo: { name: 'Bootstrap Client' },
                automation: {
                    conversationPromptClient: null,
                    conversationModel: null,
                    annotationPromptClient: null,
                    annotationModel: null,
                    canvasPromptClient: null,
                    canvasModel: null,
                },
                uiPreferences: {
                    excalidrawPropertyPanelMode: 'collapsed',
                    excalidrawPropertyPanelPosition: 'right',
                },
                projectDefaults: {
                    defaultTheme: 'brand',
                },
            });
            expect(bootstrap.ideAvailability).toBeUndefined();
            expect(bootstrap.agentAvailability).toBeUndefined();
            expect(fs.existsSync(path.join(projectRoot, 'AGENTS.md'))).toBe(false);
            expect(fs.existsSync(path.join(projectRoot, 'CLAUDE.md'))).toBe(false);
            const config = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/config`)).then((response) => response.json());
            expect(config.ideAvailability).toEqual({});
            expect(config.agentAvailability).toEqual({
                cli: {},
                localApp: {},
                web: {},
            });
            const availability = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/config/availability`)).then((response) => response.json());
            expect(availability).toMatchObject({
                ideAvailability: {},
                agentAvailability: {
                    cli: {},
                    localApp: {},
                    web: {},
                },
                availabilityEnabled: false,
            });
            expect(availability.projectInfo).toBeUndefined();
            expect(availability.projectDefaults).toBeUndefined();
        }
        finally {
            await server.close();
        }
    });
    it('saves server preferences without rewriting project config fields', async () => {
        const projectRoot = createTempRoot();
        writeProjectMetadata(projectRoot, {
            project: { id: 'preferences-client', name: 'Preferences Client' },
        });
        writeJson(path.join(projectRoot, '.axhub', 'make', 'axhub.config.json'), {
            server: { host: '0.0.0.0', allowLAN: false },
            projectInfo: { name: 'Project Config' },
            projectDefaults: { defaultTheme: 'brand' },
        });
        const registryHome = createTempRoot('axhub-make-projects-api-home-');
        const server = await startRegisteredConfigTestServer(projectRoot, registryHome, 'preferences-client', 'Preferences Client');
        try {
            const saved = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/config`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    automation: {
                        defaultIDE: 'windsurf',
                    },
                }),
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(saved).toMatchObject({ status: 200, body: { success: true } });
            const projectConfig = JSON.parse(fs.readFileSync(path.join(projectRoot, '.axhub', 'make', 'axhub.config.json'), 'utf8'));
            expect(projectConfig).toEqual({
                server: { host: '0.0.0.0', allowLAN: false },
                projectInfo: { name: 'Project Config' },
                projectDefaults: { defaultTheme: 'brand' },
            });
            const serverConfig = JSON.parse(fs.readFileSync(getGlobalServerConfigPath(registryHome), 'utf8'));
            expect(serverConfig.automation).toEqual({
                conversationPromptClient: null,
                conversationModel: null,
                defaultIDE: 'windsurf',
                injectLocalAiEntry: true,
                acp: {
                    mode: 'prompt',
                    permission: 'approve-all',
                    timeout: 1800,
                },
                annotationPromptClient: null,
                annotationModel: null,
                canvasPromptClient: null,
                canvasModel: null,
                agentRunConcurrency: 5,
            });
        }
        finally {
            await server.close();
        }
    });
    it('does not migrate the legacy manual prompt client into annotation automation', async () => {
        const projectRoot = createTempRoot();
        writeProjectMetadata(projectRoot, {
            project: { id: 'legacy-manual-client', name: 'Legacy Manual Client' },
        });
        writeJson(path.join(projectRoot, '.axhub', 'make', 'axhub.config.json'), {
            server: { host: 'localhost', allowLAN: true },
            projectInfo: { name: 'Legacy Manual Client' },
            automation: {
                defaultPromptClient: 'manual',
            },
        });
        const registryHome = createTempRoot('axhub-make-projects-api-home-');
        const server = await startRegisteredConfigTestServer(projectRoot, registryHome, 'legacy-manual-client', 'Legacy Manual Client');
        try {
            const config = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/config`))
                .then((response) => response.json());
            expect(config.automation.conversationPromptClient).toBe('manual');
            expect(config.automation.annotationPromptClient).toBeNull();
            expect(config.automation.canvasPromptClient).toBe('manual');
        }
        finally {
            await server.close();
        }
    });
    it('upgrades legacy short ACP timeout values when saving server preferences', async () => {
        const projectRoot = createTempRoot();
        writeProjectMetadata(projectRoot, {
            project: { id: 'legacy-acp-timeout-client', name: 'Legacy ACP Timeout Client' },
        });
        writeJson(path.join(projectRoot, '.axhub', 'make', 'axhub.config.json'), {
            server: { host: 'localhost', allowLAN: true },
            projectInfo: { name: 'Legacy ACP Timeout Client' },
        });
        const registryHome = createTempRoot('axhub-make-projects-api-home-');
        writeJson(getGlobalServerConfigPath(registryHome), {
            automation: {
                defaultPromptClient: 'acp:codex',
                defaultIDE: 'web:acp',
                acp: {
                    mode: 'prompt',
                    permission: 'approve-all',
                    timeout: 30,
                },
                annotationPromptClient: 'acp:codex',
                annotationModel: null,
                agentRunConcurrency: 5,
            },
        });
        const server = await startRegisteredConfigTestServer(projectRoot, registryHome, 'legacy-acp-timeout-client', 'Legacy ACP Timeout Client');
        try {
            const currentConfig = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/config`)).then((response) => response.json());
            expect(currentConfig.automation.acp.timeout).toBe(1_200);
            const saved = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/config`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    automation: {
                        defaultIDE: 'cursor',
                    },
                }),
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(saved).toMatchObject({ status: 200, body: { success: true } });
            const serverConfig = JSON.parse(fs.readFileSync(getGlobalServerConfigPath(registryHome), 'utf8'));
            expect(serverConfig.automation.acp).toEqual({
                mode: 'prompt',
                permission: 'approve-all',
                timeout: 1_200,
            });
        }
        finally {
            await server.close();
        }
    });
    it('saves, reads, and bootstraps OpenCode as the conversation prompt client', async () => {
        const projectRoot = createTempRoot();
        writeProjectMetadata(projectRoot, {
            project: { id: 'opencode-prompt-client', name: 'OpenCode Prompt Client' },
        });
        writeJson(path.join(projectRoot, '.axhub', 'make', 'axhub.config.json'), {
            server: { host: 'localhost', allowLAN: true },
            projectInfo: { name: 'OpenCode Prompt Client' },
        });
        const registryHome = createTempRoot('axhub-make-projects-api-home-');
        const server = await startRegisteredConfigTestServer(projectRoot, registryHome, 'opencode-prompt-client', 'OpenCode Prompt Client');
        async function saveAndExpectConversationPromptClient(input) {
            const saved = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/config`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    automation: {
                        conversationPromptClient: input,
                    },
                }),
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(saved).toMatchObject({ status: 200, body: { success: true } });
            const serverConfig = JSON.parse(fs.readFileSync(getGlobalServerConfigPath(registryHome), 'utf8'));
            expect(serverConfig.automation.conversationPromptClient).toBe('acp:opencode');
            const config = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/config`)).then((response) => response.json());
            expect(config.automation.conversationPromptClient).toBe('acp:opencode');
            const bootstrap = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/config/bootstrap`)).then((response) => response.json());
            expect(bootstrap.automation.conversationPromptClient).toBe('acp:opencode');
        }
        try {
            await saveAndExpectConversationPromptClient('acp:opencode');
            await saveAndExpectConversationPromptClient('opencode');
            const saved = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/config`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    automation: {
                        conversationPromptClient: 'genie:opencode',
                    },
                }),
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(saved).toMatchObject({ status: 200, body: { success: true } });
            const serverConfig = JSON.parse(fs.readFileSync(getGlobalServerConfigPath(registryHome), 'utf8'));
            expect(serverConfig.automation.conversationPromptClient).toBe('acp:opencode');
            const config = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/config`)).then((response) => response.json());
            expect(config.automation.conversationPromptClient).toBe('acp:opencode');
        }
        finally {
            await server.close();
        }
    });
    it('saves, reads, and bootstraps new ACP providers with annotation AI preferences', async () => {
        const projectRoot = createTempRoot();
        writeProjectMetadata(projectRoot, {
            project: { id: 'new-acp-providers-client', name: 'New ACP Providers Client' },
        });
        writeJson(path.join(projectRoot, '.axhub', 'make', 'axhub.config.json'), {
            server: { host: 'localhost', allowLAN: true },
            projectInfo: { name: 'New ACP Providers Client' },
        });
        const registryHome = createTempRoot('axhub-make-projects-api-home-');
        const server = await startRegisteredConfigTestServer(projectRoot, registryHome, 'new-acp-providers-client', 'New ACP Providers Client');
        async function saveAndExpectPurposePromptClients(input, expected) {
            const saved = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/config`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    automation: {
                        conversationPromptClient: input,
                        conversationModel: 'conversation-model',
                        annotationPromptClient: 'acp:cursor',
                        annotationModel: 'fast-cursor',
                        canvasPromptClient: input,
                        canvasModel: 'canvas-model',
                    },
                }),
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(saved).toMatchObject({ status: 200, body: { success: true } });
            const serverConfig = JSON.parse(fs.readFileSync(getGlobalServerConfigPath(registryHome), 'utf8'));
            expect(serverConfig.automation.conversationPromptClient).toBe(expected);
            expect(serverConfig.automation.conversationModel).toBe('conversation-model');
            expect(serverConfig.automation.annotationPromptClient).toBe('acp:cursor');
            expect(serverConfig.automation.annotationModel).toBe('fast-cursor');
            expect(serverConfig.automation.canvasPromptClient).toBe(expected);
            expect(serverConfig.automation.canvasModel).toBe('canvas-model');
            expect(serverConfig.automation.acpModels).toBeUndefined();
            const config = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/config`)).then((response) => response.json());
            expect(config.automation.conversationPromptClient).toBe(expected);
            expect(config.automation.annotationPromptClient).toBe('acp:cursor');
            expect(config.automation.annotationModel).toBe('fast-cursor');
            expect(config.automation.canvasPromptClient).toBe(expected);
            const bootstrap = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/config/bootstrap`)).then((response) => response.json());
            expect(bootstrap.automation.conversationPromptClient).toBe(expected);
            expect(bootstrap.automation.annotationPromptClient).toBe('acp:cursor');
            expect(bootstrap.automation.annotationModel).toBe('fast-cursor');
            expect(bootstrap.automation.canvasPromptClient).toBe(expected);
        }
        try {
            await saveAndExpectPurposePromptClients('acp:cursor', 'acp:cursor');
            await saveAndExpectPurposePromptClients('qoder', 'acp:qoder');
            await saveAndExpectPurposePromptClients('codebuddy', 'acp:codebuddy');
            await saveAndExpectPurposePromptClients('reasonix', 'acp:reasonix');
            await saveAndExpectPurposePromptClients('grok-build', 'acp:grok-build');
            const savedWithoutAnnotationProvider = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/config`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    automation: {
                        conversationPromptClient: 'acp:qoder',
                        annotationPromptClient: null,
                        annotationModel: null,
                        canvasPromptClient: 'acp:qoder',
                    },
                }),
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(savedWithoutAnnotationProvider).toMatchObject({ status: 200, body: { success: true } });
            const serverConfig = JSON.parse(fs.readFileSync(getGlobalServerConfigPath(registryHome), 'utf8'));
            expect(serverConfig.automation.conversationPromptClient).toBe('acp:qoder');
            expect(serverConfig.automation.annotationPromptClient).toBeNull();
            expect(serverConfig.automation.annotationModel).toBeNull();
            const config = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/config`)).then((response) => response.json());
            expect(config.automation.annotationPromptClient).toBeNull();
            const bootstrap = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/config/bootstrap`)).then((response) => response.json());
            expect(bootstrap.automation.annotationPromptClient).toBeNull();
        }
        finally {
            await server.close();
        }
    });
    it('normalizes and persists hidden tool open state in global server config', async () => {
        const projectRoot = createTempRoot();
        writeProjectMetadata(projectRoot, {
            project: { id: 'tool-state-client', name: 'Tool State Client' },
        });
        writeJson(path.join(projectRoot, '.axhub', 'make', 'axhub.config.json'), {
            server: { host: 'localhost', allowLAN: true },
            projectInfo: { name: 'Tool State Client' },
        });
        const registryHome = createTempRoot('axhub-make-projects-api-home-');
        const server = await startRegisteredConfigTestServer(projectRoot, registryHome, 'tool-state-client', 'Tool State Client');
        try {
            const saved = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/config`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    toolOpenState: {
                        'ide:cursor': {
                            executablePath: '  C:\\Users\\demo\\Cursor.exe  ',
                            lastOpenMode: 'direct-app',
                        },
                        'cli:codex': {
                            commandPath: '/usr/local/bin/codex',
                            lastOpenMode: 'terminal',
                        },
                        'bad key': {
                            executablePath: 'ignore-me',
                            lastOpenMode: 'direct-app',
                        },
                    },
                }),
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(saved).toMatchObject({ status: 200, body: { success: true } });
            const serverConfig = JSON.parse(fs.readFileSync(getGlobalServerConfigPath(registryHome), 'utf8'));
            expect(serverConfig.toolOpenState).toEqual({
                'ide:cursor': {
                    executablePath: 'C:\\Users\\demo\\Cursor.exe',
                    lastOpenMode: 'direct-app',
                },
                'cli:codex': {
                    commandPath: '/usr/local/bin/codex',
                    lastOpenMode: 'terminal',
                },
            });
            const nextConfig = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/config`)).then((response) => response.json());
            expect(nextConfig.toolOpenState).toEqual(serverConfig.toolOpenState);
        }
        finally {
            await server.close();
        }
    });
    it('saves AI image generation settings to global server config', async () => {
        const projectRoot = createTempRoot();
        writeProjectMetadata(projectRoot, {
            project: { id: 'ai-settings-client', name: 'AI Settings Client' },
        });
        writeJson(path.join(projectRoot, '.axhub', 'make', 'axhub.config.json'), {
            server: { host: 'localhost', allowLAN: true },
            projectInfo: { name: 'AI Settings Client' },
        });
        const registryHome = createTempRoot('axhub-make-projects-api-home-');
        const server = await startRegisteredConfigTestServer(projectRoot, registryHome, 'ai-settings-client', 'AI Settings Client');
        try {
            const saved = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/config`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ai: {
                        imageGeneration: {
                            baseUrl: 'api.images.example.com',
                            apiKey: '  sk-ai  ',
                            model: 'gpt-image-2',
                            apiMode: 'responses',
                            timeout: 90,
                            size: '1536x1024',
                            quality: 'medium',
                            outputFormat: 'webp',
                            outputCompression: 75,
                            moderation: 'low',
                            n: 3,
                            codexCli: true,
                            responseFormatB64Json: false,
                        },
                    },
                }),
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(saved).toMatchObject({ status: 200, body: { success: true } });
            const projectConfig = JSON.parse(fs.readFileSync(path.join(projectRoot, '.axhub', 'make', 'axhub.config.json'), 'utf8'));
            expect(projectConfig.ai).toBeUndefined();
            const serverConfig = JSON.parse(fs.readFileSync(getGlobalServerConfigPath(registryHome), 'utf8'));
            expect(serverConfig.ai.imageGeneration).toEqual({
                baseUrl: 'https://api.images.example.com/v1',
                apiKey: 'sk-ai',
                model: 'gpt-image-2',
            });
            const config = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/config`)).then((response) => response.json());
            expect(config.ai.imageGeneration).toEqual({
                baseUrl: 'https://api.images.example.com/v1',
                apiKey: 'sk-ai',
                model: 'gpt-image-2',
            });
        }
        finally {
            await server.close();
        }
    });
    it('saves the last AI image generation test result with status, message, and time', async () => {
        const projectRoot = createTempRoot();
        writeProjectMetadata(projectRoot, {
            project: { id: 'ai-image-test-client', name: 'AI Image Test Client' },
        });
        writeJson(path.join(projectRoot, '.axhub', 'make', 'axhub.config.json'), {
            server: { host: 'localhost', allowLAN: true },
            projectInfo: { name: 'AI Image Test Client' },
        });
        const registryHome = createTempRoot('axhub-make-projects-api-home-');
        const server = await startRegisteredConfigTestServer(projectRoot, registryHome, 'ai-image-test-client', 'AI Image Test Client');
        try {
            const savedPassed = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/config`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ai: {
                        imageGeneration: {
                            baseUrl: 'https://api.images.example.com/v1',
                            apiKey: 'sk-ai',
                            model: 'gpt-image-2',
                            lastTest: {
                                status: 'passed',
                                message: '已返回图片结果',
                                testedAt: 1780713600000,
                            },
                        },
                    },
                }),
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(savedPassed).toMatchObject({ status: 200, body: { success: true } });
            let config = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/config`)).then((response) => response.json());
            expect(config.ai.imageGeneration.lastTest).toEqual({
                status: 'passed',
                message: '已返回图片结果',
                testedAt: 1780713600000,
            });
            const savedFailed = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/config`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ai: {
                        imageGeneration: {
                            lastTest: {
                                status: 'failed',
                                message: '测试超时',
                                testedAt: 1780713900000,
                            },
                        },
                    },
                }),
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(savedFailed).toMatchObject({ status: 200, body: { success: true } });
            const serverConfig = JSON.parse(fs.readFileSync(getGlobalServerConfigPath(registryHome), 'utf8'));
            expect(serverConfig.ai.imageGeneration).toEqual({
                baseUrl: 'https://api.images.example.com/v1',
                apiKey: 'sk-ai',
                model: 'gpt-image-2',
                lastTest: {
                    status: 'failed',
                    message: '测试超时',
                    testedAt: 1780713900000,
                },
            });
            config = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/config`)).then((response) => response.json());
            expect(config.ai.imageGeneration.lastTest).toEqual({
                status: 'failed',
                message: '测试超时',
                testedAt: 1780713900000,
            });
        }
        finally {
            await server.close();
        }
    });
    it('tests AI image generation settings directly against the configured image API', async () => {
        const projectRoot = createTempRoot();
        writeProjectMetadata(projectRoot, {
            project: { id: 'ai-image-probe-client', name: 'AI Image Probe Client' },
        });
        const registryHome = createTempRoot('axhub-make-projects-api-home-');
        const imageApi = await startImageApiProbeServer();
        const server = await startRegisteredConfigTestServer(projectRoot, registryHome, 'ai-image-probe-client', 'AI Image Probe Client');
        try {
            const result = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/config/ai-image/test`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    baseUrl: `${imageApi.origin}/v1`,
                    apiKey: 'sk-current-image',
                    model: 'gpt-image-2',
                }),
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(result).toMatchObject({
                status: 200,
                body: {
                    success: true,
                    message: '已返回图片结果',
                },
            });
            expect(imageApi.requests).toHaveLength(1);
            expect(imageApi.requests[0]).toMatchObject({
                method: 'POST',
                url: '/v1/images/generations',
                body: {
                    model: 'gpt-image-2',
                    prompt: expect.stringContaining('OK'),
                    n: 1,
                },
            });
            expect(imageApi.requests[0].headers.authorization).toBe('Bearer sk-current-image');
            await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/config`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ai: {
                        imageGeneration: {
                            baseUrl: `${imageApi.origin}/v1`,
                            apiKey: 'sk-saved-image',
                            model: 'saved-image-model',
                        },
                    },
                }),
            });
            const resultWithoutKey = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/config/ai-image/test`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    baseUrl: `${imageApi.origin}/v1`,
                    apiKey: '',
                    model: 'gpt-image-2',
                }),
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(resultWithoutKey).toMatchObject({ status: 200, body: { success: true } });
            expect(imageApi.requests).toHaveLength(2);
            expect(imageApi.requests[1].headers.authorization).toBeUndefined();
        }
        finally {
            await server.close();
            await imageApi.close();
        }
    });
    it('resolves local Codex image generation settings for import', async () => {
        const projectRoot = createTempRoot();
        writeProjectMetadata(projectRoot, {
            project: { id: 'codex-local-config-client', name: 'Codex Local Config Client' },
        });
        const registryHome = createTempRoot('axhub-make-projects-api-home-');
        const codexHome = path.join(registryHome, '.codex');
        writeJson(path.join(codexHome, 'auth.json'), { OPENAI_API_KEY: 'sk-codex-local' });
        fs.mkdirSync(codexHome, { recursive: true });
        fs.writeFileSync(path.join(codexHome, 'config.toml'), [
            'model_provider = "openai"',
            '[model_providers.openai]',
            'base_url = "https://codex.example.com/v1"',
            'wire_api = "responses"',
        ].join('\n'), 'utf8');
        const previousCodexHome = process.env.CODEX_HOME;
        process.env.CODEX_HOME = codexHome;
        const server = await startRegisteredConfigTestServer(projectRoot, registryHome, 'codex-local-config-client', 'Codex Local Config Client');
        try {
            const result = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/config/ai-image/codex-local`)).then(async (response) => ({
                status: response.status,
                body: await response.json(),
            }));
            expect(result.status).toBe(200);
            expect(result.body).toMatchObject({
                success: true,
                ready: true,
                config: {
                    baseUrl: 'https://codex.example.com/v1',
                    apiKey: 'sk-codex-local',
                    model: 'gpt-image-2',
                },
            });
            expect(result.body.discovery.configFiles).toEqual([path.join(codexHome, 'config.toml')]);
            expect(result.body.discovery.authFile).toBe(path.join(codexHome, 'auth.json'));
        }
        finally {
            if (previousCodexHome === undefined) {
                delete process.env.CODEX_HOME;
            }
            else {
                process.env.CODEX_HOME = previousCodexHome;
            }
            await server.close();
        }
    });
    it('keeps empty project names empty for settings inputs and registry data', async () => {
        const projectRoot = createTempRoot();
        writeProjectMetadata(projectRoot, {
            project: { id: 'empty-name-client', name: '' },
        });
        writeJson(path.join(projectRoot, '.axhub', 'make', 'axhub.config.json'), {
            server: { host: 'localhost', allowLAN: true },
            projectInfo: { name: null, description: 'Description' },
        });
        const registryHome = createTempRoot('axhub-make-projects-api-home-');
        const server = await startRegisteredConfigTestServer(projectRoot, registryHome, 'empty-name-client', '');
        try {
            const initialConfig = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/config`)).then((response) => response.json());
            expect(initialConfig.projectInfo).toEqual({
                name: '',
                description: 'Description',
            });
            const saved = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/config`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    server: { host: 'localhost', allowLAN: true },
                    projectInfo: { name: null, description: 'Updated description' },
                }),
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(saved).toMatchObject({ status: 200, body: { success: true } });
            const config = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/config`)).then((response) => response.json());
            expect(config.projectInfo).toEqual({
                name: '',
                description: 'Updated description',
            });
            const projectConfig = JSON.parse(fs.readFileSync(path.join(projectRoot, '.axhub', 'make', 'axhub.config.json'), 'utf8'));
            expect(projectConfig.projectInfo).toEqual({
                description: 'Updated description',
            });
            const metadata = JSON.parse(fs.readFileSync(getProjectMetadataPath(projectRoot), 'utf8'));
            expect(metadata.project.name).toBe('');
            const projects = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/projects`)).then((response) => response.json());
            expect(projects.projects).toEqual([
                expect.objectContaining({
                    id: 'empty-name-client',
                    name: '',
                }),
            ]);
        }
        finally {
            await server.close();
        }
    });
    it('writes make client project names to client.json and leaves config projectInfo name derived', async () => {
        const projectRoot = createTempRoot();
        writeJson(getMakeClientMarkerPath(projectRoot), {
            schemaVersion: 1,
            kind: 'axhub-make-client',
            repository: 'https://github.com/lintendo/Axhub-Make/tree/main/client',
            project: { id: 'make-project', name: 'Axhub Make' },
        });
        writeProjectMetadata(projectRoot, {
            project: { id: 'make-project', name: 'Axhub Make' },
        });
        writeJson(path.join(projectRoot, '.axhub', 'make', 'axhub.config.json'), {
            server: { host: 'localhost', allowLAN: true },
            projectInfo: { name: 'Axhub Make', description: 'Description' },
        });
        const registryHome = createTempRoot('axhub-make-projects-api-home-');
        const server = await startRegisteredConfigTestServer(projectRoot, registryHome, 'make-project', 'Axhub Make');
        try {
            const initialConfig = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/config`)).then((response) => response.json());
            expect(initialConfig.projectInfo).toEqual({
                name: '',
                description: 'Description',
            });
            const savedBlank = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/config`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    server: { host: 'localhost', allowLAN: true },
                    projectInfo: { name: null, description: 'Updated description' },
                }),
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(savedBlank).toMatchObject({ status: 200, body: { success: true } });
            expect(JSON.parse(fs.readFileSync(getMakeClientMarkerPath(projectRoot), 'utf8')).project).toEqual({
                id: 'make-project',
                name: '',
            });
            const blankProjectConfig = JSON.parse(fs.readFileSync(path.join(projectRoot, '.axhub', 'make', 'axhub.config.json'), 'utf8'));
            expect(blankProjectConfig).toEqual({
                server: { host: 'localhost' },
                projectInfo: { description: 'Updated description' },
            });
            const blankMetadata = JSON.parse(fs.readFileSync(getProjectMetadataPath(projectRoot), 'utf8'));
            expect(blankMetadata.project).toEqual({
                id: 'make-project',
                name: '',
            });
            const blankProjects = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/projects`)).then((response) => response.json());
            expect(blankProjects.projects).toEqual([
                expect.objectContaining({
                    id: 'make-project',
                    name: '',
                }),
            ]);
            const savedName = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/config`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    server: { host: 'localhost', allowLAN: true },
                    projectInfo: { name: 'Named Client', description: 'Named description' },
                }),
            }).then(async (response) => ({ status: response.status, body: await response.json() }));
            expect(savedName).toMatchObject({ status: 200, body: { success: true } });
            expect(JSON.parse(fs.readFileSync(getMakeClientMarkerPath(projectRoot), 'utf8')).project).toEqual({
                id: 'make-project',
                name: 'Named Client',
            });
            const namedProjectConfig = JSON.parse(fs.readFileSync(path.join(projectRoot, '.axhub', 'make', 'axhub.config.json'), 'utf8'));
            expect(namedProjectConfig).toEqual({
                server: { host: 'localhost' },
                projectInfo: { description: 'Named description' },
            });
            const namedConfig = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/config`)).then((response) => response.json());
            expect(namedConfig.projectInfo).toEqual({
                name: 'Named Client',
                description: 'Named description',
            });
        }
        finally {
            await server.close();
        }
    });
});
