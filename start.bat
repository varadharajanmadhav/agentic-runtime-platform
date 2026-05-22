@echo off
SETLOCAL EnableDelayedExpansion

echo =====================================================================
echo    Agentic Runtime Platform - Development Environment Setup (WSL Docker)
echo =====================================================================
echo.

:: Check if WSL is available
where wsl >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] WSL (Windows Subsystem for Linux) was not found in the PATH.
    echo.
    pause
    exit /b 1
)

:: Check if Docker daemon is running inside WSL
wsl docker info >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Docker is not running inside WSL. 
    echo Please make sure the Docker service is started in WSL (e.g. running 'sudo service docker start').
    echo.
    pause
    exit /b 1
)

echo [1/3] Starting WSL Docker services (PostgreSQL, Redis, Qdrant)...
wsl docker compose up -d

if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to execute docker compose inside WSL.
    echo.
    pause
    exit /b 1
)

echo.
echo [2/3] Waiting for all services to become healthy...
wsl docker compose up -d --wait

if %ERRORLEVEL% neq 0 (
    echo.
    echo [WARNING] Some services failed to report healthy status within the timeout.
    echo Attempting to proceed anyway...
) else (
    echo [SUCCESS] All WSL Docker backend services are healthy and running.
)

echo.
echo [3/3] Starting Agentic Runtime Platform (npm run dev)...
echo.
npm run dev

ENDLOCAL
pause
