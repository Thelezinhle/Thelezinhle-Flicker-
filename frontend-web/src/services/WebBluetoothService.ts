/**
 * Web Bluetooth Service - Browser-based Bluetooth proximity
 * Works in Chrome, Edge, Opera on Android and Desktop
 * Does NOT work in Safari or Firefox
 */

export interface BluetoothDeviceInfo {
  id: string;
  name: string;
  rssi?: number;
  distance?: number;
  connected: boolean;
}

class WebBluetoothService {
  private device: BluetoothDevice | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private isSupported: boolean = false;

  constructor() {
    this.isSupported = typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }

  /**
   * Check if Web Bluetooth is supported
   */
  checkSupport(): { supported: boolean; reason?: string } {
    if (!this.isSupported) {
      return {
        supported: false,
        reason: 'Web Bluetooth not supported. Use Chrome, Edge, or Opera on Android/Desktop.'
      };
    }

    // Check if running over HTTPS (required for Web Bluetooth)
    if (typeof window !== 'undefined' && window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
      return {
        supported: false,
        reason: 'Web Bluetooth requires HTTPS connection.'
      };
    }

    return { supported: true };
  }

  /**
   * Scan for nearby Bluetooth devices
   * User must click a button to trigger this (browser security requirement)
   */
  async scanForDevices(targetName?: string): Promise<BluetoothDeviceInfo | null> {
    const support = this.checkSupport();
    if (!support.supported) {
      throw new Error(support.reason);
    }

    try {
      // Request device - this opens browser's device picker
      const options: RequestDeviceOptions = {
        // Accept all devices or filter by name
        acceptAllDevices: !targetName,
        optionalServices: ['battery_service', 'device_information'],
      };

      if (targetName) {
        options.acceptAllDevices = false;
        options.filters = [{ namePrefix: targetName }];
      }

      console.log('🔵 Opening Bluetooth device picker...');
      this.device = await navigator.bluetooth.requestDevice(options);

      if (!this.device) {
        return null;
      }

      console.log(`✅ Selected device: ${this.device.name || 'Unknown'}`);

      return {
        id: this.device.id,
        name: this.device.name || 'Unknown Device',
        connected: false,
        distance: undefined // RSSI not available via Web Bluetooth scan
      };
    } catch (error: any) {
      if (error.name === 'NotFoundError') {
        console.log('User cancelled device picker');
        return null;
      }
      throw error;
    }
  }

  /**
   * Connect to the selected device
   */
  async connect(): Promise<boolean> {
    if (!this.device) {
      throw new Error('No device selected. Call scanForDevices first.');
    }

    try {
      console.log('🔄 Connecting to device...');
      this.server = await this.device.gatt!.connect();
      console.log('✅ Connected to GATT server');

      // Listen for disconnection
      this.device.addEventListener('gattserverdisconnected', () => {
        console.log('📴 Device disconnected');
        this.server = null;
      });

      return true;
    } catch (error) {
      console.error('❌ Connection failed:', error);
      return false;
    }
  }

  /**
   * Disconnect from current device
   */
  disconnect(): void {
    if (this.server && this.server.connected) {
      this.server.disconnect();
    }
    this.device = null;
    this.server = null;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.server?.connected ?? false;
  }

  /**
   * Get connected device info
   */
  getConnectedDevice(): BluetoothDeviceInfo | null {
    if (!this.device) return null;
    
    return {
      id: this.device.id,
      name: this.device.name || 'Unknown Device',
      connected: this.isConnected()
    };
  }

  /**
   * Read battery level (if supported by device)
   */
  async readBatteryLevel(): Promise<number | null> {
    if (!this.server?.connected) return null;

    try {
      // Using any to avoid type issues with Web Bluetooth API
      const server = this.server as any;
      const service = await server.getPrimaryService('battery_service');
      const characteristic = await service.getCharacteristic('battery_level');
      const value = await characteristic.readValue();
      return value.getUint8(0);
    } catch {
      return null;
    }
  }

  /**
   * Estimate distance based on connection quality
   * Note: Web Bluetooth doesn't provide RSSI, so this is a rough estimate
   */
  estimateProximity(): 'immediate' | 'near' | 'far' | 'unknown' {
    if (!this.isConnected()) return 'unknown';
    
    // Without RSSI, we can only know if device is connected
    // Bluetooth classic range is ~10m, BLE can be up to 100m
    // If connected, assume "near" (within 10m)
    return 'near';
  }
}

// Singleton instance
const webBluetoothService = new WebBluetoothService();
export default webBluetoothService;
