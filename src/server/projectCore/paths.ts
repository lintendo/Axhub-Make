import os from 'node:os';
import path from 'node:path';

const MAKE_HOME_DIR_ENV = 'AXHUB_MAKE_HOME_DIR';

export const MAKE_STATE_DIR = path.join('.axhub', 'make');
export const MAKE_CONFIG_RELATIVE_PATH = path.join(MAKE_STATE_DIR, 'axhub.config.json');
export const MAKE_ENTRIES_RELATIVE_PATH = path.join(MAKE_STATE_DIR, 'entries.json');
export const MAKE_RUNTIME_SERVER_INFO_RELATIVE_PATH = path.join(MAKE_STATE_DIR, '.dev-server-info.json');
export const MAKE_ADMIN_SERVER_INFO_RELATIVE_PATH = path.join(MAKE_STATE_DIR, '.admin-server-info.json');
export const SIDEBAR_TREE_STORE_RELATIVE_PATH = path.join(MAKE_STATE_DIR, 'sidebar-tree.json');
export const PROJECT_METADATA_RELATIVE_PATH = path.join(MAKE_STATE_DIR, 'project.json');
export const MAKE_CLIENT_MARKER_RELATIVE_PATH = path.join(MAKE_STATE_DIR, 'client.json');
export const PROJECT_SESSIONS_RELATIVE_DIR = path.join(MAKE_STATE_DIR, 'sessions');
export const PROJECT_EXPORTS_RELATIVE_DIR = path.join(MAKE_STATE_DIR, 'exports');
export const PROJECT_EDIT_HISTORY_RELATIVE_DIR = path.join(MAKE_STATE_DIR, 'edit-history');
export const GLOBAL_PROJECTS_REGISTRY_FILE_NAME = 'projects.json';
export const GLOBAL_SERVER_CONFIG_FILE_NAME = 'server.config.json';
export const GLOBAL_VOICE_ASSISTANT_SETTINGS_FILE_NAME = 'voice-assistant.settings.json';
export const GLOBAL_MAKE_SERVICE_LOG_FILE_NAME = 'make-service.log';

export function resolveProjectRoot(projectRoot: string): string {
  return path.resolve(projectRoot);
}

export function getMakeStateDir(projectRoot: string): string {
  return path.join(resolveProjectRoot(projectRoot), MAKE_STATE_DIR);
}

export function getGlobalMakeStateDir(homeDir?: string): string {
  const resolvedHomeDir = homeDir || process.env[MAKE_HOME_DIR_ENV] || os.homedir();
  return path.join(path.resolve(resolvedHomeDir), MAKE_STATE_DIR);
}

export function getProjectRegistryPath(homeDir?: string): string {
  return path.join(getGlobalMakeStateDir(homeDir), GLOBAL_PROJECTS_REGISTRY_FILE_NAME);
}

export function getGlobalServerConfigPath(homeDir?: string): string {
  return path.join(getGlobalMakeStateDir(homeDir), GLOBAL_SERVER_CONFIG_FILE_NAME);
}

export function getGlobalVoiceAssistantSettingsPath(homeDir?: string): string {
  return path.join(getGlobalMakeStateDir(homeDir), GLOBAL_VOICE_ASSISTANT_SETTINGS_FILE_NAME);
}

export function getGlobalMakeServiceLogPath(homeDir?: string): string {
  return path.join(getGlobalMakeStateDir(homeDir), GLOBAL_MAKE_SERVICE_LOG_FILE_NAME);
}

export function getConfigPath(projectRoot: string): string {
  return path.join(resolveProjectRoot(projectRoot), MAKE_CONFIG_RELATIVE_PATH);
}

export function getEntriesManifestPath(projectRoot: string): string {
  return path.join(resolveProjectRoot(projectRoot), MAKE_ENTRIES_RELATIVE_PATH);
}

export function getRuntimeServerInfoPath(projectRoot: string): string {
  return path.join(resolveProjectRoot(projectRoot), MAKE_RUNTIME_SERVER_INFO_RELATIVE_PATH);
}

export function getGlobalAdminServerInfoPath(homeDir?: string): string {
  return path.join(getGlobalMakeStateDir(homeDir), path.basename(MAKE_ADMIN_SERVER_INFO_RELATIVE_PATH));
}

export function getAdminServerInfoPath(_projectRoot?: string, options: { homeDir?: string } = {}): string {
  return getGlobalAdminServerInfoPath(options.homeDir);
}

export function getSidebarTreeStorePath(projectRoot: string): string {
  return path.join(resolveProjectRoot(projectRoot), SIDEBAR_TREE_STORE_RELATIVE_PATH);
}

export function getProjectMetadataPath(projectRoot: string): string {
  return path.join(resolveProjectRoot(projectRoot), PROJECT_METADATA_RELATIVE_PATH);
}

export function getMakeClientMarkerPath(projectRoot: string): string {
  return path.join(resolveProjectRoot(projectRoot), MAKE_CLIENT_MARKER_RELATIVE_PATH);
}

export function getProjectSessionsDir(projectRoot: string): string {
  return path.join(resolveProjectRoot(projectRoot), PROJECT_SESSIONS_RELATIVE_DIR);
}

export function getProjectExportsDir(projectRoot: string): string {
  return path.join(resolveProjectRoot(projectRoot), PROJECT_EXPORTS_RELATIVE_DIR);
}

export function getProjectEditHistoryDir(projectRoot: string): string {
  return path.join(resolveProjectRoot(projectRoot), PROJECT_EDIT_HISTORY_RELATIVE_DIR);
}
