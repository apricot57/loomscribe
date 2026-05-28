@echo off
title LoomScribe Server
cd /d "%~dp0"

:: Check if Node.js is available
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    cls
    echo ========================================
    echo  ERROR: Node.js not found!
    echo ========================================
    echo.
    echo Please install Node.js from https://nodejs.org
    echo.
    pause
    exit /b 1
)

echo Starting LoomScribe server...
echo.

:: Start server in background, redirect output to a log file
start /b "" node server.js > "%TEMP%\loomscribe-server.log" 2>&1

:: Wait a moment for the server to initialize
ping -n 3 127.0.0.1 >nul

:: Open the app in the default browser
start http://localhost:3000

cls
echo ========================================
echo  LoomScribe is running!
echo ========================================
echo.
echo  Open: http://localhost:3000
echo.
echo  Press any key to stop the server.
echo ========================================
echo.
pause >nul

:: Stop the Node.js server
echo Stopping server...
if exist server.pid (
    for /f "usebackq tokens=*" %%A in ("server.pid") do (
        taskkill /f /pid %%A >nul 2>&1
    )
    del server.pid >nul 2>&1
) else (
    taskkill /f /im node.exe >nul 2>&1
)
echo Server stopped.
