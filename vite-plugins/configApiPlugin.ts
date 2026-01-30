import type { Plugin } from 'vite';
import fs from 'fs';
import path from 'path';

type ProjectDefaults = {
  defaultDoc?: string | null;
  defaultTheme?: string | null;
};

type ProjectInfo = {
  name?: string | null;
  description?: string | null;
};

type SystemConfig = {
  server: Record<string, any>;
  projectDefaults?: ProjectDefaults;
  projectInfo?: ProjectInfo;
};

type AgentDocsPaths = {
  configPath: string;
  agentsTemplatePath: string;
  agentsPath: string;
  claudePath: string;
};

function normalizeOptionalString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeInlineText(value: unknown): string | null {
  const normalized = normalizeOptionalString(value);
  if (!normalized) return null;
  return normalized.replace(/\r?\n+/g, ' ').trim() || null;
}

function normalizeProjectDefaults(value: unknown): ProjectDefaults {
  if (!value || typeof value !== 'object') {
    return { defaultDoc: null, defaultTheme: null };
  }
  const defaults = value as ProjectDefaults;
  return {
    defaultDoc: normalizeOptionalString(defaults.defaultDoc),
    defaultTheme: normalizeOptionalString(defaults.defaultTheme)
  };
}

function normalizeProjectInfo(value: unknown): ProjectInfo {
  if (!value || typeof value !== 'object') {
    return { name: null, description: null };
  }
  const info = value as ProjectInfo;
  return {
    name: normalizeInlineText(info.name),
    description: normalizeInlineText(info.description)
  };
}

function buildProjectInfoSection(projectInfo: ProjectInfo, projectDefaults: ProjectDefaults): string {
  const lines: string[] = [];
  const projectName = normalizeInlineText(projectInfo.name);
  const projectDescription = normalizeInlineText(projectInfo.description);
  const defaultDoc = normalizeOptionalString(projectDefaults.defaultDoc);
  const defaultTheme = normalizeOptionalString(projectDefaults.defaultTheme);

  if (projectName) lines.push(`- 项目名称：${projectName}`);
  if (projectDescription) lines.push(`- 项目简介：${projectDescription}`);
  if (defaultDoc) lines.push(`- 项目总文档：\`assets/docs/${defaultDoc}\``);
  if (defaultTheme) lines.push(`- 默认主题：\`src/themes/${defaultTheme}\``);

  if (!lines.length) return '';
  return ['## 📌 项目信息', '', ...lines].join('\n');
}

function renderAgentsTemplate(template: string, projectInfo: ProjectInfo, projectDefaults: ProjectDefaults) {
  const projectInfoSection = buildProjectInfoSection(projectInfo, projectDefaults);
  let content = template;

  if (content.includes('{{PROJECT_INFO_SECTION}}')) {
    content = content.replace('{{PROJECT_INFO_SECTION}}', projectInfoSection);
    return content;
  }

  const sectionRegex = /^## 📌 项目信息[\s\S]*?(?=^##\s|\s*$)/m;
  if (sectionRegex.test(content)) {
    return content.replace(sectionRegex, projectInfoSection);
  }

  return content;
}

function writeAgentDocs(
  templatePath: string,
  agentsPath: string,
  claudePath: string,
  projectInfo: ProjectInfo,
  projectDefaults: ProjectDefaults
): boolean {
  if (!fs.existsSync(templatePath)) return false;
  const template = fs.readFileSync(templatePath, 'utf8');
  const nextAgentsContent = renderAgentsTemplate(template, projectInfo, projectDefaults);
  fs.writeFileSync(agentsPath, nextAgentsContent, 'utf8');
  fs.writeFileSync(claudePath, nextAgentsContent, 'utf8');
  return true;
}

function syncAgentDocsFromConfig(paths: AgentDocsPaths): void {
  const { configPath, agentsTemplatePath, agentsPath, claudePath } = paths;
  let config: SystemConfig = { server: { host: 'localhost', allowLAN: true } };

  if (fs.existsSync(configPath)) {
    const fileContent = fs.readFileSync(configPath, 'utf8');
    config = JSON.parse(fileContent);
  }

  const projectDefaults = normalizeProjectDefaults(config.projectDefaults);
  const projectInfo = normalizeProjectInfo(config.projectInfo);
  writeAgentDocs(agentsTemplatePath, agentsPath, claudePath, projectInfo, projectDefaults);
}

/**
 * 配置管理 API 插件
 * 提供配置文件的读取和保存功能
 */
export function configApiPlugin(): Plugin {
  const projectRoot = path.resolve(__dirname, '..');
  const configPath = path.resolve(projectRoot, 'axhub.config.json');
  const agentsPath = path.resolve(projectRoot, 'AGENTS.md');
  const claudePath = path.resolve(projectRoot, 'CLAUDE.md');
  const agentsTemplatePath = path.resolve(projectRoot, 'AGENTS.template.md');

  return {
    name: 'config-api-plugin',
    configureServer(server: any) {
      try {
        syncAgentDocsFromConfig({
          configPath,
          agentsTemplatePath,
          agentsPath,
          claudePath
        });
      } catch (e: any) {
        console.warn('Failed to sync AGENTS.md on server start:', e?.message || e);
      }

      // GET /api/config - 读取配置
      server.middlewares.use((req: any, res: any, next: any) => {
        if (req.method === 'GET' && req.url === '/api/config') {
          try {
            let config: SystemConfig = { server: { host: 'localhost', allowLAN: true } };
            
            if (fs.existsSync(configPath)) {
              const fileContent = fs.readFileSync(configPath, 'utf8');
              config = JSON.parse(fileContent);
              
              // 确保有默认值
              if (!config.server) {
                config.server = { host: 'localhost', allowLAN: true };
              }
              if (config.server.allowLAN === undefined) {
                config.server.allowLAN = true;
              }
            }

            config.projectDefaults = normalizeProjectDefaults(config.projectDefaults);
            config.projectInfo = normalizeProjectInfo(config.projectInfo);
            
            // 移除 port 字段（不对外暴露，固定使用 51720 起始）
            if (config.server && 'port' in config.server) {
              delete config.server.port;
            }

            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify(config));
          } catch (e: any) {
            console.error('Error reading config:', e);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: e?.message || 'Failed to read config' }));
          }
          return;
        }

        // POST /api/config - 保存配置
        if (req.method === 'POST' && req.url === '/api/config') {
          const chunks: Buffer[] = [];
          let totalLength = 0;

          req.on('data', (chunk: Buffer) => {
            totalLength += chunk.length;
            if (totalLength > 1024 * 10) { // 10KB 限制
              res.statusCode = 413;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ error: 'Payload too large' }));
              req.destroy();
              return;
            }
            chunks.push(chunk);
          });

          req.on('end', () => {
            try {
              const raw = Buffer.concat(chunks).toString('utf8');
              const newConfig: SystemConfig = JSON.parse(raw);

              // 验证配置格式
              if (!newConfig.server || typeof newConfig.server !== 'object') {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.end(JSON.stringify({ error: 'Invalid config format' }));
                return;
              }

              // 移除 port 字段（不允许配置，固定使用 51720 起始）
              if (newConfig.server && 'port' in newConfig.server) {
                delete newConfig.server.port;
              }

              // 校验/归一化 projectDefaults
              const projectDefaults = normalizeProjectDefaults(newConfig.projectDefaults);
              const projectInfo = normalizeProjectInfo(newConfig.projectInfo);
              newConfig.projectDefaults = projectDefaults;
              newConfig.projectInfo = projectInfo;

              // 使用模板生成 AGENTS.md（项目参考规范）
              if (!writeAgentDocs(agentsTemplatePath, agentsPath, claudePath, projectInfo, projectDefaults)) {
                console.warn('AGENTS.template.md not found, skip regenerating AGENTS.md');
              }

              // 保存配置文件
              fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2), 'utf8');

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ 
                success: true, 
                message: '配置已保存（已根据模板同步 AGENTS.md）' 
              }));
            } catch (e: any) {
              console.error('Error saving config:', e);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ error: e?.message || 'Failed to save config' }));
            }
          });
          return;
        }

        next();
      });
    }
  };
}
