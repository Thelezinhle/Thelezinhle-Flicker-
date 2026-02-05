import { Platform, PermissionsAndroid } from 'react-native';
import Geolocation from 'react-native-geolocation-service';

export class HardwareService {
  private static instance: HardwareService;

  private constructor() {}

  public static getInstance(): HardwareService {
    if (!HardwareService.instance) {
      HardwareService.instance = new HardwareService();
    }
    return HardwareService.instance;
  }

  /**
   * Get current GPS location
   */
  async getCurrentLocation(): Promise<{latitude: number; longitude: number}> {
    return new Promise((resolve, reject) => {
      // Request permission first
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
        // iOS - permission handled differently
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
   * Scan for Bluetooth devices (SIMULATED - for now)
   */
  async scanBLEDevices(duration: number = 5000): Promise<Array<{name: string; rssi: number}>> {
    console.log(`Scanning for BLE devices for ${duration}ms...`);
    
    // Simulate scanning delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Return simulated devices
    return [
      { name: 'iPhone 13', rssi: -45 },
      { name: 'Galaxy S22', rssi: -52 },
      { name: 'FlickerTag #1', rssi: -60 },
      { name: 'Unknown Device', rssi: -75 },
    ];
  }

  /**
   * Get UWB distance (SIMULATED - for now)
   */
  async getUWBDistance(): Promise<number> {
    // Simulate UWB distance measurement
    return 0.5 + Math.random() * 0.5; // 0.5m to 1.0m
  }

  /**
   * Control flashlight (SIMULATED - for now)
   */
  async controlFlashlight(pattern: number[], frequency: number = 2000): Promise<void> {
    console.log(`Flashing pattern ${pattern} at ${frequency}Hz`);
    
    // In a real app, this would control the physical flashlight
    // For now, just log it
    pattern.forEach((bit, index) => {
      setTimeout(() => {
        console.log(`Flash ${bit ? 'ON' : 'OFF'}`);
      }, index * (1000 / frequency));
    });
  }

  /**
   * Get device capabilities (SIMULATED)
   */
  async getDeviceCapabilities() {
    return {
      hasUWB: Platform.OS === 'ios', // iOS has U1 chip
      hasNFC: true,
      hasFlashlight: true,
      hasBLE: true,
      hasCamera: true,
    };
  }
}

export default HardwareService.getInstance();
