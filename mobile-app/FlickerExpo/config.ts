// FlickerSecure Mobile App Configuration
// ========================================

// Set to 'production' when testing with Render deployment
// Set to 'development' when testing locally
const ENV: 'development' | 'production' = 'production';

// Configuration for different environments
const CONFIG = {
  development: {
    // Local development - use your computer's WiFi IP
    // Run 'ipconfig' on Windows to find your IP
    API_URL: 'http://10.58.81.134:5000',
    WS_URL: 'ws://10.58.81.134:5000',
  },
  production: {
    // Render deployment - real HTTPS endpoints
    API_URL: 'https://flicker-secure-api.onrender.com',
    WS_URL: 'wss://flicker-secure-api.onrender.com',
  },
};

export const API_BASE = CONFIG[ENV].API_URL;
export const WS_BASE = CONFIG[ENV].WS_URL;
export const IS_PRODUCTION = ENV === 'production';

export default {
  API_BASE,
  WS_BASE,
  IS_PRODUCTION,
  ENV,
};
