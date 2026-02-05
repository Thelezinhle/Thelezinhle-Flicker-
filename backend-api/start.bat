@echo off
REM Backend API Start Script

cd /d "C:\Users\dell\Thelezinhle-Flicker-\backend-api"

echo.
echo ============================================================
echo FlickerSecure Backend API
echo ============================================================
echo.
echo Starting Express.js API server...
echo Port: 5000
echo Frontend URL: http://localhost:3000
echo.

REM Start the backend server
npm run dev

pause
