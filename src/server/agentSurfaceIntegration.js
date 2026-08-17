// The standalone Make package ships this runtime in vendor; keeping the import direct
// ensures the injected script and the published server always use the same artifact.
import { getHostAdapter, openEntry, openProject, openProjectAndEntry, } from '../../vendor/agent-surface/dist/index.js';
import { buildDesktopClientGracefulQuit, waitForDesktopClientExit, } from './desktopClientLifecycle.ts';
import { runLocalCommand } from './localCommand.ts';
const MAKE_AGENT_SURFACE_HOSTS = {
    chatgpt: 'codex',
    cursor: 'cursor',
    workbuddy: 'workbuddy',
    traework: 'traework',
    qoderwork: 'qoderwork',
};
const AXHUB_MAKE_ICON_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAJ+SURBVHgB7Zm7SwNBEMYnIggKYmE6FSGNWvkqFbXR8ixsRStbtbWzsdX/QBG1Ek1KKxNsLHw2PoqAil0sRFCwijcJkUN2ZmcfegbuByEHm8d+O9/Mzt6lYH22DHVMA9Q5iYC4SQTETSIgbhrBE92t7bA5uVB558g/38Lq6SE8vL2AD7wJOJ5Z0U4eme8bDT+Xhon9NfCBFwv1p7tEk68x3tFj9HkOLwJwQqZMZ4bAB14EBJlhMCX4LwLQClQEssWLMGnvlGP4nbamFnDFWcB4Ry85tnp6AMuFHXJ8vm8EXHEWMBdWFRWvnx9wVXqqvPBahQ8bOQloa2om7YMTV11HwerlaiMnAZx9csXz7+tCuHmpwAXoT3eCC04CgswgOZaPTDpPCEBcy6mTAOrPsU2I2gYrEZUHVA5JsRZQLYPNyjHVikctFYXLIwnWAriVU02W2g8QFxs5RIBOYFXVyRIRQIK/FsA1b7jSqlYZc4CKAv6WbXNnJYAL+XXp0WrM1kZWAriQc1b5DRsZC8BQo4VUcDZBuHJq29wZn8i45MWSWF7aBluwudu4PDL6jnEEXDceDhsbGQlw3XR02DR3RgJ8HQMpbJo7IwFc8+YL00UySmIugbduTuBReK8HV3pxYEo5hjm2VNgFKWIBXPOGLBf2whL5DhI4AbU848pxFLGFuOpTre+yySO6/cLERmIB0tOXlFzxjBwLfAvQ3UnjTlwU1DkZMWnuRAK4kP48fUnh2grdf0YRCRhj7GOz+jVyHpo7rQCuedNNQgeXyNLmTiuAS97qJO7BlqxGvOTOXUr3oLvan6jrf+3umwtcb4X5pXsQkkqe1MdMIiBuEgFx8wXw+uRoEo2GpgAAAABJRU5ErkJggg==';
export function resolveMakeAgentSurfaceHost(provider) {
    return MAKE_AGENT_SURFACE_HOSTS[provider] ?? null;
}
export function buildMakeAgentSurfaceConfig({ makeOrigin, projectId, }) {
    const origin = new URL(makeOrigin);
    const pageUrl = new URL('/', origin);
    pageUrl.searchParams.set('projectId', projectId.trim());
    pageUrl.searchParams.set('surface', 'codex');
    const healthUrl = new URL('/api/health', origin);
    return {
        schemaVersion: 1,
        entries: [{
                id: 'axhub-make',
                name: 'Axhub Make',
                icon: { type: 'data-url', value: AXHUB_MAKE_ICON_DATA_URL },
                hosts: ['codex', 'cursor', 'workbuddy', 'traework', 'qoderwork'],
                url: pageUrl.toString(),
                healthUrl: healthUrl.toString(),
                headerActions: {
                    refresh: true,
                    copyUrl: true,
                },
            }],
    };
}
export async function openMakeAgentSurface({ provider, makeOrigin, projectId, appPath, }) {
    return openEntry(buildMakeAgentSurfaceOpenOptions({ provider, makeOrigin, projectId, appPath }));
}
export function buildMakeAgentSurfaceProjectOpenOptions({ provider, makeOrigin, projectId, targetPath, appPath, }) {
    const projectProvider = provider === 'chatgpt' ? 'codex' : provider;
    const base = {
        provider: projectProvider,
        targetPath,
        ...(appPath ? { appPath } : {}),
    };
    const host = resolveMakeAgentSurfaceHost(provider);
    if (!host)
        return base;
    return {
        ...base,
        surface: {
            entryId: 'axhub-make',
            config: buildMakeAgentSurfaceConfig({ makeOrigin, projectId }),
            activate: false,
        },
    };
}
export async function openMakeAgentSurfaceProject(options) {
    return openProjectAndEntry(buildMakeAgentSurfaceProjectOpenOptions(options));
}
export async function openMakeAgentProjectOnly(options) {
    const openOptions = buildMakeAgentSurfaceProjectOpenOptions(options);
    return openProject({
        provider: openOptions.provider,
        targetPath: openOptions.targetPath,
        appPath: openOptions.appPath,
    });
}
export function buildMakeAgentSurfaceOpenOptions({ provider, makeOrigin, projectId, appPath, }) {
    const host = resolveMakeAgentSurfaceHost(provider);
    if (!host)
        throw new Error(`${provider} does not support Agent Surface injection.`);
    const config = buildMakeAgentSurfaceConfig({ makeOrigin, projectId });
    return {
        host,
        entryId: 'axhub-make',
        config: appPath
            ? { ...config, hosts: { ...config.hosts, [host]: { appPath } } }
            : config,
        // Preserve the native task opened by the host; activation remains user-driven.
        activate: false,
    };
}
function resolveDesktopPlatform(platform) {
    if (platform === 'darwin' || platform === 'win32')
        return platform;
    throw new Error(`Agent Surface does not support ${platform}.`);
}
export async function inspectMakeAgentSurfaceHost(provider, options = {}) {
    const desktopPlatform = resolveDesktopPlatform(options.platform ?? process.platform);
    const host = resolveMakeAgentSurfaceHost(provider);
    const inspection = await getHostAdapter(host).inspect({
        platform: desktopPlatform,
        ...(options.appPath ? { config: { appPath: options.appPath } } : {}),
    });
    return {
        platform: desktopPlatform,
        ready: Boolean(inspection.target),
        running: inspection.processRunning,
        installed: Boolean(inspection.appPath),
        integrationInstalled: true,
        appPath: inspection.appPath || '',
    };
}
export async function closeMakeAgentSurfaceHost(provider, options = {}) {
    const platform = resolveDesktopPlatform(options.platform ?? process.platform);
    const initial = await inspectMakeAgentSurfaceHost(provider, { platform, appPath: options.appPath });
    if (!initial.running)
        return;
    const quit = buildDesktopClientGracefulQuit(provider, platform, initial.appPath);
    await runLocalCommand(quit.command, quit.args);
    const exited = await waitForDesktopClientExit({
        isRunning: async () => (await inspectMakeAgentSurfaceHost(provider, { platform, appPath: options.appPath })).running,
        wait: options.wait ?? ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs))),
        maxAttempts: options.maxAttempts ?? 20,
        retryDelayMs: options.retryDelayMs ?? 1000,
    });
    if (!exited) {
        throw new Error('应用未能自动退出，请手动退出后重试。');
    }
}
