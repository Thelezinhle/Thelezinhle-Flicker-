import * as Location from 'expo-location';
import { Platform } from 'react-native';

export class ExpoHardwareService {
  /**
   * Get current GPS location
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
      // Return default location for testing
      return {
        latitude: -26.2041,
        longitude: 28.0473,
        accuracy: 10
      };
    }
  }

  /**
   * Scan for Bluetooth devices (SIMULATED)
   */
  async scanBLEDevices(duration: number = 5000): Promise<{name: string; rssi: number}[]> {
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
   * Get UWB distance (SIMULATED)
   */
  async getUWBDistance(): Promise<number> {
    return 0.5 + Math.random() * 0.5; // 0.5m to 1.0m
  }

  /**
   * Control flashlight (SIMULATED)
   */
  async controlFlashlight(pattern: number[], frequency: number = 2000): Promise<void> {
    console.log(`Flashing pattern ${pattern} at ${frequency}Hz`);
    
    pattern.forEach((bit, index) => {
      setTimeout(() => {
        console.log(`Flash ${bit ? 'ON' : 'OFF'}`);
      }, index * (1000 / frequency));
    });
  }

  /**
   * Get device capabilities
   */
  async getDeviceCapabilities() {
    return {
      hasUWB: Platform.OS === 'ios',
      hasNFC: true,
      hasFlashlight: true,
      hasBLE: true,
      hasCamera: true,
    };
  }
}

export default new ExpoHardwareService();
