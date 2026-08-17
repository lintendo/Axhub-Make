export function buildDesktopClientProcessProbe(provider, platform) {
    if (platform === 'darwin') {
        const processPatterns = {
            chatgpt: 'ChatGPT|Codex',
            cursor: 'Cursor',
            opencode: '/Applications/OpenCode.app/Contents/MacOS/OpenCode',
            workbuddy: '/Applications/WorkBuddy.app/Contents/MacOS/Electron',
            traework: '/Applications/TRAE SOLO(?: CN)?.app/Contents/MacOS/Electron',
            qoderwork: '/Applications/QoderWork(?: CN)?.app/Contents/MacOS/QoderWork(?: CN)?',
        };
        return {
            command: 'pgrep',
            args: provider === 'chatgpt' || provider === 'cursor'
                ? ['-x', processPatterns[provider]]
                : ['-f', processPatterns[provider]],
        };
    }
    const windowsImageNames = {
        cursor: 'Cursor.exe',
        opencode: 'OpenCode.exe',
        workbuddy: 'WorkBuddy.exe',
        qoderwork: 'QoderWork.exe',
    };
    if (provider !== 'chatgpt' && provider !== 'traework') {
        return {
            command: 'tasklist.exe',
            args: ['/FI', `IMAGENAME eq ${windowsImageNames[provider]}`, '/NH'],
        };
    }
    const processNames = provider === 'chatgpt'
        ? "'ChatGPT','Codex'"
        : "'TRAE SOLO','TRAE SOLO CN'";
    return {
        command: 'powershell.exe',
        args: [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            `Get-Process -Name ${processNames} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty ProcessName`,
        ],
    };
}
export function buildDesktopClientGracefulQuit(provider, platform, appPath) {
    if (platform === 'darwin') {
        const applicationNames = {
            cursor: 'Cursor',
            opencode: 'OpenCode',
            workbuddy: 'WorkBuddy',
            qoderwork: 'QoderWork',
        };
        if (provider === 'chatgpt') {
            return { command: 'osascript', args: ['-e', 'tell application id "com.openai.codex" to quit'] };
        }
        const applicationName = provider === 'traework'
            ? appPath?.includes('/TRAE SOLO CN.app/') ? 'TRAE SOLO CN' : 'TRAE SOLO'
            : applicationNames[provider];
        return { command: 'osascript', args: ['-e', `tell application "${applicationName}" to quit`] };
    }
    const processNames = {
        chatgpt: "'ChatGPT','Codex'",
        cursor: "'Cursor'",
        opencode: "'OpenCode'",
        workbuddy: "'WorkBuddy'",
        traework: "'TRAE SOLO','TRAE SOLO CN'",
        qoderwork: "'QoderWork','QoderWork CN'",
    };
    return {
        command: 'powershell.exe',
        args: [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            `$items = Get-Process -Name ${processNames[provider]} -ErrorAction SilentlyContinue; $items | ForEach-Object { $_.CloseMainWindow() | Out-Null }`,
        ],
    };
}
export async function waitForDesktopClientExit({ isRunning, wait, maxAttempts, retryDelayMs, }) {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        if (!await isRunning())
            return true;
        if (attempt + 1 < maxAttempts)
            await wait(retryDelayMs);
    }
    return false;
}
