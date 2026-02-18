# UWB Setup Guide for FlickerSecure

This guide explains how to enable real UWB (Ultra-Wideband) functionality on iOS devices.

## Requirements

- **iPhone 11 or later** (has U1/U2 UWB chip)
- **iOS 14.0 or later**
- **Mac with Xcode** (for iOS development)
- **Apple Developer Account** (for device provisioning)

## Current Status

| Mode | Status | Notes |
|------|--------|-------|
| **Simulation** | ✅ Working | Always available, simulates UWB for testing |
| **Real UWB** | ⚠️ Needs Build | Requires Expo Development Build |

## How It Works

1. The app first checks if native UWB module is installed
2. If YES → Uses real iPhone UWB hardware
3. If NO → Falls back to simulation mode (won't crash)

## Setup Instructions

### Step 1: Install Dependencies (Already Done)
```bash
cd mobile-app/FlickerExpo
npm install expo-dev-client --legacy-peer-deps
```

### Step 2: Generate Native Project
```bash
npx expo prebuild --platform ios
```

This creates an `ios` folder with the native Xcode project.

### Step 3: Add Native UWB Module
After prebuild, copy the native module files:
```bash
cp native-modules/ios/NearbyInteraction.swift ios/FlickerSecure/
cp native-modules/ios/NearbyInteraction.m ios/FlickerSecure/
```

### Step 4: Build and Run on iPhone
```bash
npx expo run:ios --device
```

Select your iPhone when prompted. The app will be installed with real UWB support.

## Testing UWB

1. Open the app on **two iPhones** (both must have UWB)
2. One device: Create a delivery as sender
3. Other device: Join as receiver
4. Tap "📡 UWB Precision Find" button
5. Walk around - you should see:
   - Distance in centimeters
   - Direction arrow pointing to other device

## Troubleshooting

### "UWB not available" message
- Device doesn't have UWB hardware (needs iPhone 11+)
- iOS version too old (needs iOS 14+)

### "Native module not found"
- Need to run `npx expo prebuild` first
- Need to copy native module files
- Need to rebuild with `npx expo run:ios`

### Direction not showing
- Direction requires the devices to be within line-of-sight
- Some phone cases can interfere with UWB signal

## Files Overview

```
FlickerExpo/
├── services/
│   ├── UWBService.ts          # Main UWB service (tries native, falls back to simulation)
│   └── NativeUWBBridge.ts     # Safe wrapper for native modules
├── screens/
│   └── UWBScanScreen.tsx      # UI for UWB scanning
├── plugins/
│   └── withUWB.js             # Expo config plugin for UWB entitlements
└── native-modules/
    └── ios/
        ├── NearbyInteraction.swift   # iOS native UWB module
        └── NearbyInteraction.m       # Objective-C bridge
```

## Android UWB (Future)

Android UWB support requires:
- Pixel 6+ or Samsung S21+ with UWB hardware
- Android 12 or later
- Additional native Kotlin module

The architecture is ready - just need to add:
- `native-modules/android/AndroidUWB.kt`
- Update `NativeUWBBridge.ts` to handle Android events
