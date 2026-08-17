import { describe, expect, it, vi } from 'vitest';
import { coordinateDesktopIntegrationOpen, normalizeDesktopIntegrationOpenAction, normalizeDesktopIntegrationProvider, } from '../desktopIntegrationOpen.ts';
function inspection(overrides = {}) {
    return {
        platform: 'darwin',
        ready: false,
        running: false,
        installed: true,
        integrationInstalled: true,
        appPath: '/Applications/ChatGPT.app',
        ...overrides,
    };
}
function createAdapters(overrides = {}) {
    return {
        inspect: vi.fn(async () => inspection()),
        launch: vi.fn(async () => ({ launched: true, reused: false })),
        close: vi.fn(async () => { }),
        open: vi.fn(async () => ({})),
        ...overrides,
    };
}
describe('desktop integration open coordinator', () => {
    it('returns restart-required without changing an ordinary running client', async () => {
        const adapters = createAdapters({
            inspect: vi.fn(async () => inspection({ running: true })),
        });
        await expect(coordinateDesktopIntegrationOpen({
            provider: 'chatgpt',
            action: 'prepare',
        }, adapters)).resolves.toEqual({
            provider: 'chatgpt',
            status: 'restart-required',
        });
        expect(adapters.close).not.toHaveBeenCalled();
        expect(adapters.launch).not.toHaveBeenCalled();
        expect(adapters.open).not.toHaveBeenCalled();
    });
    it('recovers a CDP-enabled client whose integrated window is closed', async () => {
        const order = [];
        const adapters = createAdapters({
            inspect: vi.fn(async () => inspection({
                ready: false,
                recoverable: true,
                running: true,
            })),
            launch: vi.fn(async () => {
                order.push('recover');
                return { launched: false, reused: true };
            }),
            open: vi.fn(async () => {
                order.push('open-project');
                return {};
            }),
        });
        await expect(coordinateDesktopIntegrationOpen({
            provider: 'cursor',
            action: 'prepare',
        }, adapters)).resolves.toMatchObject({
            provider: 'cursor',
            status: 'opened',
            mode: 'integrated',
            launched: false,
            reused: true,
        });
        expect(order).toEqual(['recover', 'open-project']);
        expect(adapters.close).not.toHaveBeenCalled();
        expect(adapters.open).toHaveBeenCalledWith('integrated');
    });
    it('reuses a ready client and opens the selected project', async () => {
        const adapters = createAdapters({
            inspect: vi.fn(async () => inspection({ ready: true, running: true })),
            launch: vi.fn(async () => ({ launched: false, reused: true })),
            open: vi.fn(async () => ({ url: 'codex://threads/new?path=%2Fworkspace' })),
        });
        await expect(coordinateDesktopIntegrationOpen({
            provider: 'chatgpt',
            action: 'prepare',
        }, adapters)).resolves.toEqual({
            provider: 'chatgpt',
            status: 'opened',
            mode: 'integrated',
            launched: false,
            reused: true,
            url: 'codex://threads/new?path=%2Fworkspace',
        });
        expect(adapters.close).not.toHaveBeenCalled();
        expect(adapters.open).toHaveBeenCalledOnce();
        expect(adapters.open).toHaveBeenCalledWith('integrated');
    });
    it('launches a stopped client before opening the selected project', async () => {
        const order = [];
        const adapters = createAdapters({
            launch: vi.fn(async () => {
                order.push('launch');
                return { launched: true, reused: false };
            }),
            open: vi.fn(async () => {
                order.push('open-project');
                return {};
            }),
        });
        await expect(coordinateDesktopIntegrationOpen({
            provider: 'cursor',
            action: 'prepare',
        }, adapters)).resolves.toMatchObject({
            provider: 'cursor',
            status: 'opened',
            mode: 'integrated',
            launched: true,
            reused: false,
        });
        expect(order).toEqual(['launch', 'open-project']);
        expect(adapters.open).toHaveBeenCalledWith('integrated');
    });
    it('gracefully closes an ordinary client before relaunching on restart', async () => {
        const order = [];
        const adapters = createAdapters({
            inspect: vi.fn(async () => inspection({
                platform: 'win32',
                running: true,
                appPath: String.raw `C:\Program Files\Cursor\Cursor.exe`,
            })),
            close: vi.fn(async () => { order.push('close'); }),
            launch: vi.fn(async () => {
                order.push('launch');
                return { launched: true, reused: false };
            }),
            open: vi.fn(async () => {
                order.push('open-project');
                return {};
            }),
        });
        await coordinateDesktopIntegrationOpen({ provider: 'cursor', action: 'restart' }, adapters);
        expect(order).toEqual(['close', 'launch', 'open-project']);
        expect(adapters.open).toHaveBeenCalledWith('integrated');
    });
    it('uses only the existing project opener for a normal open', async () => {
        const adapters = createAdapters({
            open: vi.fn(async () => ({
                url: 'codex://threads/new?path=%2Fworkspace',
                openInBrowser: true,
            })),
        });
        await expect(coordinateDesktopIntegrationOpen({
            provider: 'chatgpt',
            action: 'normal',
        }, adapters)).resolves.toEqual({
            provider: 'chatgpt',
            status: 'opened',
            mode: 'normal',
            url: 'codex://threads/new?path=%2Fworkspace',
            openInBrowser: true,
        });
        expect(adapters.inspect).not.toHaveBeenCalled();
        expect(adapters.close).not.toHaveBeenCalled();
        expect(adapters.launch).not.toHaveBeenCalled();
        expect(adapters.open).toHaveBeenCalledWith('normal');
    });
    it('preserves a surface-only manual-directory notice', async () => {
        const notice = 'TRAEWORK 已打开并注入 Axhub Make，但不支持自动打开目录，请在 TRAEWORK 中手动选择当前项目目录。';
        const adapters = createAdapters({
            open: vi.fn(async () => ({
                noticeCode: 'project-selection-required',
                notice,
            })),
        });
        await expect(coordinateDesktopIntegrationOpen({
            provider: 'traework',
            action: 'prepare',
        }, adapters)).resolves.toMatchObject({
            provider: 'traework',
            status: 'opened',
            mode: 'integrated',
            noticeCode: 'project-selection-required',
            notice,
        });
        expect(adapters.open).toHaveBeenCalledWith('integrated');
    });
    it('rejects missing clients and missing owned integrations before launch', async () => {
        const missingClient = createAdapters({
            inspect: vi.fn(async () => inspection({
                installed: false,
                appPath: '',
            })),
        });
        const missingIntegration = createAdapters({
            inspect: vi.fn(async () => inspection({
                integrationInstalled: false,
                appPath: '/Applications/Cursor.app',
            })),
        });
        await expect(coordinateDesktopIntegrationOpen({
            provider: 'chatgpt', action: 'prepare',
        }, missingClient)).rejects.toThrow('ChatGPT');
        await expect(coordinateDesktopIntegrationOpen({
            provider: 'cursor', action: 'prepare',
        }, missingIntegration)).resolves.toMatchObject({
            provider: 'cursor',
            status: 'opened',
            mode: 'integrated',
        });
        expect(missingClient.launch).not.toHaveBeenCalled();
        expect(missingIntegration.launch).toHaveBeenCalledOnce();
    });
    it('normalizes the five qualified providers and excludes the removed OpenCode surface', () => {
        expect(normalizeDesktopIntegrationProvider(' chatgpt ')).toBe('chatgpt');
        expect(normalizeDesktopIntegrationProvider('cursor')).toBe('cursor');
        expect(normalizeDesktopIntegrationProvider('opencode')).toBeNull();
        expect(normalizeDesktopIntegrationProvider('workbuddy')).toBe('workbuddy');
        expect(normalizeDesktopIntegrationProvider('traework')).toBe('traework');
        expect(normalizeDesktopIntegrationProvider('qoderwork')).toBe('qoderwork');
        expect(normalizeDesktopIntegrationProvider('trae')).toBeNull();
        expect(normalizeDesktopIntegrationOpenAction(' prepare ')).toBe('prepare');
        expect(normalizeDesktopIntegrationOpenAction('restart')).toBe('restart');
        expect(normalizeDesktopIntegrationOpenAction('normal')).toBe('normal');
        expect(normalizeDesktopIntegrationOpenAction('force')).toBeNull();
    });
});
