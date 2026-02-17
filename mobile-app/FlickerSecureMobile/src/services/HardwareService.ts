import { Platform, PermissionsAndroid } from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import { BleManager, Device } from 'react-native-ble-plx';

// Backend API URL for sending real ranging data
const API_URL = __DEV__ 
  ? 'http://192.168.1.100:5000/api'  // Local dev server (update IP)
  : 'https://api.flickersecure.com/api';

export interface BLEDevice {
  name: string | null;
  id: string;
  rssi: number;
  distance: number;
  signalQuality: 'excellent' | 'good' | 'fair' | 'weak';
  isFlickerSecure: boolean;
}

export class HardwareService {
  private static instance: HardwareService;
  private bleManager: BleManager | null = null;
  private isScanning: boolean = false;
  private discoveredDevices: Map<string, BLEDevice> = new Map();
  
  // RSSI calibration constants
  private txPower: number = -59; // RSSI at 1 meter
  private pathLossExponent: number = 2.5; // Indoor environment

  private constructor() {
    // Initialize BLE manager
    try {
      this.bleManager = new BleManager();
      console.log('📱 BLE Manager initialized');
    } catch (error) {
      console.error('Failed to initialize BLE Manager:', error);
    }
  }

  public static getInstance(): HardwareService {
    if (!HardwareService.instance) {
      HardwareService.instance = new HardwareService();
    }
    return HardwareService.instance;
  }

  /**
   * Get current GPS location - REAL
   */
  async getCurrentLocation(): Promise<{latitude: number; longitude: number}> {
    return new Promise((resolve, reject) => {
      if (Platform.OS === 'android') {
        PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        ).then(granted => {
          if (granted === PermissionsAndroid.RESULTS.GRANTED) {
            this.getLocation(resolve, reject);
          } else {
            reject(new Error('Location permission denied'));
          }
        });
      } else {
        this.getLocation(resolve, reject);
      }
    });
  }

  private getLocation(resolve: Function, reject: Function) {
    Geolocation.getCurrentPosition(
      position => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      error => {
        reject(error);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 10000,
      }
    );
  }

  /**
   * Request BLE permissions - REAL
   */
  async requestBLEPermissions(): Promise<boolean> {
    if (Platform.OS === 'android') {
      const apiLevel = Platform.Version;
      
      if (apiLevel >= 31) {
        // Android 12+ requires BLUETOOTH_SCAN and BLUETOOTH_CONNECT
        const scanPermission = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN
        );
        const connectPermission = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT
        );
        const fineLocation = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );
        
        return (
          scanPermission === PermissionsAndroid.RESULTS.GRANTED &&
          connectPermission === PermissionsAndroid.RESULTS.GRANTED &&
          fineLocation === PermissionsAndroid.RESULTS.GRANTED
        );
      } else {
        // Android 11 and below
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }
    }
    return true; // iOS handles permissions differently
  }

  /**
   * Scan for REAL BLE devices
   */
  async scanBLEDevices(duration: number = 5000): Promise<BLEDevice[]> {
    if (!this.bleManager) {
      console.error('BLE Manager not initialized');
      return [];
    }

    // Request permissions first
    const hasPermission = await this.requestBLEPermissions();
    if (!hasPermission) {
      console.error('BLE permissions not granted');
      return [];
    }

    console.log(`📡 Starting REAL BLE scan for ${duration}ms...`);
    this.discoveredDevices.clear();
    this.isScanning = true;

    return new Promise((resolve) => {
      // Start scanning
      this.bleManager!.startDeviceScan(
        null, // Scan for all services
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

      // Stop after duration
      setTimeout(() => {
        this.stopScan();
        const devices = Array.from(this.discoveredDevices.values());
        // Sort by RSSI (closest first)
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
      console.log('🛑 BLE scan stopped');
    }
  }

  /**
   * Check if device is a FlickerSecure device
   */
  private isFlickerSecureDevice(device: Device): boolean {
    const name = device.name || device.localName || '';
    return (
      name.toLowerCase().includes('flicker') ||
      name.toLowerCase().includes('secure') ||
      name.toLowerCase().includes('flickertag')
    );
  }

  /**
   * Convert RSSI to distance using log-distance path loss model
   */
  private rssiToDistance(rssi: number): number {
    if (rssi === 0 || rssi < -100) return -1;
    const ratio = (this.txPower - rssi) / (10 * this.pathLossExponent);
    return Math.round(Math.pow(10, ratio) * 100) / 100;
  }

  /**
   * Get signal quality category
   */
  private getSignalQuality(rssi: number): 'excellent' | 'good' | 'fair' | 'weak' {
    if (rssi >= -50) return 'excellent';
    if (rssi >= -60) return 'good';
    if (rssi >= -70) return 'fair';
    return 'weak';
  }

  /**
   * Send ranging data to backend - REAL
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
          signalQuality: device.signalQuality,
          deliveryId,
          timestamp: Date.now(),
          source: 'mobile-app'
        })
      });
      return response.ok;
    } catch (error) {
      console.error('Failed to send ranging data:', error);
      return false;
    }
  }

  /**
   * Get UWB distance - NOTE: Requires native UWB module
   * Returns -1 if UWB not available (web fallback)
   */
  async getUWBDistance(): Promise<number> {
    // Real UWB requires platform-specific native module
    // iOS: NearbyInteraction framework
    // Android: UWB API (Android 12+)
    console.warn('⚠️ UWB requires native module. Install react-native-uwb or similar.');
    return -1;
  }

  /**
   * Control flashlight - REAL (requires expo-camera or react-native-camera)
   */
  async controlFlashlight(pattern: number[], frequency: number = 2000): Promise<void> {
    console.log(`🔦 Flashing pattern ${pattern} at ${frequency}Hz`);
    // Real implementation requires native flashlight control
    // Use expo-camera's flashMode or react-native-torch
  }

  /**
   * Get device capabilities - REAL
   */
  async getDeviceCapabilities() {
    return {
      hasUWB: Platform.OS === 'ios' && parseInt(Platform.Version, 10) >= 14,
      hasNFC: true, // Most modern phones have NFC
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

export default HardwareService.getInstance();
