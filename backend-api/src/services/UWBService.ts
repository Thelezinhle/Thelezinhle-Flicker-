/**
 * UWB Service for Backend - Ultra-Wideband Ranging
 * Provides centimeter-accurate distance measurement (0-50m range)
 * 
 * UWB Support:
 * - iOS: iPhone 11+ with Nearby Interaction Framework
 * - Android: Android 12+ on Pixel 6+, Samsung S21+, etc.
 * 
 * This service manages UWB ranging data received from mobile clients
 */

import { EventEmitter } from 'events';

// ============== Types ==============

export interface UWBRangingData {
  targetDeviceId: string;
  sourceDeviceId: string;
  distance: number;        // Distance in meters (cm accuracy)
  azimuth: number | null;  // Horizontal angle in degrees (0° = North)
  elevation: number | null; // Vertical angle in degrees
  accuracy: number;        // Accuracy in meters (typically 0.1-0.3m)
  technology: 'uwb';
  timestamp: Date;
}

export interface UWBSession {
  sessionId: string;
  deliveryId: string;
  courierDeviceId: string;
  recipientDeviceId: string;
  status: 'pending' | 'active' | 'ranging' | 'completed' | 'failed';
  startTime: Date;
  lastUpdate: Date;
  rangingHistory: UWBRangingData[];
  supportsAzimuth: boolean;
  supportsElevation: boolean;
}

export interface UWBCapabilities {
  available: boolean;
  supportsDistance: boolean;
  supportsAzimuth: boolean;
  supportsElevation: boolean;
  minRange: number;        // meters
  maxRange: number;        // meters
  accuracyMeters: number;
  hardwareVersion: string;
}

export interface UWBDeviceInfo {
  deviceId: string;
  capabilities: UWBCapabilities;
  lastSeen: Date;
  currentDistance: number | null;
  currentAzimuth: number | null;
  currentElevation: number | null;
}

export interface UWBHealthStatus {
  isAvailable: boolean;
  activeSessions: number;
  devicesFound: number;
  deviceDetails: Map<string, UWBDeviceInfo>;
  lastHealthCheck: Date;
}

// ============== Service ==============

class UWBService extends EventEmitter {
  private activeSessions: Map<string, UWBSession> = new Map();
  private deviceInfo: Map<string, UWBDeviceInfo> = new Map();
  private deviceDistances: Map<string, number> = new Map();
  private isInitialized: boolean = false;

  constructor() {
    super();
    this.initialize();
  }

  /**
   * Initialize UWB service
   */
  private initialize(): void {
    console.log('📡 UWBService initialized');
    this.isInitialized = true;
    this.emit('initialized');
  }

  /**
   * Check if service is available
   */
  public isAvailable(): boolean {
    return this.isInitialized;
  }

  /**
   * Register device capabilities (reported by mobile client)
   */
  public registerDevice(deviceId: string, capabilities: UWBCapabilities): UWBDeviceInfo {
    const info: UWBDeviceInfo = {
      deviceId,
      capabilities,
      lastSeen: new Date(),
      currentDistance: null,
      currentAzimuth: null,
      currentElevation: null
    };

    this.deviceInfo.set(deviceId, info);
    console.log(`📱 UWB device registered: ${deviceId}, capabilities:`, capabilities);
    
    this.emit('device_registered', info);
    return info;
  }

  /**
   * Create a new UWB ranging session
   */
  public createSession(
    deliveryId: string,
    courierDeviceId: string,
    recipientDeviceId: string
  ): UWBSession {
    const sessionId = `uwb-session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Check device capabilities
    const courierInfo = this.deviceInfo.get(courierDeviceId);
    const recipientInfo = this.deviceInfo.get(recipientDeviceId);

    const supportsAzimuth = 
      (courierInfo?.capabilities.supportsAzimuth ?? false) &&
      (recipientInfo?.capabilities.supportsAzimuth ?? false);
    
    const supportsElevation =
      (courierInfo?.capabilities.supportsElevation ?? false) &&
      (recipientInfo?.capabilities.supportsElevation ?? false);

    const session: UWBSession = {
      sessionId,
      deliveryId,
      courierDeviceId,
      recipientDeviceId,
      status: 'pending',
      startTime: new Date(),
      lastUpdate: new Date(),
      rangingHistory: [],
      supportsAzimuth,
      supportsElevation
    };

    this.activeSessions.set(sessionId, session);
    console.log(`📍 Created UWB session: ${sessionId} for delivery: ${deliveryId}`);
    
    this.emit('session_created', session);
    return session;
  }

  /**
   * Start UWB ranging session
   */
  public async startSession(sessionId: string): Promise<boolean> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      console.error(`❌ UWB Session not found: ${sessionId}`);
      return false;
    }

    session.status = 'active';
    session.lastUpdate = new Date();

    console.log(`📡 UWB session started: ${sessionId}`);
    this.emit('session_started', { sessionId });
    
    return true;
  }

  /**
   * Process ranging data from mobile client
   */
  public processRangingData(data: UWBRangingData): void {
    const { targetDeviceId, distance, azimuth, elevation } = data;

    // Store distance
    this.deviceDistances.set(targetDeviceId, distance);

    // Update device info
    const deviceInfo = this.deviceInfo.get(targetDeviceId);
    if (deviceInfo) {
      deviceInfo.currentDistance = distance;
      deviceInfo.currentAzimuth = azimuth;
      deviceInfo.currentElevation = elevation;
      deviceInfo.lastSeen = new Date();
    }

    // Find and update active session
    for (const [_, session] of this.activeSessions) {
      if (session.recipientDeviceId === targetDeviceId ||
          session.courierDeviceId === targetDeviceId) {
        session.rangingHistory.push(data);
        session.lastUpdate = new Date();
        session.status = 'ranging';

        // Keep only last 100 readings
        if (session.rangingHistory.length > 100) {
          session.rangingHistory = session.rangingHistory.slice(-100);
        }
      }
    }

    console.log(
      `📡 UWB: ${targetDeviceId} - ` +
      `Distance: ${distance.toFixed(2)}m, ` +
      `Azimuth: ${azimuth?.toFixed(1) ?? 'N/A'}°, ` +
      `Elevation: ${elevation?.toFixed(1) ?? 'N/A'}°`
    );

    this.emit('ranging_update', data);
  }

  /**
   * Get current distance to target device
   */
  public getDistance(targetDeviceId: string): number | null {
    return this.deviceDistances.get(targetDeviceId) || null;
  }

  /**
   * Get device direction (azimuth and elevation)
   */
  public getDirection(targetDeviceId: string): { azimuth: number | null; elevation: number | null } {
    const info = this.deviceInfo.get(targetDeviceId);
    if (!info) {
      return { azimuth: null, elevation: null };
    }
    return {
      azimuth: info.currentAzimuth,
      elevation: info.currentElevation
    };
  }

  /**
   * Get session by ID
   */
  public getSession(sessionId: string): UWBSession | null {
    return this.activeSessions.get(sessionId) || null;
  }

  /**
   * Get sessions for a delivery
   */
  public getSessionsForDelivery(deliveryId: string): UWBSession[] {
    return Array.from(this.activeSessions.values())
      .filter(session => session.deliveryId === deliveryId);
  }

  /**
   * Get average distance over recent readings
   */
  public getAverageDistance(sessionId: string, windowSize: number = 5): number | null {
    const session = this.activeSessions.get(sessionId);
    if (!session || session.rangingHistory.length === 0) {
      return null;
    }

    const recentReadings = session.rangingHistory.slice(-windowSize);
    const sum = recentReadings.reduce((acc, r) => acc + r.distance, 0);
    return sum / recentReadings.length;
  }

  /**
   * Check if devices are in close proximity (within threshold)
   */
  public isInCloseProximity(sessionId: string, thresholdMeters: number = 1): boolean {
    const avgDistance = this.getAverageDistance(sessionId);
    return avgDistance !== null && avgDistance <= thresholdMeters;
  }

  /**
   * Stop UWB session
   */
  public async stopSession(sessionId: string): Promise<boolean> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return false;
    }

    session.status = 'completed';
    session.lastUpdate = new Date();

    // Clear device data
    this.deviceDistances.delete(session.recipientDeviceId);
    this.deviceDistances.delete(session.courierDeviceId);

    console.log(`🛑 UWB session stopped: ${sessionId}`);
    this.emit('session_stopped', { sessionId });

    return true;
  }

  /**
   * Get health status
   */
  public getHealthStatus(): UWBHealthStatus {
    return {
      isAvailable: this.isInitialized,
      activeSessions: this.activeSessions.size,
      devicesFound: this.deviceInfo.size,
      deviceDetails: this.deviceInfo,
      lastHealthCheck: new Date()
    };
  }

  /**
   * Get device info
   */
  public getDeviceInfo(deviceId: string): UWBDeviceInfo | null {
    return this.deviceInfo.get(deviceId) || null;
  }

  /**
   * Get all registered devices
   */
  public getAllDevices(): UWBDeviceInfo[] {
    return Array.from(this.deviceInfo.values());
  }

  /**
   * Dispose resources
   */
  public dispose(): void {
    this.activeSessions.clear();
    this.deviceInfo.clear();
    this.deviceDistances.clear();
    this.isInitialized = false;
    console.log('📡 UWBService disposed');
  }
}

// Export singleton instance
export const uwbService = new UWBService();
export default UWBService;
