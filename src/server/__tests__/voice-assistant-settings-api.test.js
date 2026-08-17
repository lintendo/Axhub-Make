import fs from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { getGlobalVoiceAssistantSettingsPath } from '../projectCore/index.ts';
import { cleanupProjectApiTestRoots, createTempRoot, registerProject, scopeProjectApiUrl, startTestServer, writeProjectMetadata, } from './projects-api.helpers';
afterEach(() => cleanupProjectApiTestRoots());
describe('Make voice assistant settings API', () => {
    it('shares masked global settings across projects without exposing secrets', async () => {
        const projectA = createTempRoot('axhub-make-voice-project-a-');
        const projectB = createTempRoot('axhub-make-voice-project-b-');
        const registryHome = createTempRoot('axhub-make-voice-home-');
        writeProjectMetadata(projectA, { project: { id: 'voice-a', name: 'Voice A' } });
        writeProjectMetadata(projectB, { project: { id: 'voice-b', name: 'Voice B' } });
        const server = await startTestServer(projectA, registryHome);
        try {
            await registerProject(server.origin, projectA, 'voice-a', 'Voice A');
            await registerProject(server.origin, projectB, 'voice-b', 'Voice B');
            const savedResponse = await fetch(scopeProjectApiUrl(projectA, `${server.origin}/api/config/voice-assistant`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    patch: {
                        doubao: {
                            appId: 'app-1',
                            accessKey: 'doubao-secret',
                            speaker: 'voice-1',
                            appKey: 'removed-secret',
                            resourceId: 'removed-resource',
                            realtimeUrl: 'wss://removed.example',
                        },
                        processing: {
                            baseUrl: 'https://api.example.com/v1',
                            apiKey: 'processing-secret',
                            model: 'model-1',
                        },
                    },
                }),
            });
            const savedText = await savedResponse.text();
            expect(savedResponse.status).toBe(200);
            expect(savedText).not.toContain('doubao-secret');
            expect(savedText).not.toContain('processing-secret');
            expect(savedText).not.toContain('removed-secret');
            expect(JSON.parse(savedText)).toEqual({
                settings: {
                    doubao: { appId: 'app-1', speaker: 'voice-1', hasAccessKey: true },
                    processing: {
                        baseUrl: 'https://api.example.com/v1',
                        model: 'model-1',
                        hasApiKey: true,
                    },
                    vision: { endpoint: '', model: '', hasApiKey: false },
                },
            });
            const projectBResponse = await fetch(scopeProjectApiUrl(projectB, `${server.origin}/api/config/voice-assistant`));
            const projectBText = await projectBResponse.text();
            expect(projectBResponse.status).toBe(200);
            expect(projectBText).not.toContain('secret');
            expect(JSON.parse(projectBText).settings.doubao).toEqual({
                appId: 'app-1',
                speaker: 'voice-1',
                hasAccessKey: true,
            });
            const stored = JSON.parse(fs.readFileSync(getGlobalVoiceAssistantSettingsPath(registryHome), 'utf8'));
            expect(stored.doubao.accessKey).toBe('doubao-secret');
            expect(stored.doubao).not.toHaveProperty('appKey');
            expect(stored.doubao).not.toHaveProperty('resourceId');
            expect(stored.doubao).not.toHaveProperty('realtimeUrl');
            expect(fs.statSync(getGlobalVoiceAssistantSettingsPath(registryHome)).mode & 0o777).toBe(0o600);
        }
        finally {
            await server.close();
        }
    });
});
