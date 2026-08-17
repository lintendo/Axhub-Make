import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const source = readFileSync(new URL('./managementApi.config.ts', import.meta.url), 'utf8');
describe('voice assistant settings management API source', () => {
    it('exposes secret-safe GET and PUT through the project-scoped config router', () => {
        expect(source).toContain("pathname === '/api/config/voice-assistant'");
        expect(source).toContain('readVoiceAssistantSettings');
        expect(source).toContain('writeVoiceAssistantSettingsPatch');
        expect(source).toContain('maskVoiceAssistantSettings');
        expect(source).toContain("req.method === 'GET'");
        expect(source).toContain("req.method === 'PUT'");
        expect(source).toContain('clearSecrets');
    });
});
