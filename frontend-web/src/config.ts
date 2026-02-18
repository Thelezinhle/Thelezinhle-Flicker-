// FlickerSecure Frontend Web Configuration
// =========================================
// Uses Vite environment variables with fallbacks

// Detect production environment (Render uses onrender.com domain)
const isProduction = typeof window !== 'undefined' && window.location.hostname.includes('onrender.com');

// Use production API URL when deployed on Render, otherwise use env var or localhost
export const API_URL = isProduction 
  ? 'https://flicker-secure-api.onrender.com'
  : (import.meta.env.VITE_API_URL || 'http://localhost:5000');

export const WS_URL = isProduction
  ? 'wss://flicker-secure-api.onrender.com'
  : (import.meta.env.VITE_WS_URL || 'ws://localhost:5000');

// Full API path
export const API_BASE = `${API_URL}/api`;

// For Socket.IO (uses HTTP/HTTPS, not WS protocol)
export const SOCKET_URL = API_URL;

// Log current config in development
if (import.meta.env.DEV) {
  console.log('🌐 API Config:', { API_URL, WS_URL, API_BASE });
}

export default {
  API_URL,
  WS_URL,
  API_BASE,
  SOCKET_URL,
};
