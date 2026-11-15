@echo off
setlocal
chcp 65001 >nul
pushd "%~dp0" || exit /b 1
if exist "%CD%\runtime\node.exe" (
  set "SAM_NODE=%CD%\runtime\node.exe"
) else (
  where node.exe >nul 2>&1 || goto missing_node
  set "SAM_NODE=node.exe"
)
"%SAM_NODE%" scripts\desktop.mjs %*
set "SAM_EXIT=%ERRORLEVEL%"
popd
if "%~1"=="" (
  pause
) else if not "%SAM_EXIT%"=="0" (
  pause
)
exit /b %SAM_EXIT%

:missing_node
echo Node.js 24 is required when running from source.
popd
pause
exit /b 1
