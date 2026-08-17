import fs from 'node:fs';
import path from 'node:path';
import { getProjectExportsDir } from './projectCore/index.ts';
function stringValue(value) {
    return typeof value === 'string' ? value.trim() : '';
}
function readExportRecords(projectRoot) {
    const exportsDir = getProjectExportsDir(projectRoot);
    if (!fs.existsSync(exportsDir)) {
        return [];
    }
    return fs.readdirSync(exportsDir)
        .filter((fileName) => fileName.endsWith('.json'))
        .flatMap((fileName) => {
        try {
            const parsed = JSON.parse(fs.readFileSync(path.join(exportsDir, fileName), 'utf8'));
            return parsed && typeof parsed === 'object' ? [parsed] : [];
        }
        catch {
            return [];
        }
    });
}
export function readLatestAxhubPublishBinding(projectRoot, context) {
    let latest = null;
    for (const record of readExportRecords(projectRoot)) {
        const pid = Number(record.metadata?.axhubProjectId);
        const hostedPath = stringValue(record.metadata?.axhubProjectPath);
        const url = stringValue(record.metadata?.url);
        const prototypeId = stringValue(record.metadata?.prototypeId);
        const publishedAt = stringValue(record.createdAt);
        if (record.operationType !== 'cloud.publish.axhub'
            || record.status !== 'success'
            || stringValue(record.projectId) !== context.projectId
            || prototypeId !== context.prototypeId
            || !Number.isInteger(pid)
            || pid <= 0
            || !hostedPath
            || !url
            || !publishedAt) {
            continue;
        }
        if (!latest || publishedAt > latest.publishedAt) {
            latest = {
                pid,
                path: hostedPath,
                url,
                projectId: context.projectId,
                prototypeId,
                publishedAt,
            };
        }
    }
    return latest;
}
