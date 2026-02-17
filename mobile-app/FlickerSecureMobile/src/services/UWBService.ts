/**
 * UWB Service for React Native - Ultra-Wideband Ranging
 * 
 * Provides UWB ranging functionality for mobile apps:
 * - iOS: Uses Nearby Interaction Framework (iOS 14+, iPhone 11+)
 * - Android: Uses AndroidX UWB API (Android 12+, Pixel 6+, Samsung S21+)
 * 
 * When UWB is unavailable, gracefully falls back to Bluetooth ranging.
 * 
 * Note: Expo managed workflow doesn't support UWB natively.
 * For UWB support, you need either:
 * 1. Expo bare workflow with native modules
 * 2. Plain React Native with native UWB libraries
 * 
 * This service provides a consistent API that works with or without native UWB.
 */

import { Platform, NativeModules, NativeEventEmitter } from 'react-native';

// Try to get native UWB module (will be null in Expo managed workflow)
const NativeUWB = NativeModules.FlickerUWB || NativeModules.UWBModule || null;
const UWBEventEmitter = NativeUWB ? new NativeEventEmitter(NativeUWB) : null;

export interface UWBRangingData {
  distance: number;        // Distance in meters
  azimuth: number | null;  // Horizontal angle in degrees (0° = front)
  elevation: number | null; // Vertical angle in degrees
  accuracy: number;        // Accuracy in meters
  technology: 'uwb';
  timestamp: number;
}

export interface UWBCapabilities {
  available: boolean;
  supportsDistance: boolean;
  supportsAzimuth: boolean;
  supportsElevation: boolean;
  minRange: number;
  maxRange: number;
  accuracyMeters: number;
  reason?: string;
}

export interface UWBSessionInfo {
  sessionId: string;
  targetId: string;
  isActive: boolean;
  startTime: number;
  lastUpdate: number | null;
}

type RangingCallback = (data: UWBRangingData) => void;
type SessionCallback = (event: 'started' | 'stopped' | 'error' | 'peerLost', sessionId: string, error?: string) => void;

class UWBService {
  private static instance: UWBService;
  private isNativeAvailable: boolean = false;
  private isSessionActive: boolean = false;
  private currentTargetId: string | null = null;
  private currentSessionId: string | null = null;
  private rangingCallback: RangingCallback | null = null;
  private sessionCallback: SessionCallback | null = null;
  private eventSubscription: any = null;
  private cachedCapabilities: UWBCapabilities | null = null;

  // For simulation/testing mode
  private simulateUWB: boolean = false;
  private simulatedDistance: number = 5.0;
  private simulationInterval: ReturnType<typeof setInterval> | null = null;

  private constructor() {
    this.checkNativeAvailability();
    console.log('📡 UWBService initialized (React Native)');
  }

  public static getInstance(): UWBService {
    if (!UWBService.instance) {
      UWBService.instance = new UWBService();
    }
    return UWBService.instance;
  }

  /**
   * Check if native UWB module is available
   */
  private async checkNativeAvailability(): Promise<void> {
    try {
      if (NativeUWB && typeof NativeUWB.isAvailable === 'function') {
        this.isNativeAvailable = await NativeUWB.isAvailable();
        console.log(`📡 Native UWB ${this.isNativeAvailable ? 'available' : 'not available'}`);
      } else {
        this.isNativeAvailable = false;
        console.log('📡 Native UWB module not found (Expo managed workflow?)');
      }
    } catch (error) {
      console.warn('⚠️ Error checking UWB availability:', error);
      this.isNativeAvailable = false;
    }
  }

  /**
   * Check if UWB is available on this device
   */
  public async isAvailable(): Promise<boolean> {
    // If simulation mode is enabled, report as available
    if (this.simulateUWB) return true;

    // Try native module
    if (NativeUWB) {
      try {
        const available = await NativeUWB.isAvailable();
        this.isNativeAvailable = available;
        return available;
      } catch (error) {
        console.warn('Error checking UWB availability:', error);
      }
    }

    // Fallback: Check platform capabilities
    const platformSupported = this.isPlatformSupported();
    return platformSupported && this.isNativeAvailable;
  }

  /**
   * Check if platform theoretically supports UWB
   */
  private isPlatformSupported(): boolean {
    if (Platform.OS === 'ios') {
      // iOS 14+ on iPhone 11 and later
      const majorVersion = parseInt(Platform.Version as string, 10);
      return majorVersion >= 14;
    } else if (Platform.OS === 'android') {
      // Android 12 (API 31) and later
      return Platform.Version >= 31;
    }
    return false;
  }

  /**
   * Get device UWB capabilities
   */
  public async getCapabilities(): Promise<UWBCapabilities> {
    if (this.cachedCapabilities) {
      return this.cachedCapabilities;
    }

    const available = await this.isAvailable();

    if (!available) {
      this.cachedCapabilities = {
        available: false,
        supportsDistance: false,
        supportsAzimuth: false,
        supportsElevation: false,
        minRange: 0,
        maxRange: 0,
        accuracyMeters: 0,
        reason: this.getUnavailableReason()
      };
      return this.cachedCapabilities;
    }

    // Try to get capabilities from native module
    if (NativeUWB?.getCapabilities) {
      try {
        const nativeCaps = await NativeUWB.getCapabilities();
        this.cachedCapabilities = {
          available: true,
          supportsDistance: nativeCaps.supportsDistance ?? true,
          supportsAzimuth: nativeCaps.supportsAzimuth ?? Platform.OS === 'ios',
          supportsElevation: nativeCaps.supportsElevation ?? Platform.OS === 'ios',
          minRange: nativeCaps.minRange ?? 0.0,
          maxRange: nativeCaps.maxRange ?? 50.0,
          accuracyMeters: nativeCaps.accuracyMeters ?? 0.1
        };
        return this.cachedCapabilities;
      } catch (error) {
        console.warn('Error getting UWB capabilities:', error);
      }
    }

    // Default capabilities for UWB
    this.cachedCapabilities = {
      available: true,
      supportsDistance: true,
      supportsAzimuth: Platform.OS === 'ios', // iOS provides angle info
      supportsElevation: Platform.OS === 'ios',
      minRange: 0.0,
      maxRange: 50.0,
      accuracyMeters: 0.1 // 10cm typical accuracy
    };

    return this.cachedCapabilities;
  }

  /**
   * Get reason why UWB is unavailable
   */
  private getUnavailableReason(): string {
    if (Platform.OS === 'ios') {
      const version = parseInt(Platform.Version as string, 10);
      if (version < 14) {
        return 'iOS 14 or later required for UWB';
      }
      return 'UWB hardware not available (requires iPhone 11 or later)';
    } else if (Platform.OS === 'android') {
      if (Platform.Version < 31) {
        return 'Android 12 (API 31) or later required for UWB';
      }
      return 'UWB hardware not available on this device';
    }
    return 'UWB not supported on this platform';
  }

  /**
   * Start UWB ranging session with target device
   * 
   * @param targetId - Target device identifier or discovery token
   * @param callback - Callback for ranging updates
   * @param sessionCallback - Callback for session events
   */
  public async startSession(
    targetId: string,
    callback: RangingCallback,
    sessionCallback?: SessionCallback
  ): Promise<boolean> {
    console.log(`📡 Starting UWB session with target: ${targetId}`);

    // Check if simulation mode
    if (this.simulateUWB) {
      return this.startSimulatedSession(targetId, callback, sessionCallback);
    }

    // Check availability
    const available = await this.isAvailable();
    if (!available) {
      console.warn('⚠️ UWB not available on this device');
      sessionCallback?.('error', '', this.getUnavailableReason());
      return false;
    }

    // Stop any existing session
    if (this.isSessionActive) {
      await this.stopSession();
    }

    try {
      // Start native session
      if (NativeUWB?.startSession) {
        const sessionId = await NativeUWB.startSession(targetId);
        
        if (!sessionId) {
          throw new Error('Failed to start UWB session');
        }

        this.currentSessionId = sessionId;
        this.currentTargetId = targetId;
        this.rangingCallback = callback;
        this.sessionCallback = sessionCallback || null;
        this.isSessionActive = true;

        // Subscribe to distance updates
        this.subscribeToUpdates();

        console.log(`✅ UWB session started: ${sessionId}`);
        sessionCallback?.('started', sessionId);
        return true;
      }

      throw new Error('Native UWB module not available');
    } catch (error: any) {
      console.error('❌ Failed to start UWB session:', error);
      sessionCallback?.('error', '', error.message || 'Unknown error');
      return false;
    }
  }

  /**
   * Subscribe to native UWB distance updates
   */
  private subscribeToUpdates(): void {
    if (!UWBEventEmitter) return;

    // Subscribe to distance updates
    this.eventSubscription = UWBEventEmitter.addListener(
      'onUWBDistanceUpdate',
      (data: any) => {
        if (!this.rangingCallback) return;

        const rangingData: UWBRangingData = {
          distance: data.distance,
          azimuth: data.azimuth ?? null,
          elevation: data.elevation ?? null,
          accuracy: data.accuracy ?? 0.1,
          technology: 'uwb',
          timestamp: data.timestamp ?? Date.now()
        };

        this.rangingCallback(rangingData);
      }
    );

    // Subscribe to session events
    UWBEventEmitter.addListener('onUWBSessionEvent', (event: any) => {
      if (!this.sessionCallback || !this.currentSessionId) return;

      switch (event.type) {
        case 'peerLost':
          this.sessionCallback('peerLost', this.currentSessionId);
          break;
        case 'error':
          this.sessionCallback('error', this.currentSessionId, event.message);
          break;
        case 'stopped':
          this.sessionCallback('stopped', this.currentSessionId);
          break;
      }
    });
  }

  /**
   * Start simulated UWB session for testing
   */
  private startSimulatedSession(
    targetId: string,
    callback: RangingCallback,
    sessionCallback?: SessionCallback
  ): boolean {
    if (this.isSessionActive) {
      this.stopSession();
    }

    this.currentSessionId = `sim-${Date.now()}`;
    this.currentTargetId = targetId;
    this.rangingCallback = callback;
    this.sessionCallback = sessionCallback || null;
    this.isSessionActive = true;

    console.log(`🎮 Starting SIMULATED UWB session: ${this.currentSessionId}`);

    // Simulate UWB updates at 10Hz
    this.simulationInterval = setInterval(() => {
      if (!this.isSessionActive || !this.rangingCallback) return;

      // Add some random variation
      this.simulatedDistance += (Math.random() - 0.5) * 0.1;
      this.simulatedDistance = Math.max(0.1, Math.min(50, this.simulatedDistance));

      const data: UWBRangingData = {
        distance: this.simulatedDistance,
        azimuth: Math.sin(Date.now() / 1000) * 45, // Oscillating angle
        elevation: (Math.random() - 0.5) * 20,
        accuracy: 0.1 + Math.random() * 0.05,
        technology: 'uwb',
        timestamp: Date.now()
      };

      this.rangingCallback(data);
    }, 100);

    sessionCallback?.('started', this.currentSessionId);
    return true;
  }

  /**
   * Stop current UWB session
   */
  public async stopSession(): Promise<void> {
    // Stop simulation if active
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }

    // Unsubscribe from events
    if (this.eventSubscription) {
      this.eventSubscription.remove();
      this.eventSubscription = null;
    }

    // Stop native session
    if (NativeUWB?.stopSession && this.currentSessionId) {
      try {
        await NativeUWB.stopSession(this.currentSessionId);
      } catch (error) {
        console.warn('Error stopping native UWB session:', error);
      }
    }

    if (this.sessionCallback && this.currentSessionId) {
      this.sessionCallback('stopped', this.currentSessionId);
    }

    this.isSessionActive = false;
    this.currentTargetId = null;
    this.currentSessionId = null;
    this.rangingCallback = null;

    console.log('🛑 UWB session stopped');
  }

  /**
   * Get current distance to target
   */
  public async getDistance(): Promise<number | null> {
    if (!this.isSessionActive) return null;

    if (this.simulateUWB) {
      return this.simulatedDistance;
    }

    if (NativeUWB?.getDistance && this.currentSessionId) {
      try {
        return await NativeUWB.getDistance(this.currentSessionId);
      } catch (error) {
        console.warn('Error getting UWB distance:', error);
      }
    }

    return null;
  }

  /**
   * Get session info
   */
  public getSessionInfo(): UWBSessionInfo | null {
    if (!this.isSessionActive || !this.currentSessionId || !this.currentTargetId) {
      return null;
    }

    return {
      sessionId: this.currentSessionId,
      targetId: this.currentTargetId,
      isActive: this.isSessionActive,
      startTime: parseInt(this.currentSessionId.replace('sim-', '')) || Date.now(),
      lastUpdate: Date.now()
    };
  }

  /**
   * Enable simulation mode for testing
   */
  public enableSimulation(initialDistance: number = 5.0): void {
    this.simulateUWB = true;
    this.simulatedDistance = initialDistance;
    this.cachedCapabilities = null; // Reset capabilities
    console.log(`🎮 UWB simulation enabled (initial: ${initialDistance}m)`);
  }

  /**
   * Disable simulation mode
   */
  public disableSimulation(): void {
    this.simulateUWB = false;
    this.cachedCapabilities = null;
    if (this.isSessionActive) {
      this.stopSession();
    }
    console.log('🎮 UWB simulation disabled');
  }

  /**
   * Set simulated distance
   */
  public setSimulatedDistance(distance: number): void {
    if (this.simulateUWB) {
      this.simulatedDistance = Math.max(0.1, Math.min(50, distance));
    }
  }

  /**
   * Check if in simulation mode
   */
  public isSimulating(): boolean {
    return this.simulateUWB;
  }

  /**
   * Clean up resources
   */
  public dispose(): void {
    this.stopSession();
    console.log('📡 UWBService disposed');
  }
}

// Export singleton instance
export const uwbService = UWBService.getInstance();
export default UWBService;
