/**
 * UWB Service for React Native/Expo
 * Ultra-Wideband provides centimeter-accurate distance measurement (0-50m range)
 * 
 * IMPORTANT: Real UWB requires native modules. This service:
 * 1. Tries to use native UWB module if installed (NativeUWBBridge)
 * 2. Falls back to simulation mode if native not available
 * 3. Sends ranging data to the backend when UWB is available
 * 
 * UWB Hardware Support:
 * - iOS: iPhone 11, 12, 13, 14, 15+ (U1/U2 chip)
 * - Android: Pixel 6+, Samsung S21+, S22+, S23+ (Android 12+)
 * 
 * To enable REAL UWB:
 * 1. npx expo prebuild
 * 2. Add NearbyInteraction (iOS) or UWB (Android) native modules
 * 3. Rebuild with: npx expo run:ios or run:android
 */

import { Platform } from 'react-native';
import * as Device from 'expo-device';
import nativeUWBBridge, { hasNativeUWB, NativeUWBDevice } from './NativeUWBBridge';

// API Configuration
import { API_BASE } from '../config';

// ============== Types ==============

export interface UWBCapabilities {
  available: boolean;
  supportsDistance: boolean;
  supportsAzimuth: boolean;    // Horizontal direction
  supportsElevation: boolean;  // Vertical direction
  minRange: number;            // meters
  maxRange: number;            // meters
  accuracyMeters: number;
  hardwareVersion: string;
  reason?: string;             // Why UWB is not available
}

export interface UWBRangingData {
  targetDeviceId: string;
  sourceDeviceId: string;
  distance: number;        // meters
  azimuth: number | null;  // degrees
  elevation: number | null;
  accuracy: number;
  timestamp: Date;
}

export interface UWBSession {
  sessionId: string;
  deliveryId: string;
  status: 'pending' | 'active' | 'ranging' | 'completed' | 'failed';
  targetDeviceId: string;
  lastDistance: number | null;
  lastAzimuth: number | null;
}

export type UWBStatus = {
  isSupported: boolean;
  isEnabled: boolean;
  hasPermissions: boolean;
  capabilities: UWBCapabilities;
};

// ============== Device Detection ==============

/**
 * List of devices known to have UWB hardware
 */
const UWB_SUPPORTED_IOS_MODELS = [
  'iPhone12', 'iPhone13', 'iPhone14', 'iPhone15', 'iPhone16', 'iPhone17',
  'iPhone SE (3rd generation)',
];

const UWB_SUPPORTED_ANDROID_MODELS = [
  'Pixel 6', 'Pixel 6 Pro', 'Pixel 6a',
  'Pixel 7', 'Pixel 7 Pro', 'Pixel 7a',
  'Pixel 8', 'Pixel 8 Pro', 'Pixel 8a',
  'Galaxy S21', 'Galaxy S21+', 'Galaxy S21 Ultra',
  'Galaxy S22', 'Galaxy S22+', 'Galaxy S22 Ultra',
  'Galaxy S23', 'Galaxy S23+', 'Galaxy S23 Ultra',
  'Galaxy S24', 'Galaxy S24+', 'Galaxy S24 Ultra',
  'Galaxy Z Fold', 'Galaxy Z Flip',
  'Galaxy Note20', 'Galaxy Note20 Ultra',
];

// ============== UWB Service Class ==============

class UWBService {
  private deviceId: string;
  private capabilities: UWBCapabilities | null = null;
  private activeSession: UWBSession | null = null;
  private isInitialized: boolean = false;
  private rangingCallback: ((data: UWBRangingData) => void) | null = null;

  // Simulated ranging for demo (when real UWB not available)
  private simulationInterval: NodeJS.Timeout | null = null;
  private useSimulation: boolean = false;

  constructor() {
    this.deviceId = `device-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Initialize UWB service and check capabilities
   */
  async initialize(): Promise<UWBCapabilities> {
    console.log('📡 UWBService: Initializing...');

    const capabilities = await this.checkCapabilities();
    this.capabilities = capabilities;
    this.isInitialized = true;

    // Register device with backend
    if (capabilities.available) {
      await this.registerWithBackend();
    }

    console.log('📡 UWBService: Initialized', capabilities);
    return capabilities;
  }

  /**
   * Check device UWB capabilities
   */
  async checkCapabilities(): Promise<UWBCapabilities> {
    const deviceName = Device.modelName || '';
    const osVersion = Device.osVersion || '';
    const platform = Platform.OS;

    console.log(`📱 Device: ${deviceName}, OS: ${platform} ${osVersion}`);

    // Check iOS
    if (platform === 'ios') {
      const hasUWB = UWB_SUPPORTED_IOS_MODELS.some(model => 
        deviceName.toLowerCase().includes(model.toLowerCase())
      );
      
      // Check iOS version (UWB requires iOS 14+)
      const iosVersion = parseFloat(osVersion);
      const hasValidOS = iosVersion >= 14;

      if (hasUWB && hasValidOS) {
        return {
          available: true,
          supportsDistance: true,
          supportsAzimuth: true,
          supportsElevation: true,
          minRange: 0,
          maxRange: 50,
          accuracyMeters: 0.1, // 10cm accuracy
          hardwareVersion: 'U1/U2 Chip'
        };
      }
      
      return {
        available: false,
        supportsDistance: false,
        supportsAzimuth: false,
        supportsElevation: false,
        minRange: 0,
        maxRange: 0,
        accuracyMeters: 0,
        hardwareVersion: 'none',
        reason: hasValidOS ? 'Device does not have UWB chip (requires iPhone 11+)' : 'iOS 14+ required'
      };
    }

    // Check Android
    if (platform === 'android') {
      const hasUWB = UWB_SUPPORTED_ANDROID_MODELS.some(model =>
        deviceName.toLowerCase().includes(model.toLowerCase())
      );
      
      // Check Android version (UWB requires Android 12+)
      const androidVersion = parseInt(osVersion);
      const hasValidOS = androidVersion >= 12;

      if (hasUWB && hasValidOS) {
        return {
          available: true,
          supportsDistance: true,
          supportsAzimuth: true,
          supportsElevation: false, // Most Android devices don't support elevation
          minRange: 0,
          maxRange: 50,
          accuracyMeters: 0.15, // 15cm accuracy on Android
          hardwareVersion: 'Android UWB'
        };
      }

      return {
        available: false,
        supportsDistance: false,
        supportsAzimuth: false,
        supportsElevation: false,
        minRange: 0,
        maxRange: 0,
        accuracyMeters: 0,
        hardwareVersion: 'none',
        reason: hasValidOS ? 'Device does not have UWB chip' : 'Android 12+ required'
      };
    }

    // Web or other platform
    return {
      available: false,
      supportsDistance: false,
      supportsAzimuth: false,
      supportsElevation: false,
      minRange: 0,
      maxRange: 0,
      accuracyMeters: 0,
      hardwareVersion: 'none',
      reason: 'UWB is only available on native mobile apps (iOS/Android)'
    };
  }

  /**
   * Get current UWB status
   */
  async getStatus(): Promise<UWBStatus> {
    if (!this.capabilities) {
      await this.initialize();
    }

    return {
      isSupported: this.capabilities?.available || false,
      isEnabled: this.isInitialized,
      hasPermissions: true, // Would need to check actual permissions
      capabilities: this.capabilities!
    };
  }

  /**
   * Register device with backend
   */
  private async registerWithBackend(): Promise<void> {
    try {
      const response = await fetch(`${API_BASE}/uwb/device/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: this.deviceId,
          capabilities: this.capabilities
        })
      });

      const data = await response.json();
      if (data.success) {
        console.log('📡 UWB device registered with backend');
      }
    } catch (error) {
      console.error('Failed to register UWB device:', error);
    }
  }

  /**
   * Start a UWB ranging session
   */
  async startSession(
    deliveryId: string, 
    targetDeviceId: string,
    onRangingUpdate?: (data: UWBRangingData) => void
  ): Promise<UWBSession | null> {
    if (!this.capabilities?.available) {
      console.warn('📡 UWB not available, starting simulation mode');
      this.useSimulation = true;
    }

    this.rangingCallback = onRangingUpdate || null;

    try {
      // Create session on backend
      const response = await fetch(`${API_BASE}/uwb/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deliveryId,
          courierDeviceId: this.deviceId,
          recipientDeviceId: targetDeviceId
        })
      });

      const data = await response.json();
      
      if (data.success) {
        this.activeSession = {
          sessionId: data.data.sessionId,
          deliveryId,
          status: 'active',
          targetDeviceId,
          lastDistance: null,
          lastAzimuth: null
        };

        // Start the session on backend
        await fetch(`${API_BASE}/uwb/session/${data.data.sessionId}/start`, {
          method: 'POST'
        });

        // Start ranging (real or simulated)
        if (this.useSimulation) {
          this.startSimulatedRanging(targetDeviceId);
        } else {
          this.startRealRanging(targetDeviceId);
        }

        console.log('📡 UWB session started:', data.data.sessionId);
        return this.activeSession;
      }
    } catch (error) {
      console.error('Failed to start UWB session:', error);
    }

    return null;
  }

  /**
   * Start real UWB ranging (requires native module)
   * Tries native bridge first, falls back to simulation if not available
   */
  private async startRealRanging(targetDeviceId: string): Promise<void> {
    console.log('📡 Starting real UWB ranging to:', targetDeviceId);
    
    // Try native UWB bridge first
    if (hasNativeUWB()) {
      console.log('📡 Native UWB module detected, starting native session');
      
      const sessionId = await nativeUWBBridge.startSession(targetDeviceId, {
        onDistanceUpdated: async (device: NativeUWBDevice) => {
          const rangingData: UWBRangingData = {
            targetDeviceId,
            sourceDeviceId: this.deviceId,
            distance: device.distance,
            azimuth: device.direction,
            elevation: device.elevation,
            accuracy: 0.1, // 10cm accuracy for real UWB
            timestamp: new Date()
          };

          // Update active session
          if (this.activeSession) {
            this.activeSession.lastDistance = rangingData.distance;
            this.activeSession.lastAzimuth = rangingData.azimuth;
            this.activeSession.status = 'ranging';
          }

          // Send to callback
          if (this.rangingCallback) {
            this.rangingCallback(rangingData);
          }

          // Send to backend
          await this.sendRangingData(rangingData);
        },
        onSessionError: (error: string) => {
          console.error('📡 Native UWB error:', error);
          // Fall back to simulation on error
          this.startSimulatedRanging(targetDeviceId);
        },
        onSessionEnded: () => {
          console.log('📡 Native UWB session ended');
          this.activeSession = null;
        }
      });

      if (sessionId) {
        console.log('📡 Native UWB session started:', sessionId);
        return;
      }
    }
    
    // Fall back to simulation if native not available
    console.warn('📡 Native UWB module not available, using simulation');
    this.startSimulatedRanging(targetDeviceId);
  }

  /**
   * Start simulated UWB ranging (for demo/testing)
   * Simulates a person walking towards the customer
   */
  private startSimulatedRanging(targetDeviceId: string): void {
    console.log('📡 Starting simulated UWB ranging');
    
    let simulatedDistance = 30; // Start 30 meters away
    let simulatedAzimuth = 45;  // 45 degrees

    this.simulationInterval = setInterval(async () => {
      // Simulate walking towards target (random movement)
      simulatedDistance = Math.max(0.5, simulatedDistance - (Math.random() * 2 + 0.5));
      simulatedAzimuth = (simulatedAzimuth + (Math.random() * 10 - 5) + 360) % 360;

      const rangingData: UWBRangingData = {
        targetDeviceId,
        sourceDeviceId: this.deviceId,
        distance: parseFloat(simulatedDistance.toFixed(2)),
        azimuth: parseFloat(simulatedAzimuth.toFixed(1)),
        elevation: null,
        accuracy: 0.1,
        timestamp: new Date()
      };

      // Update active session
      if (this.activeSession) {
        this.activeSession.lastDistance = rangingData.distance;
        this.activeSession.lastAzimuth = rangingData.azimuth;
        this.activeSession.status = 'ranging';
      }

      // Send to callback
      if (this.rangingCallback) {
        this.rangingCallback(rangingData);
      }

      // Send to backend
      await this.sendRangingData(rangingData);

      // Stop if arrived
      if (simulatedDistance <= 1) {
        console.log('📡 Simulated arrival!');
        this.stopSession();
      }
    }, 1000); // Update every second
  }

  /**
   * Send ranging data to backend
   */
  private async sendRangingData(data: UWBRangingData): Promise<void> {
    try {
      await fetch(`${API_BASE}/uwb/ranging`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    } catch (error) {
      console.error('Failed to send UWB ranging data:', error);
    }
  }

  /**
   * Get current distance to target
   */
  getDistance(): number | null {
    return this.activeSession?.lastDistance || null;
  }

  /**
   * Get current direction to target
   */
  getDirection(): number | null {
    return this.activeSession?.lastAzimuth || null;
  }

  /**
   * Check if within close proximity (default 1 meter)
   */
  isInCloseProximity(thresholdMeters: number = 1): boolean {
    const distance = this.getDistance();
    return distance !== null && distance <= thresholdMeters;
  }

  /**
   * Stop the current session
   */
  async stopSession(): Promise<void> {
    // Stop simulation
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }

    // Stop native UWB session if running
    if (hasNativeUWB()) {
      await nativeUWBBridge.stopSession();
    }

    // Stop backend session
    if (this.activeSession) {
      try {
        await fetch(`${API_BASE}/uwb/session/${this.activeSession.sessionId}/stop`, {
          method: 'POST'
        });
      } catch (error) {
        console.error('Failed to stop UWB session:', error);
      }
    }

    this.activeSession = null;
    this.rangingCallback = null;
    this.useSimulation = false;

    console.log('📡 UWB session stopped');
  }

  /**
   * Get device ID
   */
  getDeviceId(): string {
    return this.deviceId;
  }

  /**
   * Check if UWB is available
   */
  isAvailable(): boolean {
    return this.capabilities?.available || false;
  }

  /**
   * Check if session is active
   */
  isSessionActive(): boolean {
    return this.activeSession !== null && this.activeSession.status === 'ranging';
  }
}

// Export singleton instance
const uwbService = new UWBService();
export default uwbService;
