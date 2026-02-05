@echo off
REM Frontend Web Server Start Script

cd /d "C:\Users\dell\Thelezinhle-Flicker-\frontend-web"

echo.
echo ============================================================
echo FlickerSecure Frontend Web
echo ============================================================
echo.
echo Starting Vite dev server...
echo Local:   http://localhost:3000/
echo.

REM Start the frontend server
npm run dev
