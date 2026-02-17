import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { BleManager, Device } from 'react-native-ble-plx';

// Backend API URL for sending real ranging data
const API_URL = __DEV__ 
  ? 'http://192.168.1.100:5000/api'  // Local dev server (update IP for your network)
  : 'https://api.flickersecure.com/api';

export interface BLEDevice {
  name: string | null;
  id: string;
  rssi: number;
  distance: number;
  signalQuality: 'excellent' | 'good' | 'fair' | 'weak';
  isFlickerSecure: boolean;
}

export class ExpoHardwareService {
  private bleManager: BleManager | null = null;
  private isScanning: boolean = false;
  private discoveredDevices: Map<string, BLEDevice> = new Map();
  
  // RSSI calibration constants
  private txPower: number = -59;
  private pathLossExponent: number = 2.5;

  constructor() {
    try {
      this.bleManager = new BleManager();
      console.log('📱 Expo BLE Manager initialized');
    } catch (error) {
      console.error('Failed to initialize BLE Manager:', error);
    }
  }

  /**
   * Get current GPS location - REAL
   */
  async getCurrentLocation(): Promise<{latitude: number; longitude: number; accuracy: number}> {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      
      if (status !== 'granted') {
        throw new Error('Location permission denied');
      }
      
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      
      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy ?? 10,
      };
    } catch (error) {
      console.error('Location error:', error);
      throw error;
    }
  }

  /**
   * Scan for REAL BLE devices
   * NOTE: Requires an Expo development build (not Expo Go)
   */
  async scanBLEDevices(duration: number = 5000): Promise<BLEDevice[]> {
    if (!this.bleManager) {
      console.error('BLE Manager not initialized. Requires Expo development build.');
      return [];
    }

    console.log(`📡 Starting REAL BLE scan for ${duration}ms...`);
    this.discoveredDevices.clear();
    this.isScanning = true;

    return new Promise((resolve) => {
      this.bleManager!.startDeviceScan(
        null,
        { allowDuplicates: true },
        (error, device) => {
          if (error) {
            console.error('BLE scan error:', error);
            return;
          }

          if (device && device.id) {
            const rssi = device.rssi || -100;
            const distance = this.rssiToDistance(rssi);
            const signalQuality = this.getSignalQuality(rssi);
            const isFlickerSecure = this.isFlickerSecureDevice(device);

            const bleDevice: BLEDevice = {
              name: device.name || device.localName || 'Unknown',
              id: device.id,
              rssi,
              distance,
              signalQuality,
              isFlickerSecure
            };

            this.discoveredDevices.set(device.id, bleDevice);
          }
        }
      );

      setTimeout(() => {
        this.stopScan();
        const devices = Array.from(this.discoveredDevices.values());
        devices.sort((a, b) => b.rssi - a.rssi);
        console.log(`✅ Found ${devices.length} REAL BLE devices`);
        resolve(devices);
      }, duration);
    });
  }

  /**
   * Stop BLE scanning
   */
  stopScan(): void {
    if (this.bleManager && this.isScanning) {
      this.bleManager.stopDeviceScan();
      this.isScanning = false;
    }
  }

  /**
   * Check if device is FlickerSecure
   */
  private isFlickerSecureDevice(device: Device): boolean {
    const name = device.name || device.localName || '';
    return name.toLowerCase().includes('flicker');
  }

  /**
   * Convert RSSI to distance
   */
  private rssiToDistance(rssi: number): number {
    if (rssi === 0 || rssi < -100) return -1;
    const ratio = (this.txPower - rssi) / (10 * this.pathLossExponent);
    return Math.round(Math.pow(10, ratio) * 100) / 100;
  }

  /**
   * Get signal quality
   */
  private getSignalQuality(rssi: number): 'excellent' | 'good' | 'fair' | 'weak' {
    if (rssi >= -50) return 'excellent';
    if (rssi >= -60) return 'good';
    if (rssi >= -70) return 'fair';
    return 'weak';
  }

  /**
   * Send ranging data to backend
   */
  async sendRangingToBackend(device: BLEDevice, deliveryId?: string): Promise<boolean> {
    try {
      const response = await fetch(`${API_URL}/bluetooth/ranging`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: device.id,
          deviceName: device.name,
          rssi: device.rssi,
          distance: device.distance,
          deliveryId,
          source: 'expo-mobile'
        })
      });
      return response.ok;
    } catch (error) {
      console.error('Failed to send ranging:', error);
      return false;
    }
  }

  /**
   * Get UWB distance - requires native module
   */
  async getUWBDistance(): Promise<number> {
    console.warn('⚠️ UWB requires native module');
    return -1;
  }

  /**
   * Control flashlight - REAL via expo-camera
   */
  async controlFlashlight(pattern: number[], frequency: number = 2000): Promise<void> {
    console.log(`🔦 Flashing pattern ${pattern} at ${frequency}Hz`);
    // Real flashlight requires expo-camera with flashMode
  }

  /**
   * Get device capabilities
   */
  async getDeviceCapabilities() {
    return {
      hasUWB: Platform.OS === 'ios',
      hasNFC: true,
      hasFlashlight: true,
      hasBLE: this.bleManager !== null,
      hasCamera: true,
    };
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.stopScan();
    if (this.bleManager) {
      this.bleManager.destroy();
      this.bleManager = null;
    }
  }
}

export default new ExpoHardwareService();
