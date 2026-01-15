#!/usr/bin/env node
/**
 * =====================================================
 * CLI: check-app-ready
 *
 * 功能：
 *  - AI 调用，检测 Vite dev server 和页面状态
 *  - 不依赖页面注入
 *  - 捕获已存在和后续构建/热更新错误
 *  - 页面可访问即 READY，出现错误即 ERROR
 *  - 超时返回 TIMEOUT
 *  - 默认包含构建校验，可通过 --skip-build 跳过
 *
 * 使用：
 *   node scripts/check-app-ready.mjs [页面路径]
 *   例如：node scripts/check-app-ready.mjs /elements/button
 *        node scripts/check-app-ready.mjs /pages/home
 *   
 *   跳过构建校验：
 *   node scripts/check-app-ready.mjs --skip-build /elements/button
 *
 * 输出（JSON）：
 * {
 *   status: "READY" | "ERROR" | "TIMEOUT",
 *   phase: "server|build|page|done",
 *   message: "...",
 *   url: "http://localhost:51720/elements/button",
 *   errors: [...],
 *   logs: [...],
 *   buildCheck?: { status: "SUCCESS" | "FAILED", errors: [...], logs: [...] }
 * }
 * =====================================================
 */

import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import process from 'node:process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/* ================= 配置 ================= */
// 解析命令行参数
const args = process.argv.slice(2);
const skipBuild = args.includes('--skip-build');
const pagePath = args.find(arg => !arg.startsWith('--')) || '/';

const CONFIG = {
  devCommand: 'npm run dev',        // 启动 Vite 的命令
  devServerInfoPath: path.resolve(__dirname, '../.dev-server-info.json'), // 开发服务器信息文件
  pagePath,                         // 目标页面路径（从命令行参数获取）
  pollIntervalMs: 500,              // 页面轮询间隔
  stableCheckMs: 1000,              // 错误稳定判断时间
  timeoutMs: 30_000,                // 总超时
  skipBuild                         // 是否跳过构建校验
}

/* ================= 工具函数 ================= */
function jsonExit(payload, code = 0) {
  process.stdout.write(JSON.stringify(payload, null, 2))
  process.exit(code)
}

/**
 * 尝试通过 HTTP 请求获取页面内容，检查是否有错误信息
 */
async function checkPageForErrors(url) {
  try {
    const res = await fetch(url, { method: 'GET' })
    const text = await res.text()
    
    // 尝试从 Vite 错误页面中提取错误对象
    const errorMatch = text.match(/const\s+error\s*=\s*({[\s\S]*?})\s*\n\s*try/);
    if (errorMatch) {
      try {
        // 解析错误对象（需要处理 JSON 中的特殊字符）
        const errorJson = errorMatch[1]
          .replace(/\\u003c/g, '<')
          .replace(/\\u003e/g, '>')
        const errorObj = JSON.parse(errorJson)
        
        // 提取关键错误信息
        const errorInfo = []
        if (errorObj.message) {
          errorInfo.push(`错误: ${errorObj.message.split('\\n')[0]}`)
        }
        if (errorObj.frame) {
          // 提取代码框架信息（去掉过长的内容）
          const frameLines = errorObj.frame.split('\\n').slice(0, 6)
          errorInfo.push('代码位置:')
          errorInfo.push(...frameLines)
        }
        if (errorObj.loc && errorObj.loc.file) {
          errorInfo.push(`文件: ${errorObj.loc.file}`)
          errorInfo.push(`行号: ${errorObj.loc.line}:${errorObj.loc.column}`)
        }
        
        return errorInfo.length > 0 ? [errorInfo.join('\n')] : []
      } catch (e) {
        // JSON 解析失败，尝试简单的文本提取
        logs.push('Failed to parse error JSON, using text extraction')
      }
    }
    
    // 备用方案：检查页面内容中是否包含错误关键词
    const errorPatterns = [
      /ERROR:\s*([^\n]+)/i,
      /SyntaxError:\s*([^\n]+)/i,
      /Transform failed/i
    ]
    
    const foundErrors = []
    for (const pattern of errorPatterns) {
      const match = text.match(pattern)
      if (match) {
        foundErrors.push(match[1] || match[0])
        break // 只取第一个匹配的错误
      }
    }
    
    return foundErrors
  } catch (err) {
    return []
  }
}

async function isServerAlive(url) {
  try {
    const res = await fetch(url, { method: 'GET' })
    return res.ok
  } catch {
    return false
  }
}

/**
 * 读取开发服务器信息
 * 优先从 .dev-server-info.json 读取实际运行的端口
 */
function getServerInfo() {
  try {
    if (fs.existsSync(CONFIG.devServerInfoPath)) {
      const info = JSON.parse(fs.readFileSync(CONFIG.devServerInfoPath, 'utf8'))
      return {
        port: info.port,
        host: info.host || 'localhost',
        localIP: info.localIP || 'localhost'
      }
    }
  } catch (err) {
    logs.push(`Failed to read .dev-server-info.json: ${err.message}`)
  }

  // 如果没有端口信息，返回 null 表示需要等待服务器启动
  return null
}

/**
 * 生成服务器首页 URL
 * 使用 localhost 而不是 0.0.0.0，因为浏览器无法访问 0.0.0.0
 */
function getHomeUrl(serverInfo) {
  // 如果 host 是 0.0.0.0，使用 localhost 替代
  const host = serverInfo.host === '0.0.0.0' ? 'localhost' : serverInfo.host
  return `http://${host}:${serverInfo.port}`
}

/**
 * 获取可访问的 host
 * 将 0.0.0.0 转换为 localhost，因为浏览器无法直接访问 0.0.0.0
 */
function getAccessibleHost(serverInfo) {
  return serverInfo.host === '0.0.0.0' ? 'localhost' : serverInfo.host
}

/* ================= 全局状态 ================= */
let logs = []
let errors = []
let lastErrorTime = 0
let errorCache = new Set() // 用于去重错误信息

/* ================= 阶段 1：启动或 attach Vite ================= */
function startOrAttachVite() {
  logs.push('Checking Vite server...')
  const child = spawn(CONFIG.devCommand, {
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: path.resolve(__dirname, '..')
  })

  child.stdout.on('data', (data) => {
    const text = data.toString().trim()
    if (text) logs.push(text)
    
    // 检测构建错误
    if (/error/i.test(text) || /failed to compile/i.test(text)) {
      errors.push(text)
      lastErrorTime = Date.now()
    }
  })

  child.stderr.on('data', (data) => {
    const text = data.toString().trim()
    if (text) {
      // 过滤掉一些正常的警告信息
      if (!/deprecated|experimental/i.test(text)) {
        errors.push(text)
        lastErrorTime = Date.now()
      }
      logs.push(text)
    }
  })

  child.on('error', (err) => {
    errors.push(`Process error: ${err.message}`)
    lastErrorTime = Date.now()
  })

  return child
}

/* ================= 阶段 2：轮询页面可访问性 ================= */
async function waitForPage(url) {
  const start = Date.now()
  let lastCheckTime = 0
  
  while (Date.now() - start < CONFIG.timeoutMs) {
    const now = Date.now()
    
    // 每隔一段时间尝试获取错误信息（即使页面不可访问）
    if (now - lastCheckTime > 2000) {
      const pageErrors = await checkPageForErrors(url)
      if (pageErrors.length > 0) {
        // 去重：只添加未见过的错误
        pageErrors.forEach(err => {
          const errorKey = err.substring(0, 200) // 使用前200个字符作为唯一标识
          if (!errorCache.has(errorKey)) {
            errorCache.add(errorKey)
            errors.push(err)
          }
        })
      }
      lastCheckTime = now
    }
    
    if (await isServerAlive(url)) return true
    await sleep(CONFIG.pollIntervalMs)
  }
  return false
}

/* ================= 阶段 3：等待稳定状态 ================= */
async function waitForStable(pageUrl) {
  const startTime = Date.now()
  
  while (Date.now() - startTime < CONFIG.timeoutMs) {
    const now = Date.now()
    
    // 页面可访问
    const pageOk = await isServerAlive(pageUrl)
    
    // 如果页面可访问，尝试检查页面内容中的错误
    if (pageOk) {
      const pageErrors = await checkPageForErrors(pageUrl)
      if (pageErrors.length > 0) {
        return {
          status: 'ERROR',
          phase: 'build',
          message: 'Detected error in page content',
          url: pageUrl,
          errors: pageErrors,
          logs
        }
      }
    }
    
    // 错误稳定：最近 stableCheckMs 内没有新的错误
    const stable = (now - lastErrorTime) > CONFIG.stableCheckMs
    
    if (!pageOk) {
      // 页面不可访问，继续轮询
      await sleep(CONFIG.pollIntervalMs)
      continue
    }
    
    if (errors.length > 0) {
      return {
        status: 'ERROR',
        phase: 'build',
        message: 'Detected Vite build/runtime error',
        url: pageUrl,
        errors,
        logs
      }
    }
    
    if (pageOk && stable) {
      return {
        status: 'READY',
        phase: 'done',
        message: 'Page ready and stable',
        url: pageUrl,
        errors: [],
        logs
      }
    }
    
    await sleep(CONFIG.pollIntervalMs)
  }
  
  return {
    status: 'TIMEOUT',
    phase: 'server',
    message: 'Timeout waiting for page/stable state',
    url: pageUrl,
    errors,
    logs
  }
}

/**
 * 为结果添加服务器首页信息
 */
function addHomeUrl(result, serverInfo) {
  return {
    ...result,
    homeUrl: getHomeUrl(serverInfo)
  }
}

/**
 * 执行独立构建校验
 * 针对指定的入口 key 执行单独构建，不是全量构建
 */
async function runBuildCheck(entryKey) {
  logs.push(`Starting build check for entry: ${entryKey}`)
  
  return new Promise((resolve) => {
    const buildErrors = []
    const buildLogs = []
    
    // 使用 ENTRY_KEY 环境变量触发单独构建
    const buildProcess = spawn('npx', ['vite', 'build'], {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, ENTRY_KEY: entryKey },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    
    buildProcess.stdout.on('data', (data) => {
      const text = data.toString().trim()
      if (text) {
        buildLogs.push(text)
        logs.push(`[BUILD] ${text}`)
      }
    })
    
    buildProcess.stderr.on('data', (data) => {
      const text = data.toString().trim()
      if (text) {
        buildLogs.push(text)
        logs.push(`[BUILD ERROR] ${text}`)
        // 捕获构建错误
        if (/error|failed/i.test(text) && !/deprecated|experimental/i.test(text)) {
          buildErrors.push(text)
        }
      }
    })
    
    buildProcess.on('close', (code) => {
      if (code === 0 && buildErrors.length === 0) {
        logs.push(`Build check completed successfully for ${entryKey}`)
        resolve({
          status: 'SUCCESS',
          message: `Build completed successfully for ${entryKey}`,
          errors: [],
          logs: buildLogs
        })
      } else {
        logs.push(`Build check failed for ${entryKey} with exit code ${code}`)
        resolve({
          status: 'FAILED',
          message: `Build failed for ${entryKey} (exit code: ${code})`,
          errors: buildErrors.length > 0 ? buildErrors : [`Build process exited with code ${code}`],
          logs: buildLogs
        })
      }
    })
    
    buildProcess.on('error', (err) => {
      logs.push(`Build process error: ${err.message}`)
      resolve({
        status: 'FAILED',
        message: `Build process error: ${err.message}`,
        errors: [err.message],
        logs: buildLogs
      })
    })
  })
}

/**
 * 从页面路径推断入口 key
 * 例如：/elements/button -> elements/button
 */
function getEntryKeyFromPath(pagePath) {
  // 移除开头的斜杠
  return pagePath.replace(/^\//, '')
}

/* ================= 主流程 ================= */
async function main() {
  try {
    // 获取服务器信息
    const serverInfo = getServerInfo()
    
    // 如果没有端口信息，等待服务器启动
    if (!serverInfo) {
      logs.push('Waiting for server to start...')
      // 启动服务器并等待
      const viteProcess = startOrAttachVite()
      
      // 等待 .dev-server-info.json 文件生成
      const maxWait = 10000 // 10秒
      const startTime = Date.now()
      let newServerInfo = null
      
      while (Date.now() - startTime < maxWait) {
        await new Promise(resolve => setTimeout(resolve, 500))
        newServerInfo = getServerInfo()
        if (newServerInfo) break
      }
      
      if (!newServerInfo) {
        return jsonExit({
          status: 'ERROR',
          phase: 'server',
          message: 'Server failed to start - no port information available',
          url: CONFIG.pagePath,
          errors: ['Server did not write port information within timeout'],
          logs
        }, 1)
      }
      
      // 使用新获取的服务器信息
      const accessibleHost = getAccessibleHost(newServerInfo)
      const pageUrl = `http://${accessibleHost}:${newServerInfo.port}${CONFIG.pagePath}`
      
      logs.push(`Target URL: ${pageUrl}`)
      logs.push(`Server info: port=${newServerInfo.port}, host=${newServerInfo.host}`)
      
      // 继续后续流程...
      await continueWithServerInfo(newServerInfo, pageUrl, viteProcess)
    } else {
      const accessibleHost = getAccessibleHost(serverInfo)
      const pageUrl = `http://${accessibleHost}:${serverInfo.port}${CONFIG.pagePath}`
      
      logs.push(`Target URL: ${pageUrl}`)
      logs.push(`Server info: port=${serverInfo.port}, host=${serverInfo.host}`)
      
      // 继续后续流程...
      await continueWithServerInfo(serverInfo, pageUrl, null)
    }
  } catch (err) {
    const serverInfo = getServerInfo()
    jsonExit(addHomeUrl({
      status: 'ERROR',
      phase: 'server',
      message: err.message,
      url: CONFIG.pagePath,
      errors: [String(err)],
      logs
    }, serverInfo), 1)
  }
}

async function continueWithServerInfo(serverInfo, pageUrl, viteProcess) {
  try {
    // 步骤 1: 执行构建校验（除非指定 --skip-build）
    let buildResult = null
    if (!CONFIG.skipBuild) {
      const entryKey = getEntryKeyFromPath(CONFIG.pagePath)
      logs.push(`Build check enabled for entry: ${entryKey}`)
      buildResult = await runBuildCheck(entryKey)
      
      // 如果构建失败，直接返回错误
      if (buildResult.status === 'FAILED') {
        return jsonExit(addHomeUrl({
          status: 'ERROR',
          phase: 'build',
          message: buildResult.message,
          url: pageUrl,
          errors: buildResult.errors,
          logs,
          buildCheck: buildResult
        }, serverInfo), 1)
      }
    } else {
      logs.push('Build check skipped (--skip-build flag)')
    }
    
    // 步骤 2: 开发服务器校验
    const accessibleHost = getAccessibleHost(serverInfo)
    
    // 检查服务器是否已经在运行
    const serverAlreadyRunning = await isServerAlive(`http://${accessibleHost}:${serverInfo.port}`)
    
    let viteChild = viteProcess
    if (!serverAlreadyRunning && !viteChild) {
      logs.push('Server not running, starting Vite...')
      viteChild = startOrAttachVite()
    } else {
      logs.push('Server already running, skipping start')
    }
    
    // 等待页面可访问
    const pageReachable = await waitForPage(pageUrl)
    if (!pageReachable) {
      if (viteChild) viteChild.kill()
      return jsonExit(addHomeUrl({
        status: 'TIMEOUT',
        phase: 'page',
        message: 'Page never became reachable',
        url: pageUrl,
        errors,
        logs,
        buildCheck: buildResult
      }, serverInfo), 1)
    }
    
    // 等待稳定状态
    const result = await waitForStable(pageUrl)
    
    // 清理进程
    if (viteChild) viteChild.kill()
    
    // 添加构建结果到最终输出
    const finalResult = {
      ...result,
      buildCheck: buildResult
    }
    
    jsonExit(addHomeUrl(finalResult, serverInfo), result.status === 'READY' ? 0 : 1)
  } catch (err) {
    jsonExit(addHomeUrl({
      status: 'ERROR',
      phase: 'server',
      message: err.message,
      url: CONFIG.pagePath,
      errors: [String(err)],
      logs
    }, serverInfo), 1)
  }
}

main()
