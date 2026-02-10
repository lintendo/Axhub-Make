@echo off
setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
pushd "%SCRIPT_DIR%" >nul 2>nul
if errorlevel 1 (
  echo 无法进入项目目录，请右键以终端方式打开后重试。
  exit /b 1
)

echo [1/3] Checking Node.js, npm, Git...

set "MISSING_REQUIRED="
set "MISSING_OPTIONAL="

where node >nul 2>nul
if errorlevel 1 set "MISSING_REQUIRED=!MISSING_REQUIRED! Node.js"

where npm >nul 2>nul
if errorlevel 1 set "MISSING_REQUIRED=!MISSING_REQUIRED! npm"

where git >nul 2>nul
if errorlevel 1 set "MISSING_OPTIONAL=!MISSING_OPTIONAL! Git"

if not "!MISSING_OPTIONAL!"=="" (
  echo [Hint] Git is missing, continue dependency install and startup.
  call :print_ai_prompt 检测到缺少可选工具：!MISSING_OPTIONAL!。当前会继续执行安装依赖和启动。如需拉取代码请安装 Git。
)

if not "!MISSING_REQUIRED!"=="" (
  set "ISSUE=检测到缺少必需工具：!MISSING_REQUIRED!。"
  if not "!MISSING_OPTIONAL!"=="" set "ISSUE=!ISSUE! 同时缺少可选工具：!MISSING_OPTIONAL!。"
  call :print_ai_prompt !ISSUE! 请先安装后重试。
  set "EXIT_CODE=1"
  goto :finish
)

set "NEED_INSTALL=0"
if not exist "node_modules" set "NEED_INSTALL=1"

if "%NEED_INSTALL%"=="0" (
  call npm ls --depth=0 >nul 2>nul
  if errorlevel 1 set "NEED_INSTALL=1"
)

if "%NEED_INSTALL%"=="1" (
  echo [2/3] Installing dependencies ^(npm install^)...
  call npm install
  if errorlevel 1 (
    call :print_ai_prompt 执行 npm install 失败。请分析报错并给我修复步骤。
    set "EXIT_CODE=1"
    goto :finish
  )
) else (
  echo [2/3] Dependencies already installed, skip npm install.
)

echo [3/3] Starting dev server ^(npm run dev^)...
call npm run dev
if errorlevel 1 (
  call :print_ai_prompt 执行 npm run dev 失败。请分析报错并给我修复步骤。
  set "EXIT_CODE=1"
  goto :finish
)

set "EXIT_CODE=0"

goto :finish

:print_ai_prompt
set "ISSUE=%*"
echo AI求助：我在 Windows 启动 Axhub Make 失败，问题：%ISSUE%，项目路径：%cd%。请直接带我修到 npm run dev 成功（我有安装权限），并按“每次只给我下一条可执行命令，我执行后回传结果，你再给下一条”方式直到成功。
exit /b 0

:finish
popd >nul
exit /b %EXIT_CODE%
