@echo off
REM ========================================
REM FlickerSecure - Database Setup Script
REM ========================================

echo.
echo [1/4] Starting Docker containers...
docker-compose -f docker-compose.dev.yml up -d

echo [2/4] Waiting for PostgreSQL to be ready (30 seconds)...
timeout /t 30 /nobreak

echo [3/4] Checking container status...
docker ps

echo.
echo [4/4] Attempting database connection...
docker exec flickersecure_postgres psql -U postgres -d flickersecure_db -c "SELECT version();" 2>nul
if %ERRORLEVEL% == 0 (
    echo.
    echo ========================================
    echo ✅ PostgreSQL is ready!
    echo ========================================
    echo.
    echo Next steps:
    echo 1. Open new terminal and run: cd backend-api ^&^& npm install ^&^& npm run dev
    echo 2. Open another terminal and run: cd frontend-web ^&^& npm run dev
    echo 3. Open browser: http://localhost:3000
    echo.
) else (
    echo.
    echo ❌ PostgreSQL is not ready yet
    echo Try again in a few seconds or check Docker logs:
    echo docker logs flickersecure_postgres
    echo.
)

pause
