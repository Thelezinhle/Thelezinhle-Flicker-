/**
 * Bluetooth Service for Backend - Bluetooth 6.0 Channel Sounding & BLE Ranging
 * Provides ranging capabilities for devices without UWB
 * Works with ~80% of Android devices and ~90% of iOS devices
 * 
 * This service manages device proximity data received from mobile clients
 */

import { EventEmitter } from 'events';

// ============== Types ==============

export interface BluetoothDevice {
  deviceId: string;
  deviceName: string;
  rssi: number;
  distance: number;
  signalQuality: number;
  isConnected: boolean;
  lastUpdateTime: Date;
}

export interface BluetoothRangingData {
  targetDeviceId: string;
  sourceDeviceId: string;
  rssi: number;
  distance: number;
  signalQuality: number;
  technology: 'bluetooth_5' | 'bluetooth_6' | 'bluetooth_le';
  timestamp: Date;
}

export interface BluetoothSession {
  sessionId: string;
  deliveryId: string;
  courierDeviceId: string;
  recipientDeviceId: string;
  status: 'pending' | 'discovering' | 'connected' | 'ranging' | 'completed' | 'failed';
  startTime: Date;
  lastUpdate: Date;
  rangingHistory: BluetoothRangingData[];
}

export interface BluetoothHealthStatus {
  isAvailable: boolean;
  activeSessions: number;
  devicesFound: number;
  deviceDetails: Map<string, BluetoothDevice>;
  lastHealthCheck: Date;
}

export interface CalibrationData {
  deviceId: string;
  txPower: number;  // RSSI at 1 meter
  pathLossExponent: number;
  environment: 'free_space' | 'indoor' | 'outdoor' | 'heavy_obstacles';
  calibratedAt: Date;
}

// ============== Constants ==============

// TX Power (measured at 1 meter) - typical Bluetooth 5.0/6.0 values
const DEFAULT_TX_POWER = -60; // dBm at 1 meter (typical for BLE)

// Path Loss Exponents by environment
const PATH_LOSS_EXPONENTS = {
  free_space: 2.0,      // Open air
  outdoor: 2.5,         // Outdoor with some obstacles
  indoor: 3.0,          // Indoor with some obstacles
  heavy_obstacles: 4.0  // Heavy obstacles (walls, etc.)
};

// ============== Service ==============

class BluetoothService extends EventEmitter {
  private deviceDistances: Map<string, number> = new Map();
  private deviceRSSI: Map<string, number> = new Map();
  private lastUpdateTime: Map<string, Date> = new Map();
  private connectedDevices: Map<string, BluetoothDevice> = new Map();
  private activeSessions: Map<string, BluetoothSession> = new Map();
  private calibrationData: Map<string, CalibrationData> = new Map();
  private isInitialized: boolean = false;

  constructor() {
    super();
    this.initialize();
  }

  /**
   * Initialize the Bluetooth service
   */
  private initialize(): void {
    console.log('🔵 BluetoothService initialized');
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
   * Create a new Bluetooth ranging session for a delivery
   */
  public createSession(
    deliveryId: string,
    courierDeviceId: string,
    recipientDeviceId: string
  ): BluetoothSession {
    const sessionId = `bt-session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const session: BluetoothSession = {
      sessionId,
      deliveryId,
      courierDeviceId,
      recipientDeviceId,
      status: 'pending',
      startTime: new Date(),
      lastUpdate: new Date(),
      rangingHistory: []
    };

    this.activeSessions.set(sessionId, session);
    console.log(`📍 Created Bluetooth session: ${sessionId} for delivery: ${deliveryId}`);
    
    this.emit('session_created', session);
    return session;
  }

  /**
   * Start discovery for a target device
   */
  public async startDiscovery(sessionId: string, targetDeviceId: string): Promise<boolean> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      console.error(`❌ Session not found: ${sessionId}`);
      return false;
    }

    session.status = 'discovering';
    session.lastUpdate = new Date();
    
    console.log(`🔵 Starting Bluetooth discovery for: ${targetDeviceId}`);
    this.emit('discovery_started', { sessionId, targetDeviceId });
    
    return true;
  }

  /**
   * Process ranging data received from a mobile client
   */
  public processRangingData(data: BluetoothRangingData): void {
    const { targetDeviceId, rssi, distance } = data;

    // Store device data
    this.deviceDistances.set(targetDeviceId, distance);
    this.deviceRSSI.set(targetDeviceId, rssi);
    this.lastUpdateTime.set(targetDeviceId, new Date());

    // Calculate signal quality
    const signalQuality = this.calculateSignalQuality(rssi);

    // Update or create device entry
    const device: BluetoothDevice = {
      deviceId: targetDeviceId,
      deviceName: `Device-${targetDeviceId.slice(-6)}`,
      rssi,
      distance,
      signalQuality,
      isConnected: true,
      lastUpdateTime: new Date()
    };
    this.connectedDevices.set(targetDeviceId, device);

    // Find and update active session
    for (const [sessionId, session] of this.activeSessions) {
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

    console.log(`📍 BLE: ${targetDeviceId} - RSSI: ${rssi}dBm, Distance: ${distance.toFixed(2)}m`);
    this.emit('ranging_update', data);
  }

  /**
   * Get current distance to target device (in meters)
   */
  public getDistance(targetDeviceId: string): number | null {
    return this.deviceDistances.get(targetDeviceId) || null;
  }

  /**
   * Get RSSI (signal strength) in dBm
   */
  public getRSSI(targetDeviceId: string): number | null {
    return this.deviceRSSI.get(targetDeviceId) || null;
  }

  /**
   * Get signal quality as percentage (0-100%)
   */
  public getSignalQuality(targetDeviceId: string): number {
    const rssi = this.deviceRSSI.get(targetDeviceId);
    if (rssi === undefined) return 0;
    return this.calculateSignalQuality(rssi);
  }

  /**
   * Calculate signal quality from RSSI
   * RSSI range typically: -30dBm (very strong) to -100dBm (very weak)
   */
  private calculateSignalQuality(rssi: number): number {
    const quality = ((rssi + 100) * 2);
    return Math.max(0, Math.min(100, quality));
  }

  /**
   * Calculate distance from RSSI using path loss model
   * Formula: distance = 10^((txPower - RSSI) / (10 * n))
   * Where: txPower = TX power at 1m, n = path loss exponent (2.0-4.0)
   */
  public calculateDistanceFromRSSI(
    rssi: number,
    deviceId?: string,
    environment: keyof typeof PATH_LOSS_EXPONENTS = 'indoor'
  ): number {
    // Check for device-specific calibration
    let txPower = DEFAULT_TX_POWER;
    let pathLossExponent = PATH_LOSS_EXPONENTS[environment];

    if (deviceId) {
      const calibration = this.calibrationData.get(deviceId);
      if (calibration) {
        txPower = calibration.txPower;
        pathLossExponent = calibration.pathLossExponent;
      }
    }

    if (rssi === 0) {
      return -1.0; // Invalid RSSI
    }

    // Calculate distance
    const ratio = (txPower - rssi) / (10 * pathLossExponent);
    const distance = Math.pow(10, ratio);

    // Clamp to reasonable Bluetooth range (0.1m to 240m)
    return Math.max(0.1, Math.min(240.0, distance));
  }

  /**
   * Calibrate for specific device/environment
   * Call this when at a known distance (e.g., 1 meter from device)
   */
  public calibrateForDevice(
    deviceId: string,
    rssiAt1Meter: number,
    environment: keyof typeof PATH_LOSS_EXPONENTS = 'indoor'
  ): CalibrationData {
    const calibration: CalibrationData = {
      deviceId,
      txPower: rssiAt1Meter,
      pathLossExponent: PATH_LOSS_EXPONENTS[environment],
      environment,
      calibratedAt: new Date()
    };

    this.calibrationData.set(deviceId, calibration);
    console.log(`✅ Calibrated Bluetooth for device ${deviceId}: txPower=${rssiAt1Meter}dBm`);
    
    this.emit('calibration_updated', calibration);
    return calibration;
  }

  /**
   * Stop discovery and cleanup session
   */
  public async stopDiscovery(sessionId: string): Promise<boolean> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return false;
    }

    session.status = 'completed';
    session.lastUpdate = new Date();

    // Clear device data
    this.deviceDistances.delete(session.recipientDeviceId);
    this.deviceRSSI.delete(session.recipientDeviceId);
    this.connectedDevices.delete(session.recipientDeviceId);

    console.log(`🛑 Bluetooth discovery stopped for session: ${sessionId}`);
    this.emit('discovery_stopped', { sessionId });
    
    return true;
  }

  /**
   * Get session by ID
   */
  public getSession(sessionId: string): BluetoothSession | null {
    return this.activeSessions.get(sessionId) || null;
  }

  /**
   * Get sessions for a delivery
   */
  public getSessionsForDelivery(deliveryId: string): BluetoothSession[] {
    return Array.from(this.activeSessions.values())
      .filter(session => session.deliveryId === deliveryId);
  }

  /**
   * Get health status of Bluetooth service
   */
  public getHealthStatus(): BluetoothHealthStatus {
    return {
      isAvailable: this.isInitialized,
      activeSessions: this.activeSessions.size,
      devicesFound: this.connectedDevices.size,
      deviceDetails: this.connectedDevices,
      lastHealthCheck: new Date()
    };
  }

  /**
   * Get all connected devices
   */
  public getConnectedDevices(): BluetoothDevice[] {
    return Array.from(this.connectedDevices.values());
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
   * Check if devices are in proximity (within threshold)
   */
  public isInProximity(sessionId: string, thresholdMeters: number = 10): boolean {
    const avgDistance = this.getAverageDistance(sessionId);
    return avgDistance !== null && avgDistance <= thresholdMeters;
  }

  /**
   * Dispose resources
   */
  public dispose(): void {
    this.deviceDistances.clear();
    this.deviceRSSI.clear();
    this.lastUpdateTime.clear();
    this.connectedDevices.clear();
    this.activeSessions.clear();
    this.calibrationData.clear();
    this.isInitialized = false;
    console.log('🔵 BluetoothService disposed');
  }
}

// Export singleton instance
export const bluetoothService = new BluetoothService();
export default BluetoothService;
