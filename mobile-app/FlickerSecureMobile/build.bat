@echo off
REM Build Script for Flicker Mobile App
REM This script sets up the environment and builds the app for Android

setlocal enabledelayedexpansion

REM Set environment variables
set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr
set ANDROID_HOME=C:\Users\dell\AppData\Local\Android\Sdk
set NODE_ENV=production

REM Navigate to the correct directory
cd /d "C:\Users\dell\Thelezinhle-Flicker-\mobile-app\FlickerSecureMobile"

echo.
echo ============================================================
echo FlickerSecure Mobile App Build
echo ============================================================
echo.
echo JAVA_HOME: %JAVA_HOME%
echo ANDROID_HOME: %ANDROID_HOME%
echo Working Directory: %CD%
echo.

REM Check if package.json exists
if not exist package.json (
    echo ERROR: package.json not found in current directory
    echo Current location: %CD%
    pause
    exit /b 1
)

REM Install dependencies if node_modules doesn't exist
if not exist node_modules (
    echo Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo ERROR: npm install failed
        pause
        exit /b 1
    )
)

echo.
echo Starting Expo Android build...
echo This may take 3-5 minutes on first build
echo.

REM Run the Expo Android build
call npm run android

if errorlevel 1 (
    echo.
    echo ERROR: Build failed with exit code !errorlevel!
    echo.
) else (
    echo.
    echo BUILD COMPLETE!
    echo The app should now be installing and launching on the emulator
    echo.
)

pause
