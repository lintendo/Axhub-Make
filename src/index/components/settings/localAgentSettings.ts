import {
  CLI_AGENT_OPTIONS,
  LOCAL_APP_AGENT_OPTIONS,
} from '../../../common/agent';

export type LocalAgentPathGroup = 'desktop' | 'cli';

export interface LocalAgentPathEntry {
  agent: string;
  path: string;
}

export interface LocalAgentToolOpenStateEntry {
  executablePath?: string;
  commandPath?: string;
  appPathName?: string;
  lastOpenMode?: string;
}

export type LocalAgentToolOpenState = Record<string, LocalAgentToolOpenStateEntry>;
export type LocalAgentToolOpenStatePatch = Record<string, LocalAgentToolOpenStateEntry | null>;

export interface LocalAgentPathOption {
  agent: string;
  label: string;
  stateKey: string;
  pathField: 'executablePath' | 'commandPath';
}

export const LOCAL_DESKTOP_AGENT_PATH_OPTIONS: readonly LocalAgentPathOption[] = [
  {
    agent: 'cursor',
    label: 'Cursor',
    stateKey: 'ide:cursor',
    pathField: 'executablePath',
  },
  ...LOCAL_APP_AGENT_OPTIONS.map((option) => ({
    agent: option.value,
    label: option.label,
    stateKey: `local-app:${option.value}`,
    pathField: 'commandPath' as const,
  })),
];

export const LOCAL_CLI_AGENT_PATH_OPTIONS: readonly LocalAgentPathOption[] = CLI_AGENT_OPTIONS.map((option) => ({
  agent: option.value,
  label: option.label,
  stateKey: `cli:${option.value}`,
  pathField: 'commandPath' as const,
}));

function pathOptionsForGroup(group: LocalAgentPathGroup): readonly LocalAgentPathOption[] {
  return group === 'desktop' ? LOCAL_DESKTOP_AGENT_PATH_OPTIONS : LOCAL_CLI_AGENT_PATH_OPTIONS;
}

export function readLocalAgentPathEntries(
  toolOpenState: LocalAgentToolOpenState | null | undefined,
  group: LocalAgentPathGroup,
): LocalAgentPathEntry[] {
  const state = toolOpenState || {};
  return pathOptionsForGroup(group).flatMap((option) => {
    const path = String(state[option.stateKey]?.[option.pathField] || '').trim();
    return path ? [{ agent: option.agent, path }] : [];
  });
}

function normalizedEntries(
  entries: readonly LocalAgentPathEntry[],
  options: readonly LocalAgentPathOption[],
): Array<{ option: LocalAgentPathOption; path: string }> {
  const optionMap = new Map(options.map((option) => [option.agent, option]));
  const usedAgents = new Set<string>();
  const result: Array<{ option: LocalAgentPathOption; path: string }> = [];
  for (const entry of entries) {
    const option = optionMap.get(String(entry.agent || '').trim());
    const path = String(entry.path || '').trim();
    if (!option || !path || usedAgents.has(option.agent)) continue;
    usedAgents.add(option.agent);
    result.push({ option, path });
  }
  return result;
}

export function buildLocalAgentToolOpenStatePatch(
  existing: LocalAgentToolOpenState | null | undefined,
  desktopEntries: readonly LocalAgentPathEntry[],
  cliEntries?: readonly LocalAgentPathEntry[],
): LocalAgentToolOpenStatePatch {
  const current = existing || {};
  const patch: LocalAgentToolOpenStatePatch = { ...current };
  const manageCliEntries = cliEntries !== undefined;
  const managedOptions = manageCliEntries
    ? [...LOCAL_DESKTOP_AGENT_PATH_OPTIONS, ...LOCAL_CLI_AGENT_PATH_OPTIONS]
    : LOCAL_DESKTOP_AGENT_PATH_OPTIONS;

  for (const option of managedOptions) {
    if (Object.prototype.hasOwnProperty.call(current, option.stateKey)) {
      patch[option.stateKey] = null;
    }
  }

  const normalized = normalizedEntries(desktopEntries, LOCAL_DESKTOP_AGENT_PATH_OPTIONS);
  if (manageCliEntries) {
    normalized.push(...normalizedEntries(cliEntries, LOCAL_CLI_AGENT_PATH_OPTIONS));
  }

  for (const { option, path } of normalized) {
    patch[option.stateKey] = {
      ...(current[option.stateKey] || {}),
      [option.pathField]: path,
    };
  }

  return patch;
}

export interface GlobalSettingsAiPromptParams {
  makeApiOrigin: string;
  projectId: string;
}

function normalizePromptApiOrigin(value: string): string {
  const normalized = String(value || '').trim().replace(/\/+$/u, '');
  return normalized || 'http://localhost:53817';
}

export function buildGlobalSettingsAiPrompt({ makeApiOrigin, projectId }: GlobalSettingsAiPromptParams): string {
  const apiOrigin = normalizePromptApiOrigin(makeApiOrigin);
  const encodedProjectId = encodeURIComponent(String(projectId || '').trim());

  return [
    '请帮我安全配置 Axhub Make 的全局设置。',
    '',
    `当前 Make API 地址：${apiOrigin}`,
    `当前项目 ID：${String(projectId || '').trim() || '(未提供)'}`,
    '',
    '开始前必须先阅读项目内的 `rules/axhub-make-global-settings.md`，并先列出本次实际会改动的配置文件和字段，再等待我确认后写入。',
    '规则只覆盖用户主目录 `.axhub/make/` 下的 `server.config.json` 和 `voice-assistant.settings.json`。',
    '本次只处理用户明确要求的用户主目录全局配置，不修改项目目录内的 `.axhub/make/axhub.config.json`、项目名称、项目描述或默认设计。',
    '',
    '读取两份 JSON 后只合并用户明确要求的字段，保留未知字段；两空格缩进保存。任一文件无法解析时不得覆盖原文件。',
    '安装软件、写入或清除密钥、密码、token、secret（包括密码散列、LAN secret 和发布 token），以及任何对外发布操作都必须先向我说明并取得明确确认；不得擅自生成、删除、回显或迁移这些值。',
    '',
    '当用户要求配置本地 Agent 时，先探测是否已安装；缺失时只能使用官方渠道安装，安装后找到实际可执行路径，再写入对应字段。',
    `写入 CLI 路径后，调用 GET ${apiOrigin}/api/agent/versions?agent=<agent>。只有 ` +
      '`agents.<agent>.status` 为 `installed` 且存在版本值时才保留该 CLI 配置；否则恢复原值并说明失败原因。',
    `对可作为 ACP Provider 的 Agent，调用 POST ${apiOrigin}/api/ai/runs?projectId=${encodedProjectId}，请求体使用 ` +
      '`scene: "agent-provider-test"`、`client: "acp:<agent>"` 和固定提示词 `请只返回 AXHUB_AGENT_TEST_OK，不要返回其他文字。`；SSE 响应包含 `AXHUB_AGENT_TEST_OK` 才算通过。',
    '桌面 Agent 不强行调用 CLI 版本接口：验证路径存在且可启动，并在可用时通过 Make 的“打开 AI”链路完成一次打开验证。若该桌面应用不支持版本检测，清楚报告“路径验证通过、CLI 版本检测不适用”，不能伪造通过状态。',
    '',
    '完成后重新读取文件，确认只发生了已确认字段的变化，并报告每个文件、字段、验证结果和任何未执行的高风险操作。',
  ].join('\n');
}
