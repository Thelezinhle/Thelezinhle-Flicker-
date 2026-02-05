# Android Setup & Run Instructions

## Current Status ✅
- ✅ Mobile app dependencies installed
- ✅ Expo CLI configured
- ✅ ADB (Android Debug Bridge) detected
- ⚠️ No Android emulator running

---

## 🚀 Option 1: Using Android Studio Emulator (Recommended)

### Step 1: Open Android Studio
1. Open **Android Studio** (if not already open)
2. Go to: **Device Manager** → **Virtual Devices**

### Step 2: Create/Start an Emulator
If you don't have a virtual device:
1. Click **Create Device**
2. Select **Pixel 6** (or your preferred device)
3. Choose **API 35** (or latest available)
4. Click **Create**

Then, click the **Play button** (▶️) to start the emulator

### Step 3: Run the Expo App
Once emulator is running, execute:
```powershell
cd "c:\Users\dell\Thelezinhle-Flicker-\mobile-app\FlickerSecureMobile"
npm run android
```

---

## 🚀 Option 2: Run on Physical Android Device

### Prerequisites:
- Android phone with USB debugging enabled
- USB cable connected to computer

### Steps:
1. Connect your Android device via USB
2. Enable Developer Mode:
   - Settings → About Phone → Tap "Build Number" 7 times
   - Go back → System → Developer Options → Enable USB Debugging

3. Verify connection:
   ```powershell
   adb devices
   ```

4. Run the app:
   ```powershell
   cd "c:\Users\dell\Thelezinhle-Flicker-\mobile-app\FlickerSecureMobile"
   npm run android
   ```

---

## 📱 App Features

The FlickerSecure mobile app includes:
- **Bottom Tab Navigation**: Explore & Settings
- **Proximity Detection**: Via Bluetooth/UWB
- **Light-ID Recognition**: Hardware-based authentication
- **Real-time Updates**: WebSocket integration
- **Hardware Services**: Bluetooth, GPS, accelerometer

---

## 🔧 Direct Android Studio Method

If you prefer building through Android Studio directly:

1. **Open Android Studio**
2. **File → Open → Select folder:**
   ```
   c:\Users\dell\Thelezinhle-Flicker-\mobile-app\FlickerSecureMobile\android
   ```

3. **Build & Run:**
   - Click **Run** (▶️) button
   - Select your emulator/device
   - Wait for build to complete

---

## 📝 Important Notes

- **Expo Managed Workflow**: This app uses Expo, which handles most native compilation
- **First Build Time**: 2-5 minutes (downloads dependencies)
- **Hot Reload**: Changes auto-refresh when you save files
- **Metro Bundler**: Expo's JavaScript bundler will start automatically

---

## 🐛 Troubleshooting

### "No Android connected device found"
→ Start an emulator or connect a physical device

### "SDK location not found"
→ Set `ANDROID_HOME` environment variable:
```powershell
[System.Environment]::SetEnvironmentVariable("ANDROID_HOME", "C:\Users\dell\AppData\Local\Android\Sdk", "User")
```

### Port already in use (5000, 8081)
→ Kill the process or use different port:
```powershell
npm run android -- --port 8082
```

---

## ✅ Next Steps

1. Open Android Studio and start an emulator
2. Run: `npm run android`
3. Wait for app to load (first time takes longer)
4. Test proximity detection features

**Ready to build! 🚀**
