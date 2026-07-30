import { describe, expect, it } from 'vitest';

import {
  buildMakeClientUpdateFailurePrompt,
  buildMakeClientStartupFailurePrompt,
  formatMakeClientProjectError,
  formatMakeClientUpdateError,
} from './projectSetupErrors';

describe('project setup errors', () => {
  it('formats make client setup errors with phase labels', () => {
    expect(formatMakeClientProjectError({
      code: 'MAKE_CLIENT_INSTALL_FAILED',
      phase: 'install',
      error: 'npm install failed',
    })).toBe('安装依赖失败：依赖安装失败');

    expect(formatMakeClientProjectError({
      code: 'MAKE_CLIENT_GIT_CLONE_FAILED',
      phase: 'clone',
      error: 'Permission denied (publickey)',
    })).toBe('克隆项目失败：Git 克隆失败');
  });

  it('formats an already registered project path', () => {
    expect(formatMakeClientProjectError({
      code: 'MAKE_PROJECT_PATH_CONFLICT',
      error: 'Project path already registered',
    })).toBe('该项目路径已添加');
  });

  it('builds a novice-friendly prompt from make client startup diagnostics', () => {
    const prompt = buildMakeClientStartupFailurePrompt({
      projectId: 'demo-project',
      projectRoot: '/workspace/example/demo-project',
      code: 'MAKE_CLIENT_INSTALL_FAILED',
      phase: 'install',
      error: 'npm install failed: registry timeout',
      details: {
        npm: 'npm ERR! network registry timeout',
        pnpm: 'command not found: pnpm',
      },
    }, {
      projectName: 'Demo Project',
      displayMessage: '安装依赖失败：依赖安装失败',
    });

    expect(prompt).toContain('请帮我修复 Axhub Make 客户端启动失败的问题。');
    expect(prompt).toContain('项目名称：Demo Project');
    expect(prompt).toContain('项目 ID：demo-project');
    expect(prompt).toContain('项目目录：/workspace/example/demo-project');
    expect(prompt).toContain('失败阶段：安装依赖');
    expect(prompt).toContain('错误码：MAKE_CLIENT_INSTALL_FAILED');
    expect(prompt).toContain('用户看到的错误：安装依赖失败：依赖安装失败');
    expect(prompt).toContain('服务端原始错误：npm install failed: registry timeout');
    expect(prompt).toContain('npm install 失败：npm ERR! network registry timeout');
    expect(prompt).toContain('pnpm install 失败：command not found: pnpm');
    expect(prompt).toContain('请先判断我的系统是 macOS、Windows 还是 Linux');
    expect(prompt).toContain('不要删除我的项目文件');
    expect(prompt).toContain('不要直接使用 sudo');
    expect(prompt).toContain('修复后请帮我重新启动客户端');
  });

  it('formats make client update failed phases without Git-specific blockers', () => {
    expect(formatMakeClientUpdateError({
      code: 'MAKE_CLIENT_UPDATE_NOT_AVAILABLE',
      phase: 'version',
      error: 'already latest',
    })).toBe('写入版本失败：当前客户端模板已是最新版本');

    expect(formatMakeClientUpdateError({
      code: 'MAKE_CLIENT_METADATA_SYNC_FAILED',
      phase: 'metadata',
      error: 'metadata sync exploded',
    })).toBe('同步项目清单失败：项目清单生成失败');
  });

  it('builds an AI handoff prompt from make client update failure diagnostics', () => {
    const prompt = buildMakeClientUpdateFailurePrompt({
      projectRoot: '/workspace/example/demo-project',
      currentVersion: '0.1.0',
      targetVersion: '0.1.6',
      backupRoot: '/workspace/example/demo-project/.axhub/make/backups/client-update-20260605',
      backupZipPath: '/workspace/example/demo-project/.axhub/make/backups/client-update-20260605/client-update-backup.zip',
      manifestPath: '/workspace/example/demo-project/.axhub/make/backups/client-update-20260605/manifest.json',
      templateUrl: 'https://example.com/template.zip',
      code: 'MAKE_CLIENT_METADATA_SYNC_FAILED',
      phase: 'metadata',
      error: 'metadata sync exploded',
      writtenFiles: ['package.json', 'src/prototypes/beginner-guide/index.tsx'],
      plannedFiles: ['package.json', '.axhub/make/client.json'],
      details: {
        command: 'npm',
        args: ['run', 'metadata:sync'],
        error: 'metadata sync exploded',
      },
    }, {
      displayMessage: '同步项目清单失败：项目清单生成失败',
    });

    expect(prompt).toContain('请帮我修复 Axhub Make 客户端更新失败的问题。');
    expect(prompt).toContain('项目目录：/workspace/example/demo-project');
    expect(prompt).toContain('当前版本：0.1.0');
    expect(prompt).toContain('目标版本：0.1.6');
    expect(prompt).toContain('备份目录：/workspace/example/demo-project/.axhub/make/backups/client-update-20260605');
    expect(prompt).toContain('备份压缩包：/workspace/example/demo-project/.axhub/make/backups/client-update-20260605/client-update-backup.zip');
    expect(prompt).toContain('备份日志：/workspace/example/demo-project/.axhub/make/backups/client-update-20260605/manifest.json');
    expect(prompt).toContain('模板来源：https://example.com/template.zip');
    expect(prompt).toContain('已写入文件数：2');
    expect(prompt).toContain('计划写入文件数：2');
    expect(prompt).toContain('关键已写入文件：package.json');
    expect(prompt).toContain('.axhub/make/client.json');
    expect(prompt).not.toContain('src/prototypes/beginner-guide/index.tsx');
    expect(prompt).toContain('服务端原始错误：metadata sync exploded');
    expect(prompt).toContain('不要直接删除我的用户原型、资源、运行记录或备份目录');
    expect(prompt).toContain('请检查备份目录、备份压缩包、备份日志和文件数量是否完整');
    expect(prompt).toContain('如需完整文件清单，请读取备份日志 manifest.json，不要把清单整段复制到提示词里');
    expect(prompt).toContain('可以基于备份目录、manifest.json、original/ 和关键文件判断修复或还原');
    expect(prompt).not.toContain('Git');
    expect(prompt).not.toContain('回退');
  });
});
