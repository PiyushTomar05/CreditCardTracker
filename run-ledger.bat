@echo off
title Karan Filling Station Ledger Launcher
color 0b

echo =============================================================
echo   🚀 KARAN FILLING STATION LEDGER - BOOTING SECURE ENGINE
echo =============================================================
echo.

:: Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js was not found on your system!
    echo.
    echo To keep records permanently on your computer, Node.js is required.
    echo Please install Node.js from https://nodejs.org/ and try again.
    echo.
    echo [FALLBACK] Opening browser dashboard directly (unsynced Browser mode)...
    echo.
    timeout /t 5 >nul
    start "" "index.html"
    exit /b
)

echo [+] Launching persistent database sync server...
:: Run server in background
start "" /b node server.js

:: Give server a second to initialize
timeout /t 2 /nobreak >nul

echo [+] Server started on http://localhost:3000
echo [+] Opening luxury interactive ledger dashboard in browser...
start http://localhost:3000

echo.
echo =============================================================
echo   🟢 SYNC SYSTEM IS NOW ONLINE AND SECURED
echo =============================================================
echo   * Data is automatically backed up to data.json on your disk.
echo   * Keep this window open while you use the application.
echo   * Press Ctrl+C in this window to stop the sync server.
echo.
echo   📱 Access from Phone (on same Wi-Fi):
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| find "IPv4 Address"') do (
    echo      http:%%a:3000
)
echo =============================================================
echo.

:: Keep window open or wait for user to prevent exit
pause
