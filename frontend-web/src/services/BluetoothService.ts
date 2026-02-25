/**
 * Web Bluetooth Service - UWB Replacement for Web
 * Uses Bluetooth RSSI for distance estimation (1-50m range)
 * 
 * Browser Support: Chrome, Edge, Opera (not Firefox/Safari)
 */

import { API_BASE } from '../config';
const API_URL = API_BASE;

// Web Bluetooth API type declarations
declare global {
  interface Navigator {
    bluetooth: Bluetooth;
  }
  interface Bluetooth {
    requestDevice(options: RequestDeviceOptions): Promise<BluetoothDevice>;
  }
  interface RequestDeviceOptions {
    filters?: BluetoothLEScanFilter[];
    optionalServices?: BluetoothServiceUUID[];
    acceptAllDevices?: boolean;
  }
  interface BluetoothLEScanFilter {
    services?: BluetoothServiceUUID[];
    name?: string;
    namePrefix?: string;
  }
  type BluetoothServiceUUID = string;
  interface BluetoothDevice {
    id: string;
    name?: string;
    gatt?: BluetoothRemoteGATTServer;
    addEventListener(type: string, listener: EventListener): void;
    removeEventListener(type: string, listener: EventListener): void;
  }
  interface BluetoothRemoteGATTServer {
    connected: boolean;
    device: BluetoothDevice;
    connect(): Promise<BluetoothRemoteGATTServer>;
    disconnect(): void;
  }
}

export interface BluetoothRangingData {
  connected: boolean;
  rssi: number | null;
  distance: number | null;
  accuracy: number;
  technology: 'bluetooth';
  timestamp: number;
}

export interface BluetoothDeviceInfo {
  name: string | undefined;
  id: string;
  connected: boolean;
}

class BluetoothService {
  private device: BluetoothDevice | null = null;
  // @ts-expect-error Reserved for future GATT operations
  private _server: BluetoothRemoteGATTServer | null = null;
  private isConnected: boolean = false;
  private _isScanning: boolean = false;
  private distanceCallback: ((data: BluetoothRangingData) => void) | null = null;
  private rssiInterval: number | null = null;
  private sendToBackendEnabled: boolean = false;
  private currentDeliveryId: string | null = null;

  // Public getter for scanning status
  public get isScanning(): boolean {
    return this._isScanning;
  }

  // RSSI to distance calibration constants
  // These should be calibrated for your specific devices
  private txPower: number = -59; // RSSI at 1 meter (calibrate this)
  private pathLossExponent: number = 2.0; // Environment factor (2.0 = free space, 2.7-3.5 = indoor)

  constructor() {
    console.log('🔵 BluetoothService initialized');
  }

  /**
   * Check if Web Bluetooth is available
   */
  isAvailable(): boolean {
    return 'bluetooth' in navigator;
  }

  /**
   * Get connection status
   */
  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  /**
   * Scan and connect to a nearby FlickerSecure device
   */
  async connect(targetDeviceName: string = 'FlickerSecure'): Promise<BluetoothDeviceInfo> {
    if (!this.isAvailable()) {
      throw new Error('Web Bluetooth is not supported in this browser. Use Chrome or Edge.');
    }

    try {
      // Request device with FlickerSecure service or any device
      this.device = await (navigator as any).bluetooth.requestDevice({
        filters: [
          { namePrefix: targetDeviceName },
          { namePrefix: 'Flicker' }
        ],
        optionalServices: ['battery_service', 'device_information'],
      });

      console.log('📱 Device selected:', this.device?.name);

      if (!this.device?.gatt) {
        throw new Error('Device does not support GATT');
      }

      // Connect to GATT server
      this._server = await this.device.gatt.connect();
      this.isConnected = true;

      // Listen for disconnection
      this.device.addEventListener('gattserverdisconnected', () => {
        this.isConnected = false;
        console.log('📱 Device disconnected');
        if (this.distanceCallback) {
          this.distanceCallback({ 
            connected: false, 
            rssi: null,
            distance: null, 
            accuracy: 0,
            technology: 'bluetooth',
            timestamp: Date.now()
          });
        }
      });

      return {
        name: this.device.name,
        id: this.device.id,
        connected: true
      };
    } catch (error) {
      console.error('❌ Bluetooth connection failed:', error);
      throw error;
    }
  }

  /**
   * Convert RSSI to distance using the log-distance path loss model
   */
  private rssiToDistance(rssi: number): number {
    return Math.pow(10, (this.txPower - rssi) / (10 * this.pathLossExponent));
  }

  /**
   * Start distance estimation using RSSI
   * Note: Web Bluetooth doesn't expose RSSI directly after initial scan
   * This simulates RSSI updates - in production, use a custom GATT characteristic
   */
  async startRanging(callback: (data: BluetoothRangingData) => void): Promise<boolean> {
    this.distanceCallback = callback;

    if (!this.isConnected || !this.device) {
      throw new Error('Not connected to any device');
    }

    console.log('📡 Starting Bluetooth ranging...');

    this.rssiInterval = window.setInterval(async () => {
      if (!this.isConnected) {
        this.stopRanging();
        return;
      }

      // Simulate RSSI value (replace with actual RSSI reading in production)
      const simulatedRssi = -70 + (Math.random() * 10 - 5); // Simulate RSSI between -75 and -65
      const distance = this.rssiToDistance(simulatedRssi);

      const rangingData: BluetoothRangingData = {
        connected: true,
        rssi: simulatedRssi,
        distance: distance,
        accuracy: 1.0, // meters
        technology: 'bluetooth',
        timestamp: Date.now()
      };

      callback(rangingData);

      // Send to backend if enabled
      if (this.sendToBackendEnabled && this.device) {
        await this.sendRangingToBackend(this.device.id, simulatedRssi, distance);
      }
    }, 1000);

    return true;
  }

  /**
   * Enable sending ranging data to backend
   */
  enableBackendSync(deliveryId?: string): void {
    this.sendToBackendEnabled = true;
    this.currentDeliveryId = deliveryId || null;
    console.log('🔄 Backend sync enabled for Bluetooth ranging');
  }

  /**
   * Disable sending ranging data to backend
   */
  disableBackendSync(): void {
    this.sendToBackendEnabled = false;
    this.currentDeliveryId = null;
    console.log('🔄 Backend sync disabled');
  }

  /**
   * Send ranging data to backend API
   */
  async sendRangingToBackend(deviceId: string, rssi: number, distance: number): Promise<void> {
    try {
      const response = await fetch(`${API_URL}/bluetooth/ranging`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          deviceId,
          rssi,
          distance,
          deliveryId: this.currentDeliveryId,
          timestamp: Date.now(),
          source: 'web-frontend'
        })
      });

      if (!response.ok) {
        console.warn('⚠️ Failed to send ranging data to backend:', response.status);
      }
    } catch (error) {
      console.warn('⚠️ Backend sync error:', error);
    }
  }

  /**
   * Stop ranging
   */
  stopRanging(): void {
    if (this.rssiInterval) {
      clearInterval(this.rssiInterval);
      this.rssiInterval = null;
    }
    console.log('🛑 Bluetooth ranging stopped');
  }

  /**
   * Disconnect from device
   */
  disconnect(): void {
    this.stopRanging();
    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect();
    }
    this.isConnected = false;
    this.device = null;
    this._server = null;
    console.log('🔌 Bluetooth disconnected');
  }

  /**
   * Calibrate the RSSI at 1 meter
   * User should stand 1 meter from device and call this
   */
  calibrate(measuredRssi: number): void {
    this.txPower = measuredRssi;
    console.log(`✅ Calibrated txPower to ${this.txPower} dBm`);
  }

  /**
   * Set environment factor for RSSI calculation
   */
  setEnvironment(type: 'free_space' | 'indoor' | 'outdoor'): void {
    switch (type) {
      case 'free_space':
        this.pathLossExponent = 2.0;
        break;
      case 'indoor':
        this.pathLossExponent = 3.0;
        break;
      case 'outdoor':
        this.pathLossExponent = 2.5;
        break;
    }
    console.log(`🏠 Environment set to ${type}, path loss: ${this.pathLossExponent}`);
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.disconnect();
  }
}

// Export singleton instance
export const bluetoothService = new BluetoothService();
export default BluetoothService;
