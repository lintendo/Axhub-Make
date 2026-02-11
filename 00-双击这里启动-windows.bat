@echo off
setlocal EnableExtensions

set "NPM_REGISTRY=https://registry.npmmirror.com"

cd /d "%~dp0"
if errorlevel 1 goto :fail_cd

echo [1/3] Checking Node.js, npm, Git...

where node >nul 2>nul
if errorlevel 1 goto :fail_node

where npm >nul 2>nul
if errorlevel 1 goto :fail_npm

set "GIT_MISSING=0"
where git >nul 2>nul
if errorlevel 1 set "GIT_MISSING=1"
if "%GIT_MISSING%"=="1" (
  echo [Hint] Git is missing. Continue install/start without Git.
  call :print_ai_hint "Git is missing. Install Git later if you need clone/pull features."
)

set "NEED_INSTALL=0"
if not exist "node_modules" set "NEED_INSTALL=1"

if "%NEED_INSTALL%"=="0" (
  call npm ls --depth=0 >nul 2>nul
  if errorlevel 1 set "NEED_INSTALL=1"
)

if "%NEED_INSTALL%"=="1" (
  echo [2/3] Installing dependencies ^(npm --registry %NPM_REGISTRY% install^)...
  echo [Hint] First launch or dependency changes may take a few minutes. Please wait.
  echo [Hint] This step does not run every time. Future launches usually skip install.
  call npm --registry %NPM_REGISTRY% install
  if errorlevel 1 goto :fail_install
) else (
  echo [2/3] Dependencies already installed. Skip npm install.
)

echo [3/3] Starting dev server ^(npm run dev^)...
call npm run dev
if errorlevel 1 goto :fail_dev

exit /b 0

:fail_cd
echo Cannot enter project directory. Please right-click and open with Terminal, then retry.
call :print_ai_hint "Cannot enter the project directory."
goto :pause_fail

:fail_node
echo Node.js is not found in PATH. Please install Node.js LTS and reopen terminal.
call :print_ai_hint "Node.js is missing in PATH."
goto :pause_fail

:fail_npm
echo npm is not found in PATH. Reinstall Node.js LTS and reopen terminal.
call :print_ai_hint "npm is missing in PATH."
goto :pause_fail

:fail_install
echo npm install failed. Please copy the error log and send it to AI for next command.
call :print_ai_hint "npm install failed."
goto :pause_fail

:fail_dev
echo npm run dev failed. Please copy the error log and send it to AI for next command.
call :print_ai_hint "npm run dev failed."
goto :pause_fail

:print_ai_hint
set "ISSUE=%~1"
echo AI_HELP: I cannot start Axhub Make on Windows. Issue: %ISSUE% Project path: %cd%. I have install permissions. Please guide me command-by-command until npm run dev works.
exit /b 0

:pause_fail
echo.
echo Start failed. Press any key to close this window.
pause >nul
exit /b 1
