@echo off
echo =======================================
echo Starting Workflow Dashboard Servers...
echo =======================================

cd /d "%~dp0"

echo Starting Workflow Dashboard (BE + FE) via concurrently...
npm run dev
pause
