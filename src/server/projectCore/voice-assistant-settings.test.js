import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getGlobalVoiceAssistantSettingsPath, maskVoiceAssistantSettings, readVoiceAssistantSettings, writeVoiceAssistantSettingsPatch, } from './voice-assistant-settings';
const tempHomes = [];
function createTempHome() {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'axhub-make-voice-settings-'));
    tempHomes.push(homeDir);
    return homeDir;
}
afterEach(() => {
    for (const homeDir of tempHomes.splice(0)) {
        fs.rmSync(homeDir, { force: true, recursive: true });
    }
});
describe('Make voice assistant global settings', () => {
    it('uses Make-owned defaults and ignores removed Doubao protocol fields', () => {
        const homeDir = createTempHome();
        const settingsPath = getGlobalVoiceAssistantSettingsPath(homeDir);
        fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
        fs.writeFileSync(settingsPath, JSON.stringify({
            doubao: {
                appId: 'app-1',
                accessKey: 'access-secret',
                speaker: 'voice-1',
                appKey: 'removed',
                resourceId: 'removed',
                realtimeUrl: 'wss://removed.example',
            },
        }));
        const settings = readVoiceAssistantSettings({ homeDir });
        expect(settings.doubao).toEqual({
            appId: 'app-1',
            accessKey: 'access-secret',
            speaker: 'voice-1',
        });
        expect(settings.processing.baseUrl).toBe('https://api.openai.com/v1');
        expect(settings).not.toHaveProperty('doubao.appKey');
        expect(settings).not.toHaveProperty('doubao.resourceId');
        expect(settings).not.toHaveProperty('doubao.realtimeUrl');
    });
    it('masks secrets, preserves blank secret patches, and clears only explicitly', () => {
        const homeDir = createTempHome();
        writeVoiceAssistantSettingsPatch({
            doubao: { appId: 'app-1', accessKey: 'access-secret', speaker: 'voice-1' },
            processing: { apiKey: 'processing-secret' },
            vision: { apiKey: 'vision-secret' },
        }, { homeDir });
        const preserved = writeVoiceAssistantSettingsPatch({
            doubao: { appId: 'app-2', accessKey: '' },
        }, { homeDir });
        expect(preserved.doubao.accessKey).toBe('access-secret');
        const masked = maskVoiceAssistantSettings(preserved);
        expect(masked.doubao).toEqual({
            appId: 'app-2',
            speaker: 'voice-1',
            hasAccessKey: true,
        });
        expect(JSON.stringify(masked)).not.toContain('secret');
        const cleared = writeVoiceAssistantSettingsPatch({}, {
            clearSecrets: ['doubao.accessKey'],
            homeDir,
        });
        expect(cleared.doubao.accessKey).toBe('');
        expect(cleared.processing.apiKey).toBe('processing-secret');
    });
    it('writes atomically with private permissions and validates remote URLs', () => {
        const homeDir = createTempHome();
        expect(() => writeVoiceAssistantSettingsPatch({
            processing: { baseUrl: 'http://example.com/v1' },
        }, { homeDir })).toThrow(/HTTPS/u);
        writeVoiceAssistantSettingsPatch({
            processing: { baseUrl: 'http://localhost:8080/v1' },
            vision: { endpoint: 'https://vision.example/v1' },
        }, { homeDir });
        const settingsPath = getGlobalVoiceAssistantSettingsPath(homeDir);
        expect(fs.statSync(settingsPath).mode & 0o777).toBe(0o600);
        expect(fs.readdirSync(path.dirname(settingsPath)).filter((name) => name.includes('.tmp-'))).toEqual([]);
    });
});
