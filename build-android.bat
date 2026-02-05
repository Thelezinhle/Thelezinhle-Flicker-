@echo off
REM Set environment variables for Android build
set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr
set ANDROID_HOME=C:\Users\dell\AppData\Local\Android\Sdk

REM Navigate to mobile app directory
cd "C:\Users\dell\Thelezinhle-Flicker-\mobile-app\FlickerSecureMobile"

REM Run the Expo Android build
echo Starting Android build with JAVA_HOME and ANDROID_HOME set...
echo JAVA_HOME=%JAVA_HOME%
echo ANDROID_HOME=%ANDROID_HOME%
npm run android

pause
