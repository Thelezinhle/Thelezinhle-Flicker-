import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';

import HardwareService from '../services/ExpoHardwareService';

export default function ProximityScreen() {
  const [location, setLocation] = useState<{latitude: number; longitude: number} | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState<any[]>([]);

  // Get initial location
  useEffect(() => {
    getCurrentLocation();
  }, []);

  const getCurrentLocation = async () => {
    try {
      const currentLocation = await HardwareService.getCurrentLocation();
      setLocation(currentLocation);
    } catch (error) {
      Alert.alert('Location Error', 'Failed to get location');
    }
  };

  const startBluetoothScan = async () => {
    setIsScanning(true);
    try {
      const foundDevices = await HardwareService.scanBLEDevices(5000);
      setDevices(foundDevices);
    } catch (error) {
      Alert.alert('Scan Error', 'Failed to scan for devices');
    } finally {
      setIsScanning(false);
    }
  };

  const simulateUWB = async () => {
    try {
      const distance = await HardwareService.getUWBDistance();
      Alert.alert('UWB Distance', `Distance: ${distance.toFixed(2)} meters`);
    } catch (error) {
      Alert.alert('UWB Error', 'UWB not available');
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.title}>📍 Current Location</Text>
        {location ? (
          <View style={styles.card}>
            <Text style={styles.text}>Latitude: {location.latitude.toFixed(6)}</Text>
            <Text style={styles.text}>Longitude: {location.longitude.toFixed(6)}</Text>
          </View>
        ) : (
          <Text style={styles.text}>Loading location...</Text>
        )}
        
        <TouchableOpacity style={styles.button} onPress={getCurrentLocation}>
          <Text style={styles.buttonText}>Refresh Location</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.title}>📡 Bluetooth Scan</Text>
        
        <TouchableOpacity 
          style={[styles.button, isScanning && styles.buttonDisabled]}
          onPress={startBluetoothScan}
          disabled={isScanning}
        >
          <Text style={styles.buttonText}>
            {isScanning ? 'Scanning...' : 'Scan for Devices'}
          </Text>
        </TouchableOpacity>

        {devices.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.text}>Found {devices.length} device(s):</Text>
            {devices.slice(0, 5).map((device, index) => (
              <Text key={index} style={styles.deviceText}>
                {device.name || 'Unknown'} (RSSI: {device.rssi})
              </Text>
            ))}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.title}>🎯 UWB Simulation</Text>
        
        <TouchableOpacity style={styles.button} onPress={simulateUWB}>
          <Text style={styles.buttonText}>Test UWB Distance</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.title}>💡 Light-ID Test</Text>
        
        <TouchableOpacity style={styles.button} onPress={() => {
          HardwareService.controlFlashlight([1,0,1,0,1,0], 2000);
        }}>
          <Text style={styles.buttonText}>Flash Light Pattern</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  text: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 4,
  },
  deviceText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  button: {
    backgroundColor: '#4F46E5',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
