import fs from 'node:fs';
import path from 'node:path';
import { createProjectMetadataStore } from './projectCore/index.ts';
const PROJECT_INFO_HEADING = '## 项目信息';
const PROJECT_INFO_TEMPLATE_TOKEN = '{{PROJECT_INFO_SECTION}}';
const AGENTS_FILE_NAME = 'AGENTS.md';
const CLAUDE_FILE_NAME = 'CLAUDE.md';
function cleanMarkdownValue(value) {
    return typeof value === 'string' ? value.replace(/\s+/gu, ' ').trim() : '';
}
function normalizeDisplayPath(value) {
    return value
        .split(path.sep)
        .join('/')
        .replace(/^\.?\//u, '')
        .replace(/\/+$/u, '');
}
function readFileIfExists(filePath) {
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}
function writeFileIfChanged(filePath, content) {
    if (readFileIfExists(filePath) === content)
        return;
    fs.writeFileSync(filePath, content, 'utf8');
}
function pickThemeDesignPath(theme, themeName) {
    const rawPath = cleanMarkdownValue(theme?.sourcePath)
        || cleanMarkdownValue(theme?.path)
        || `src/themes/${themeName}`;
    const normalized = normalizeDisplayPath(rawPath);
    return normalized.endsWith('/DESIGN.md') || normalized === 'DESIGN.md'
        ? normalized
        : `${normalized}/DESIGN.md`;
}
function findThemeByName(projectRoot, themeName) {
    if (!themeName)
        return undefined;
    try {
        const metadata = createProjectMetadataStore(projectRoot).getMetadata();
        return metadata.resources.themes.find((theme) => (cleanMarkdownValue(theme.name) === themeName
            || cleanMarkdownValue(theme.id) === themeName));
    }
    catch {
        return undefined;
    }
}
export function buildProjectInfoSection(params) {
    const projectName = cleanMarkdownValue(params.projectName);
    const projectDescription = cleanMarkdownValue(params.projectDescription);
    const defaultThemeName = cleanMarkdownValue(params.defaultThemeName);
    const lines = [
        projectName ? `- 项目名称：${projectName}` : '',
        projectDescription ? `- 项目简介：${projectDescription}` : '',
        defaultThemeName
            ? `- 默认设计：${defaultThemeName}（\`${pickThemeDesignPath(findThemeByName(params.projectRoot, defaultThemeName), defaultThemeName)}\`）`
            : '',
    ].filter(Boolean);
    return lines.length
        ? [PROJECT_INFO_HEADING, '', ...lines].join('\n')
        : '';
}
function normalizeInstructionContent(content) {
    return `${content.replace(/\r\n/gu, '\n').trim()}\n`;
}
function renderTemplate(template, projectInfoSection) {
    const rendered = template.includes(PROJECT_INFO_TEMPLATE_TOKEN)
        ? template.replace(PROJECT_INFO_TEMPLATE_TOKEN, projectInfoSection)
        : applyProjectInfoSection(template, projectInfoSection);
    return normalizeInstructionContent(rendered);
}
export function applyProjectInfoSection(source, projectInfoSection) {
    const normalized = source.replace(/\r\n/gu, '\n').trim();
    if (!normalized) {
        return projectInfoSection ? `${projectInfoSection}\n` : '';
    }
    const lines = normalized.split('\n');
    const startIndex = lines.findIndex((line) => line.trim() === PROJECT_INFO_HEADING);
    if (startIndex < 0) {
        return normalizeInstructionContent(projectInfoSection ? `${projectInfoSection}\n\n${normalized}` : normalized);
    }
    let endIndex = startIndex + 1;
    while (endIndex < lines.length) {
        const line = lines[endIndex].trim();
        if (line.startsWith('## ') && line !== PROJECT_INFO_HEADING)
            break;
        endIndex += 1;
    }
    const nextLines = [
        ...lines.slice(0, startIndex),
        ...(projectInfoSection ? projectInfoSection.split('\n') : []),
        ...lines.slice(endIndex),
    ];
    return normalizeInstructionContent(nextLines.join('\n').replace(/\n{3,}/gu, '\n\n'));
}
export function syncProjectAgentInstructions(params) {
    const projectRoot = path.resolve(params.projectRoot);
    const projectInfoSection = buildProjectInfoSection({ ...params, projectRoot });
    const agentsPath = path.join(projectRoot, AGENTS_FILE_NAME);
    const claudePath = path.join(projectRoot, CLAUDE_FILE_NAME);
    const templatePath = path.join(projectRoot, 'AGENTS.template.md');
    const agentsSource = readFileIfExists(agentsPath);
    const templateSource = readFileIfExists(templatePath);
    const baseSource = agentsSource || templateSource || '# Agent 工作流程\n';
    const nextAgents = templateSource && !agentsSource
        ? renderTemplate(templateSource, projectInfoSection)
        : applyProjectInfoSection(baseSource, projectInfoSection);
    writeFileIfChanged(agentsPath, nextAgents);
    writeFileIfChanged(claudePath, nextAgents);
}
