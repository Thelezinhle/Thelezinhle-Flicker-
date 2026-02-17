/**
 * Real Bluetooth Service for FlickerSecure Mobile App
 * Uses react-native-ble-plx for actual BLE scanning
 * 
 * Features:
 * - Real device scanning
 * - RSSI-based distance estimation
 * - Device proximity detection
 * - Background scanning support
 */

import { BleManager, Device, State, BleError } from 'react-native-ble-plx';
import { Platform, PermissionsAndroid } from 'react-native';

// ============== Types ==============

export interface BluetoothDevice {
  id: string;
  name: string | null;
  rssi: number;
  distance: number;
  signalQuality: number;
  isFlickerDevice: boolean;
  lastSeen: Date;
  manufacturerData?: string;
  serviceUUIDs?: string[];
}

export interface ScanResult {
  devices: BluetoothDevice[];
  isScanning: boolean;
  error: string | null;
}

export interface BluetoothStatus {
  isAvailable: boolean;
  isPoweredOn: boolean;
  hasPermissions: boolean;
  isScanning: boolean;
  devicesFound: number;
}

// ============== Constants ==============

// FlickerSecure Service UUID (custom UUID for device identification)
const FLICKER_SERVICE_UUID = 'f1ck3r00-0001-0002-0003-000000000001';

// TX Power calibration (dBm at 1 meter)
const TX_POWER_CALIBRATION = {
  default: -59,        // Generic BLE device
  iphone: -55,         // iPhone typical
  android: -60,        // Android typical
  flicker: -55,        // FlickerSecure device
};

// Path loss exponent by environment
const PATH_LOSS_EXPONENT = {
  free_space: 2.0,
  indoor: 3.0,
  outdoor: 2.5,
  obstructed: 4.0,
};

// ============== Service Class ==============

class BluetoothService {
  private manager: BleManager;
  private devices: Map<string, BluetoothDevice> = new Map();
  private isScanning: boolean = false;
  private scanSubscription: any = null;
  private stateSubscription: any = null;
  private listeners: Map<string, Function[]> = new Map();
  private environment: keyof typeof PATH_LOSS_EXPONENT = 'indoor';

  constructor() {
    this.manager = new BleManager();
    this.setupStateListener();
  }

  // ============== Initialization ==============

  /**
   * Setup Bluetooth state change listener
   */
  private setupStateListener(): void {
    this.stateSubscription = this.manager.onStateChange((state) => {
      console.log('🔵 Bluetooth state changed:', state);
      this.emit('stateChange', state);
      
      if (state === State.PoweredOn) {
        console.log('✅ Bluetooth is ready');
        this.emit('ready', true);
      }
    }, true);
  }

  /**
   * Check and request necessary permissions
   */
  async requestPermissions(): Promise<boolean> {
    if (Platform.OS === 'android') {
      try {
        const apiLevel = Platform.Version as number;
        
        if (apiLevel >= 31) {
          // Android 12+ requires BLUETOOTH_SCAN and BLUETOOTH_CONNECT
          const granted = await PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          ]);
          
          const allGranted = 
            granted['android.permission.BLUETOOTH_SCAN'] === PermissionsAndroid.RESULTS.GRANTED &&
            granted['android.permission.BLUETOOTH_CONNECT'] === PermissionsAndroid.RESULTS.GRANTED &&
            granted['android.permission.ACCESS_FINE_LOCATION'] === PermissionsAndroid.RESULTS.GRANTED;
          
          console.log('📱 Android 12+ permissions:', allGranted ? 'granted' : 'denied');
          return allGranted;
        } else {
          // Android 11 and below
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            {
              title: 'Location Permission',
              message: 'Bluetooth scanning requires location permission',
              buttonPositive: 'OK',
            }
          );
          
          console.log('📱 Android location permission:', granted);
          return granted === PermissionsAndroid.RESULTS.GRANTED;
        }
      } catch (error) {
        console.error('❌ Permission error:', error);
        return false;
      }
    }
    
    // iOS handles permissions automatically
    return true;
  }

  /**
   * Get current Bluetooth status
   */
  async getStatus(): Promise<BluetoothStatus> {
    const state = await this.manager.state();
    const hasPermissions = await this.requestPermissions();
    
    return {
      isAvailable: state !== State.Unsupported,
      isPoweredOn: state === State.PoweredOn,
      hasPermissions,
      isScanning: this.isScanning,
      devicesFound: this.devices.size,
    };
  }

  // ============== Scanning ==============

  /**
   * Start scanning for nearby Bluetooth devices
   */
  async startScan(options?: {
    filterFlickerDevices?: boolean;
    scanDuration?: number;
    targetDeviceId?: string;
  }): Promise<ScanResult> {
    const status = await this.getStatus();
    
    if (!status.isPoweredOn) {
      return {
        devices: [],
        isScanning: false,
        error: 'Bluetooth is not powered on',
      };
    }

    if (!status.hasPermissions) {
      return {
        devices: [],
        isScanning: false,
        error: 'Bluetooth permissions not granted',
      };
    }

    if (this.isScanning) {
      console.log('⚠️ Already scanning, stopping previous scan');
      this.stopScan();
    }

    this.isScanning = true;
    this.devices.clear();
    console.log('🔵 Starting Bluetooth scan...');
    this.emit('scanStart', true);

    // Set up scan duration timeout
    const duration = options?.scanDuration || 10000; // Default 10 seconds
    const scanTimeout = setTimeout(() => {
      this.stopScan();
    }, duration);

    return new Promise((resolve) => {
      this.scanSubscription = this.manager.startDeviceScan(
        null, // Scan all UUIDs (can filter by FLICKER_SERVICE_UUID if needed)
        { allowDuplicates: true },
        (error: BleError | null, device: Device | null) => {
          if (error) {
            console.error('❌ Scan error:', error);
            this.emit('scanError', error);
            clearTimeout(scanTimeout);
            this.isScanning = false;
            resolve({
              devices: Array.from(this.devices.values()),
              isScanning: false,
              error: error.message,
            });
            return;
          }

          if (device) {
            this.processDiscoveredDevice(device, options?.targetDeviceId);
          }
        }
      );

      // Resolve after scan duration
      setTimeout(() => {
        resolve({
          devices: Array.from(this.devices.values()),
          isScanning: this.isScanning,
          error: null,
        });
      }, duration + 100);
    });
  }

  /**
   * Stop scanning for devices
   */
  stopScan(): void {
    if (this.scanSubscription) {
      this.manager.stopDeviceScan();
      this.scanSubscription = null;
    }
    this.isScanning = false;
    console.log('🔵 Bluetooth scan stopped');
    this.emit('scanStop', Array.from(this.devices.values()));
  }

  /**
   * Process a discovered Bluetooth device
   */
  private processDiscoveredDevice(device: Device, targetDeviceId?: string): void {
    const rssi = device.rssi || -100;
    const distance = this.calculateDistance(rssi);
    const signalQuality = this.calculateSignalQuality(rssi);
    
    // Check if it's a FlickerSecure device
    const isFlickerDevice = this.isFlickerDevice(device);
    
    // Check if it matches target device
    const matchesTarget = targetDeviceId 
      ? device.id === targetDeviceId || device.name?.includes(targetDeviceId)
      : true;

    const bluetoothDevice: BluetoothDevice = {
      id: device.id,
      name: device.name || device.localName || 'Unknown',
      rssi,
      distance,
      signalQuality,
      isFlickerDevice,
      lastSeen: new Date(),
      manufacturerData: device.manufacturerData || undefined,
      serviceUUIDs: device.serviceUUIDs || undefined,
    };

    // Update device in map
    this.devices.set(device.id, bluetoothDevice);

    // Log significant findings
    if (isFlickerDevice || matchesTarget || rssi > -70) {
      console.log(`📍 Device: ${bluetoothDevice.name} | RSSI: ${rssi}dBm | Distance: ${distance.toFixed(2)}m`);
    }

    // Emit update
    this.emit('deviceFound', bluetoothDevice);

    // Special event for nearby devices
    if (distance < 5) {
      this.emit('deviceNearby', bluetoothDevice);
    }
  }

  /**
   * Check if device is a FlickerSecure device
   */
  private isFlickerDevice(device: Device): boolean {
    // Check service UUIDs
    if (device.serviceUUIDs?.includes(FLICKER_SERVICE_UUID)) {
      return true;
    }
    
    // Check device name
    if (device.name?.toLowerCase().includes('flicker')) {
      return true;
    }
    
    // Check local name
    if (device.localName?.toLowerCase().includes('flicker')) {
      return true;
    }
    
    return false;
  }

  // ============== Distance Calculation ==============

  /**
   * Calculate distance from RSSI using log-distance path loss model
   * Distance = 10 ^ ((TxPower - RSSI) / (10 * n))
   */
  private calculateDistance(rssi: number, txPower?: number): number {
    const tx = txPower || TX_POWER_CALIBRATION.default;
    const n = PATH_LOSS_EXPONENT[this.environment];
    
    if (rssi >= 0) return 0;
    
    const distance = Math.pow(10, (tx - rssi) / (10 * n));
    
    // Clamp distance to reasonable values
    return Math.min(Math.max(distance, 0.1), 100);
  }

  /**
   * Calculate signal quality (0-100%)
   */
  private calculateSignalQuality(rssi: number): number {
    // -30 dBm = excellent (100%)
    // -90 dBm = poor (0%)
    const quality = Math.round(((rssi + 90) / 60) * 100);
    return Math.min(Math.max(quality, 0), 100);
  }

  /**
   * Set environment for better distance estimation
   */
  setEnvironment(env: 'free_space' | 'indoor' | 'outdoor' | 'obstructed'): void {
    this.environment = env;
    console.log(`🔵 Environment set to: ${env}`);
  }

  // ============== Device Operations ==============

  /**
   * Get all discovered devices
   */
  getDevices(): BluetoothDevice[] {
    return Array.from(this.devices.values());
  }

  /**
   * Get nearby devices (within threshold distance)
   */
  getNearbyDevices(maxDistance: number = 10): BluetoothDevice[] {
    return Array.from(this.devices.values())
      .filter(d => d.distance <= maxDistance)
      .sort((a, b) => a.distance - b.distance);
  }

  /**
   * Get closest device
   */
  getClosestDevice(): BluetoothDevice | null {
    const devices = this.getNearbyDevices(100);
    return devices.length > 0 ? devices[0] : null;
  }

  /**
   * Get device by ID
   */
  getDevice(deviceId: string): BluetoothDevice | null {
    return this.devices.get(deviceId) || null;
  }

  /**
   * Find FlickerSecure devices only
   */
  getFlickerDevices(): BluetoothDevice[] {
    return Array.from(this.devices.values()).filter(d => d.isFlickerDevice);
  }

  // ============== Event System ==============

  /**
   * Add event listener
   */
  on(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  /**
   * Remove event listener
   */
  off(event: string, callback: Function): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  /**
   * Emit event
   */
  private emit(event: string, data: any): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(cb => cb(data));
    }
  }

  // ============== Cleanup ==============

  /**
   * Cleanup and destroy service
   */
  destroy(): void {
    this.stopScan();
    if (this.stateSubscription) {
      this.stateSubscription.remove();
    }
    this.manager.destroy();
    this.devices.clear();
    this.listeners.clear();
    console.log('🔵 BluetoothService destroyed');
  }
}

// ============== Export Singleton ==============

export const bluetoothService = new BluetoothService();
export default bluetoothService;
