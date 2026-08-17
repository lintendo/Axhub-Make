import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';
export function resolveDefaultDiagnosticLogFile(cwd = process.cwd(), now = new Date()) {
    const stamp = now.toISOString().replace(/[:.]/gu, '-');
    return path.resolve(cwd, '.local', 'logs', `axhub-make-${stamp}-${process.pid}.log`);
}
function formatUnknown(value) {
    if (value instanceof Error) {
        return value.stack || value.message;
    }
    if (typeof value === 'string') {
        return value;
    }
    return util.inspect(value, { colors: false, depth: 6 });
}
function normalizeLineText(line) {
    const normalized = line.replace(/\r\n?/gu, '\n');
    const lines = normalized.split('\n');
    return lines[lines.length - 1] === '' ? lines.slice(0, -1) : lines;
}
export function startDiagnosticLog(filePath) {
    const resolvedFilePath = path.resolve(filePath);
    fs.mkdirSync(path.dirname(resolvedFilePath), { recursive: true });
    fs.appendFileSync(resolvedFilePath, `\n[${new Date().toISOString()}] [diagnostic] log started file=${resolvedFilePath}\n`, 'utf8');
    let closed = false;
    let writeDisabled = false;
    const originals = {};
    const append = (line) => {
        if (closed || writeDisabled) {
            return;
        }
        const timestamp = new Date().toISOString();
        const payload = normalizeLineText(line)
            .map((part) => `[${timestamp}] ${part}`)
            .join('\n');
        if (!payload) {
            return;
        }
        try {
            fs.appendFileSync(resolvedFilePath, `${payload}\n`, 'utf8');
        }
        catch {
            writeDisabled = true;
        }
    };
    const write = (line) => {
        append(line);
    };
    const patchConsole = (method) => {
        const original = console[method];
        originals[method] = original;
        console[method] = ((...args) => {
            original(...args);
            append(`[console:${method}] ${util.format(...args)}`);
        });
    };
    ['log', 'info', 'warn', 'error'].forEach(patchConsole);
    const onUncaughtExceptionMonitor = (error, origin) => {
        append(`[process:uncaughtException] origin=${origin}\n${formatUnknown(error)}`);
    };
    const onWarning = (warning) => {
        append(`[process:warning]\n${formatUnknown(warning)}`);
    };
    process.on('uncaughtExceptionMonitor', onUncaughtExceptionMonitor);
    process.on('warning', onWarning);
    return {
        filePath: resolvedFilePath,
        write,
        close() {
            if (closed) {
                return;
            }
            closed = true;
            Object.keys(originals).forEach((method) => {
                const original = originals[method];
                if (original) {
                    console[method] = original;
                }
            });
            process.off('uncaughtExceptionMonitor', onUncaughtExceptionMonitor);
            process.off('warning', onWarning);
        },
    };
}
