@echo off
setlocal EnableExtensions

cd /d "%~dp0"
if errorlevel 1 goto :fail_cd

echo [1/3] Checking Node.js, npm, Git...

where node >nul 2>nul
if errorlevel 1 goto :fail_node

where npm >nul 2>nul
if errorlevel 1 goto :fail_npm

where git >nul 2>nul
if errorlevel 1 echo [Hint] Git is missing. Continue install/start without Git.

set "NEED_INSTALL=0"
if not exist "node_modules" set "NEED_INSTALL=1"

if "%NEED_INSTALL%"=="0" (
  call npm ls --depth=0 >nul 2>nul
  if errorlevel 1 set "NEED_INSTALL=1"
)

if "%NEED_INSTALL%"=="1" (
  echo [2/3] Installing dependencies ^(npm --registry https://registry.npmmirror.com install^)...
  echo [提示] 首次打开或依赖更新时，安装可能需要几分钟，请耐心等待。
  echo [提示] 这不是每次都会执行，后续通常会直接跳过安装。
  call npm --registry https://registry.npmmirror.com install
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
goto :pause_fail

:fail_node
echo Node.js is not found in PATH. Please install Node.js LTS and reopen terminal.
goto :pause_fail

:fail_npm
echo npm is not found in PATH. Reinstall Node.js LTS and reopen terminal.
goto :pause_fail

:fail_install
echo npm install failed. Please copy the error log and send it to AI for next command.
goto :pause_fail

:fail_dev
echo npm run dev failed. Please copy the error log and send it to AI for next command.
goto :pause_fail

:pause_fail
echo.
echo Start failed. Press any key to close this window.
pause >nul
exit /b 1
