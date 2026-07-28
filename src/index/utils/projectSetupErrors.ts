const MAKE_CLIENT_ERROR_MESSAGES: Record<string, string> = {
    MAKE_STATE_DIR_NOT_WRITABLE: '本机项目列表保存失败',
    NOT_MAKE_CLIENT_PROJECT: '请选择包含 .axhub/make/client.json 的 Make 客户端项目',
    MAKE_PROJECT_PATH_CONFLICT: '该项目路径已添加',
    MAKE_PROJECT_ID_CONFLICT: '项目 ID 已存在，请更换 Make 客户端项目 ID',
    MAKE_CLIENT_SOURCE_UNAVAILABLE: '无法获取 Make 客户端源码，请确认仓库权限或网络',
    MAKE_CLIENT_TEMPLATE_UNAVAILABLE: '无法下载 Make 客户端模板包，请检查网络或稍后重试',
    MAKE_CLIENT_INSTALL_FAILED: '依赖安装失败',
    MAKE_CLIENT_METADATA_SYNC_FAILED: '项目清单生成失败',
    MAKE_CLIENT_GIT_CLONE_FAILED: 'Git 克隆失败',
    MAKE_CLIENT_UPDATE_NOT_AVAILABLE: '当前客户端模板已是最新版本',
    MAKE_CLIENT_DEV_TIMEOUT: 'Make 客户端启动超时',
    PNPM_NOT_FOUND: '未找到可用的 Node 包管理器，请确认 Node.js 和 npm 可用',
    MAKE_CLIENT_DEV_FAILED: 'Make 客户端启动失败，请检查本地 Node 环境',
    INVALID_MAKE_PROJECT_FOLDER_NAME: '文件夹名称不安全，请使用字母、数字和连字符',
    MAKE_PROJECT_TARGET_NOT_EMPTY: '目标文件夹已存在且不为空',
};

const MAKE_CLIENT_PHASE_LABELS: Record<string, string> = {
    clone: '克隆项目',
    template: '下载模板包',
    install: '安装依赖',
    metadata: '生成项目清单',
    dev: '启动客户端',
    ready: '启动客户端',
};

const MAKE_CLIENT_UPDATE_PHASE_LABELS: Record<string, string> = {
    'download-template': '下载模板',
    template: '下载模板',
    backup: '创建备份',
    overwrite: '覆盖文件',
    version: '写入版本',
    install: '安装依赖',
    metadata: '同步项目清单',
};

function pickString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function readRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
}

function compactLongText(value: unknown): string {
    const text = String(value || '').trim();
    if (text.length <= 8000) return text;
    return `${text.slice(0, 8000)}\n...（以上错误信息过长，已截断；如还不够，请让我继续提供完整日志）`;
}

function stringifyDetail(value: unknown): string {
    if (typeof value === 'string') return compactLongText(value);
    try {
        return compactLongText(JSON.stringify(value, null, 2));
    } catch {
        return compactLongText(value);
    }
}

function renderOptionalLine(label: string, value: unknown, fallback = '(未返回)'): string {
    const text = compactLongText(value);
    return `${label}：${text || fallback}`;
}

function renderDetailsLines(details: Record<string, unknown>): string[] {
    const lines: string[] = [];
    const npmError = pickString(details.npm);
    const pnpmError = pickString(details.pnpm);
    const command = pickString(details.command);
    const args = Array.isArray(details.args)
        ? details.args.map((arg) => String(arg)).filter(Boolean).join(' ')
        : pickString(details.args);
    const commandError = pickString(details.error);
    const viteEntrypoint = pickString(details.viteEntrypoint);
    const installMethod = pickString(details.installMethod);

    if (npmError) lines.push(`npm install 失败：${compactLongText(npmError)}`);
    if (pnpmError) lines.push(`pnpm install 失败：${compactLongText(pnpmError)}`);
    if (command) lines.push(`启动命令：${[command, args].filter(Boolean).join(' ')}`);
    if (commandError) lines.push(`启动命令错误：${compactLongText(commandError)}`);
    if (viteEntrypoint) lines.push(`Vite 入口：${viteEntrypoint}`);
    if (installMethod) lines.push(`依赖安装方式：${installMethod}`);

    if (lines.length === 0 && Object.keys(details).length > 0) {
        lines.push(`原始诊断详情：${stringifyDetail(details)}`);
    }

    return lines;
}

function arrayOfStrings(value: unknown): string[] {
    return Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean) : [];
}

function renderFileCountLine(label: string, value: unknown): string {
    const files = arrayOfStrings(value);
    return `${label}：${files.length > 0 ? files.length : '(未返回)'}`;
}

function renderKeyFileLine(label: string, value: unknown): string {
    const files = arrayOfStrings(value);
    if (files.length === 0) return `${label}：(未返回)`;
    const priorityPatterns = [
        /^package\.json$/u,
        /^pnpm-lock\.yaml$/u,
        /^package-lock\.json$/u,
        /^\.axhub\/make\/client\.json$/u,
        /^\.axhub\/make\/axhub\.config\.json$/u,
        /^AGENTS\.md$/u,
        /^CLAUDE\.md$/u,
        /^README\.md$/u,
    ];
    const selected = files.filter((file) => priorityPatterns.some((pattern) => pattern.test(file))).slice(0, 8);
    const fallback = selected.length > 0 ? selected : files.slice(0, 5);
    const suffix = files.length > fallback.length ? `\n- ...另有 ${files.length - fallback.length} 个文件，完整清单见备份日志 manifest.json` : '';
    return `${label}：${fallback.join('\n- ')}${suffix}`;
}

export function formatMakeClientProjectError(payload: unknown, fallback = 'Make 项目操作失败'): string {
    const raw = readRecord(payload);
    const code = pickString(raw.code);
    const phase = pickString(raw.phase);
    const message = MAKE_CLIENT_ERROR_MESSAGES[code] || pickString(raw.error) || fallback;
    const phaseLabel = MAKE_CLIENT_PHASE_LABELS[phase];
    return phaseLabel ? `${phaseLabel}失败：${message}` : message;
}

export function formatMakeClientUpdateError(payload: unknown, fallback = '项目更新失败'): string {
    const raw = readRecord(payload);
    const code = pickString(raw.code);
    const phase = pickString(raw.phase);
    const message = MAKE_CLIENT_ERROR_MESSAGES[code] || pickString(raw.error) || fallback;
    const phaseLabel = MAKE_CLIENT_UPDATE_PHASE_LABELS[phase] || MAKE_CLIENT_PHASE_LABELS[phase];
    return phaseLabel ? `${phaseLabel}失败：${message}` : message;
}

export function buildMakeClientStartupFailurePrompt(
    payload: unknown,
    options: {
        projectName?: string;
        displayMessage?: string;
        currentUrl?: string;
    } = {},
): string {
    const raw = readRecord(payload);
    const details = readRecord(raw.details);
    const code = pickString(raw.code) || 'MAKE_CLIENT_OPERATION_FAILED';
    const phase = pickString(raw.phase);
    const phaseLabel = MAKE_CLIENT_PHASE_LABELS[phase] || phase || '未知阶段';
    const projectId = pickString(raw.projectId);
    const projectRoot = pickString(raw.projectRoot) || pickString(raw.root);
    const projectName = pickString(options.projectName);
    const displayMessage = pickString(options.displayMessage) || formatMakeClientProjectError(raw, '启动客户端失败');
    const rawError = pickString(raw.error);
    const currentUrl = pickString(options.currentUrl);
    const detailLines = renderDetailsLines(details);

    return [
        '请帮我修复 Axhub Make 客户端启动失败的问题。',
        '',
        '我不懂命令行、Node.js、npm 或 pnpm。请你把每一步都说清楚，一次只让我执行一个命令，并解释这个命令是在检查什么或修复什么。',
        '',
        '**现场信息**：',
        renderOptionalLine('项目名称', projectName),
        renderOptionalLine('项目 ID', projectId),
        renderOptionalLine('项目目录', projectRoot),
        renderOptionalLine('失败阶段', phaseLabel),
        renderOptionalLine('错误码', code),
        renderOptionalLine('用户看到的错误', displayMessage),
        renderOptionalLine('服务端原始错误', rawError),
        ...(currentUrl ? [renderOptionalLine('当前 Axhub Make 页面', currentUrl)] : []),
        '',
        '**错误详情**：',
        ...(detailLines.length > 0 ? detailLines.map((line) => `- ${line}`) : ['- 服务端没有返回更详细的命令输出，请先根据错误码和阶段排查。']),
        '',
        '**请按这个方向排查**：',
        '- 请先判断我的系统是 macOS、Windows 还是 Linux，再给对应系统的命令。',
        '- 请检查项目目录是否存在，以及当前用户是否有读取和写入权限。',
        '- 请检查 Node.js 和 npm 是否可用；如果 npm 失败，再判断是否需要 pnpm。',
        '- 如果是安装依赖失败，请根据上面的 npm/pnpm 输出判断是网络、代理、镜像源、权限、lock 文件还是 package.json 依赖问题。',
        '- 如果是启动客户端失败或超时，请检查 Vite 是否安装、node_modules 是否完整、端口是否被占用，以及开发服务启动后是否写入了 Axhub runtime 信息。',
        '',
        '**安全要求**：',
        '- 不要删除我的项目文件。',
        '- 如果需要删除 node_modules、lock 文件或缓存，请先解释原因，并让我确认后再做。',
        '- 不要直接使用 sudo；如果确实需要管理员权限，请先解释风险，并让我确认。',
        '- 不要让我盲目重装所有东西，请先根据错误输出判断根因。',
        '',
        '修复后请帮我重新启动客户端，并告诉我回到 Axhub Make 后应该刷新页面，还是再次点击“启动客户端”。',
    ].join('\n');
}

export function buildMakeClientUpdateFailurePrompt(
    payload: unknown,
    options: {
        displayMessage?: string;
        currentUrl?: string;
    } = {},
): string {
    const raw = readRecord(payload);
    const details = readRecord(raw.details);
    const code = pickString(raw.code) || 'MAKE_CLIENT_UPDATE_FAILED';
    const phase = pickString(raw.phase);
    const phaseLabel = MAKE_CLIENT_UPDATE_PHASE_LABELS[phase] || MAKE_CLIENT_PHASE_LABELS[phase] || phase || '未知阶段';
    const projectRoot = pickString(raw.projectRoot) || pickString(raw.root);
    const currentVersion = pickString(raw.currentVersion);
    const targetVersion = pickString(raw.targetVersion);
    const backupRoot = pickString(raw.backupRoot);
    const backupZipPath = pickString(raw.backupZipPath);
    const manifestPath = pickString(raw.manifestPath);
    const templateUrl = pickString(raw.templateUrl);
    const displayMessage = pickString(options.displayMessage) || formatMakeClientUpdateError(raw, '项目更新失败');
    const rawError = pickString(raw.error);
    const currentUrl = pickString(options.currentUrl);
    const detailLines = renderDetailsLines(details);

    return [
        '请帮我修复 Axhub Make 客户端更新失败的问题。',
        '',
        '我不懂命令行、Node.js、npm 或 pnpm。请你把每一步都说清楚，一次只让我执行一个命令，并解释这个命令是在检查什么或修复什么。',
        '',
        '**现场信息**：',
        renderOptionalLine('项目目录', projectRoot),
        renderOptionalLine('当前版本', currentVersion),
        renderOptionalLine('目标版本', targetVersion),
        renderOptionalLine('备份目录', backupRoot),
        renderOptionalLine('备份压缩包', backupZipPath),
        renderOptionalLine('备份日志', manifestPath),
        renderOptionalLine('模板来源', templateUrl),
        renderOptionalLine('失败阶段', phaseLabel),
        renderOptionalLine('错误码', code),
        renderOptionalLine('用户看到的错误', displayMessage),
        renderOptionalLine('服务端原始错误', rawError),
        ...(currentUrl ? [renderOptionalLine('当前 Axhub Make 页面', currentUrl)] : []),
        '',
        '**文件情况**：',
        renderFileCountLine('已写入文件数', raw.writtenFiles),
        renderFileCountLine('计划写入文件数', raw.plannedFiles),
        renderKeyFileLine('关键已写入文件', raw.writtenFiles),
        renderKeyFileLine('关键计划文件', raw.plannedFiles),
        '完整文件清单请读取备份日志 manifest.json，不要把清单整段复制到提示词里。',
        '',
        '**错误详情**：',
        ...(detailLines.length > 0 ? detailLines.map((line) => `- ${line}`) : ['- 服务端没有返回更详细的命令输出，请先根据错误码和阶段排查。']),
        '',
        '**请按这个方向排查**：',
        '- 请先判断我的系统是 macOS、Windows 还是 Linux，再给对应系统的命令。',
        '- 请检查项目目录是否存在，以及当前用户是否有读取和写入权限。',
        '- 请检查备份目录、备份压缩包、备份日志和文件数量是否完整。',
        '- 如果是安装依赖或同步项目清单失败，请根据 npm 输出判断是网络、权限、lock 文件、package.json 还是脚本问题。',
        '- 如需完整文件清单，请读取备份日志 manifest.json，不要把清单整段复制到提示词里。',
        '- 可以基于备份目录、manifest.json、original/ 和关键文件判断修复或还原；不要默认自动还原，先说明风险和操作步骤。',
        '',
        '**安全要求**：',
        '- 不要直接删除我的用户原型、资源、运行记录或备份目录。',
        '- 不要删除 src/resources/、.axhub/make/sessions/、.axhub/make/exports/ 或 .axhub/make/edit-history/。',
        '- 如果需要恢复备份、删除 node_modules、lock 文件或缓存，请先解释原因，并让我确认后再做。',
        '- 不要直接使用 sudo；如果确实需要管理员权限，请先解释风险，并让我确认。',
        '',
        '修复后请告诉我是否需要重启或刷新 Make 客户端。',
    ].join('\n');
}
