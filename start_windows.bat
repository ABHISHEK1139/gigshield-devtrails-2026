@echo off
title GigShield Local Environment
color 0B

echo ===================================================
echo   GigShield - Hybrid Income Protection
echo   Weather + GPS + Deterministic Fraud Guardrails
echo ===================================================
echo.

:: Check for Node.js
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    color 0C
    echo [ERROR] Node.js is not installed!
    echo Please download and install Node.js (v18+) from https://nodejs.org/
    echo Press any key to exit...
    pause >nul
    exit /b
)
echo [OK] Node.js is installed.

echo ===================================================
echo Installing dependencies (this may take a minute)
echo ===================================================
call npm install
if %ERRORLEVEL% NEQ 0 (
    color 0C
    echo.
    echo [ERROR] Failed to install dependencies. Check your npm setup.
    pause
    exit /b
)

echo.
echo ===================================================
echo Booting up the Server and React Frontend...
echo ===================================================
echo The dashboard will be available at http://localhost:5000
echo.
call npm run dev

pause
