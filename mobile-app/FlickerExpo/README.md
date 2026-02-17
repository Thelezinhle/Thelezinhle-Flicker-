# FlickerSecure Expo App

## Quick Start with Expo Go

### 1. Install Dependencies
```bash
cd mobile-app/FlickerExpo
npm install
```

### 2. Find Your Computer's IP Address
Run in PowerShell:
```bash
ipconfig
```
Look for "IPv4 Address" under your active network adapter (e.g., 192.168.1.x or 10.x.x.x)

### 3. Update API_BASE in App.tsx
Open `App.tsx` and change line 20:
```typescript
const API_BASE = 'http://YOUR_IP_HERE:5000';
```

### 4. Make Sure Backend is Running
```bash
cd backend-api
node simple-server.js
```

### 5. Start Expo
```bash
cd mobile-app/FlickerExpo
npx expo start
```

### 6. Scan QR Code
- Install "Expo Go" app on your phone
- Scan the QR code shown in terminal
- Make sure phone is on same WiFi as computer

## How to Test

### Testing with 2 Phones (Recommended)
1. Phone 1: Open app, select "I'm Sending"
2. Enable GPS on Phone 1
3. Create a delivery
4. Note the Delivery ID and Verification Code

5. Phone 2: Open app, select "I'm Receiving"
6. Enter the Delivery ID
7. Enter the Verification Code
8. Handoff complete!

### Testing with 1 Phone
1. Select "I'm Sending"
2. Create delivery, note the code
3. Exit, select "I'm Receiving"
4. Enter ID and code to verify

## Troubleshooting

### "Network Error"
- Make sure backend is running on port 5000
- Check IP address is correct in App.tsx
- Phone and computer must be on same WiFi

### Location not working
- Make sure to grant location permissions
- GPS works best outdoors
