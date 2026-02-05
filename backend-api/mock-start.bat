@echo off
REM Mock Backend Server Start Script

cd /d "C:\Users\dell\Thelezinhle-Flicker-\backend-api"

echo.
echo ============================================================
echo FlickerSecure Backend API (Mock - No Database Required)
echo ============================================================
echo.
echo Starting mock Express server...
echo API URL: http://localhost:5000
echo Frontend: http://localhost:3000
echo.

REM Start the mock server
node mock-server.js
