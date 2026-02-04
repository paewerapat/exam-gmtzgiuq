@echo off
title Exam App - Dev Server

echo ========================================
echo   Starting Exam API + Web Dev Servers
echo ========================================
echo.

start "Exam API (port 3001)" cmd /k "cd exam-api-gmtzgiuq && npm run start:dev"
start "Exam Web (port 3000)" cmd /k "cd exam-web-gmtzgiuq && npm run dev"

echo [API] http://localhost:3001
echo [Web] http://localhost:3000
echo.
echo Both servers started in separate windows.
