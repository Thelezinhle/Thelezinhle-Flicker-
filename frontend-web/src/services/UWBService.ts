/**
 * UWB Service - Ultra-Wideband Ranging for Web
 * 
 * IMPORTANT: Web browsers do NOT have UWB API access.
 * This service provides a unified interface but will always fall back
 * to Bluetooth + Audio ranging on web platforms.
 * 
 * For native UWB support:
 * - iOS: Requires Nearby Interaction Framework (iOS 14+, iPhone 11+)
 * - Android: Requires UWB API (Android 12+, Pixel 6+, Samsung S21+)
 * 
 * This service is designed to:
 * 1. Report UWB unavailability on web
 * 2. Provide consistent API for cross-platform code
 * 3. Coordinate with Bluetooth/Audio fallbacks via ProximityManager
 */

export interface UWBRangingData {
  distance: number;        // Distance in meters
  azimuth: number | null;  // Horizontal angle in degrees (0° = North)
  elevation: number | null; // Vertical angle in degrees
  accuracy: number;        // Accuracy in meters (typically 0.1-0.3m for UWB)
  technology: 'uwb';
  timestamp: number;
}

export interface UWBSessionInfo {
  sessionId: string;
  targetId: string;
  isActive: boolean;
  startTime: number;
  lastUpdate: number | null;
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

type RangingCallback = (data: UWBRangingData) => void;
type SessionCallback = (event: 'started' | 'stopped' | 'error', sessionId: string, error?: string) => void;

class UWBService {
  private static instance: UWBService;
  private isSessionActive: boolean = false;
  private currentTargetId: string | null = null;
  private currentSessionId: string | null = null;
  private rangingCallback: RangingCallback | null = null;
  private sessionCallback: SessionCallback | null = null;
  private simulationInterval: number | null = null;

  // For demo/testing purposes - simulated UWB data
  private simulateUWB: boolean = false;
  private simulatedDistance: number = 5.0;

  private constructor() {
    console.log('📡 UWBService initialized');
    console.log('⚠️ Note: Web browsers do not support UWB. Use Bluetooth + Audio fallback.');
  }

  public static getInstance(): UWBService {
    if (!UWBService.instance) {
      UWBService.instance = new UWBService();
    }
    return UWBService.instance;
  }

  /**
   * Check if UWB is available
   * Always returns false on web - UWB requires native platform access
   */
  public async isAvailable(): Promise<boolean> {
    // Web browsers do not have UWB API
    // This would only be true in a native app context
    return false;
  }

  /**
   * Get device UWB capabilities
   */
  public async getCapabilities(): Promise<UWBCapabilities> {
    return {
      available: false,
      supportsDistance: false,
      supportsAzimuth: false,
      supportsElevation: false,
      minRange: 0,
      maxRange: 0,
      accuracyMeters: 0,
      reason: 'UWB is not available in web browsers. Use native mobile app for UWB support.'
    };
  }

  /**
   * Start UWB ranging session with target device
   * On web, this will return false - use Bluetooth/Audio instead
   * 
   * @param targetId - Target device identifier
   * @param callback - Callback for ranging updates
   * @returns true if session started (always false on web)
   */
  public async startSession(
    targetId: string,
    callback: RangingCallback,
    sessionCallback?: SessionCallback
  ): Promise<boolean> {
    console.log(`📡 UWB startSession called for target: ${targetId}`);
    
    // Check if we're in simulation mode (for testing)
    if (this.simulateUWB) {
      return this.startSimulatedSession(targetId, callback, sessionCallback);
    }

    // UWB not available on web
    console.warn('⚠️ UWB not available on web platform');
    console.log('💡 Recommendation: Use BluetoothService + AudioRangingService for similar functionality');
    
    if (sessionCallback) {
      sessionCallback('error', '', 'UWB not available on web platform');
    }
    
    return false;
  }

  /**
   * Start a simulated UWB session (for testing/demo purposes)
   */
  private startSimulatedSession(
    targetId: string,
    callback: RangingCallback,
    sessionCallback?: SessionCallback
  ): boolean {
    if (this.isSessionActive) {
      this.stopSession();
    }

    this.currentTargetId = targetId;
    this.currentSessionId = `sim-${Date.now()}`;
    this.rangingCallback = callback;
    this.sessionCallback = sessionCallback || null;
    this.isSessionActive = true;

    console.log(`🎮 Starting SIMULATED UWB session: ${this.currentSessionId}`);

    // Simulate UWB updates at 10Hz (typical UWB update rate)
    this.simulationInterval = window.setInterval(() => {
      if (!this.isSessionActive || !this.rangingCallback) return;

      // Simulate distance variations
      this.simulatedDistance += (Math.random() - 0.5) * 0.1;
      this.simulatedDistance = Math.max(0.1, Math.min(50, this.simulatedDistance));

      const data: UWBRangingData = {
        distance: this.simulatedDistance,
        azimuth: Math.random() * 360, // Random angle
        elevation: (Math.random() - 0.5) * 30, // ±15 degrees
        accuracy: 0.1 + Math.random() * 0.1, // 10-20cm accuracy
        technology: 'uwb',
        timestamp: Date.now()
      };

      this.rangingCallback(data);
    }, 100);

    if (this.sessionCallback) {
      this.sessionCallback('started', this.currentSessionId);
    }

    return true;
  }

  /**
   * Stop current UWB session
   */
  public async stopSession(): Promise<void> {
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }

    if (this.isSessionActive && this.sessionCallback && this.currentSessionId) {
      this.sessionCallback('stopped', this.currentSessionId);
    }

    this.isSessionActive = false;
    this.currentTargetId = null;
    this.currentSessionId = null;
    this.rangingCallback = null;
    
    console.log('🛑 UWB session stopped');
  }

  /**
   * Get current session info
   */
  public getSessionInfo(): UWBSessionInfo | null {
    if (!this.isSessionActive || !this.currentSessionId || !this.currentTargetId) {
      return null;
    }

    return {
      sessionId: this.currentSessionId,
      targetId: this.currentTargetId,
      isActive: this.isSessionActive,
      startTime: parseInt(this.currentSessionId.split('-')[1]) || Date.now(),
      lastUpdate: Date.now()
    };
  }

  /**
   * Get last known distance to target
   */
  public getLastDistance(): number | null {
    if (this.simulateUWB && this.isSessionActive) {
      return this.simulatedDistance;
    }
    return null;
  }

  /**
   * Enable simulation mode for testing
   * This allows testing UWB-like behavior without actual hardware
   */
  public enableSimulation(initialDistance: number = 5.0): void {
    this.simulateUWB = true;
    this.simulatedDistance = initialDistance;
    console.log(`🎮 UWB simulation enabled (initial distance: ${initialDistance}m)`);
  }

  /**
   * Disable simulation mode
   */
  public disableSimulation(): void {
    this.simulateUWB = false;
    if (this.isSessionActive) {
      this.stopSession();
    }
    console.log('🎮 UWB simulation disabled');
  }

  /**
   * Set simulated distance (for testing)
   */
  public setSimulatedDistance(distance: number): void {
    if (this.simulateUWB) {
      this.simulatedDistance = Math.max(0.1, Math.min(50, distance));
    }
  }

  /**
   * Check if currently in simulation mode
   */
  public isSimulating(): boolean {
    return this.simulateUWB;
  }

  /**
   * Get recommended fallback for web platform
   */
  public getRecommendedFallback(): {
    technology: string;
    range: string;
    accuracy: string;
    instructions: string;
  } {
    return {
      technology: 'Bluetooth RSSI + Audio Ultrasonic',
      range: '0.5 - 50 meters',
      accuracy: '0.5 - 2 meters',
      instructions: `
        For web platforms, use the following combination:
        1. BluetoothService - For 10-50m range (RSSI-based)
        2. AudioRangingService - For 0.5-10m range (ultrasonic ToF)
        
        The ProximityManager automatically coordinates these services
        to provide continuous distance tracking.
      `.trim()
    };
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
