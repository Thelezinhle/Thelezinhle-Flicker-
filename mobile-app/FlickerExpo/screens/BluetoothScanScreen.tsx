/**
 * BluetoothScanScreen - Real Bluetooth Device Scanner
 * Shows nearby Bluetooth devices and their distances
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import bluetoothService, { BluetoothDevice, BluetoothStatus } from '../services/BluetoothService';

interface BluetoothScanScreenProps {
  onDeviceSelect?: (device: BluetoothDevice) => void;
  targetDeviceId?: string;
  onClose?: () => void;
}

export default function BluetoothScanScreen({ 
  onDeviceSelect, 
  targetDeviceId,
  onClose 
}: BluetoothScanScreenProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState<BluetoothDevice[]>([]);
  const [status, setStatus] = useState<BluetoothStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Initialize and check status
  useEffect(() => {
    checkBluetoothStatus();
    
    // Setup event listeners
    const handleDeviceFound = (device: BluetoothDevice) => {
      setDevices(prev => {
        const existing = prev.findIndex(d => d.id === device.id);
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = device;
          return updated;
        }
        return [...prev, device];
      });
    };

    const handleScanStop = () => {
      setIsScanning(false);
    };

    const handleScanError = (err: any) => {
      setError(err.message || 'Scan error');
      setIsScanning(false);
    };

    bluetoothService.on('deviceFound', handleDeviceFound);
    bluetoothService.on('scanStop', handleScanStop);
    bluetoothService.on('scanError', handleScanError);

    return () => {
      bluetoothService.off('deviceFound', handleDeviceFound);
      bluetoothService.off('scanStop', handleScanStop);
      bluetoothService.off('scanError', handleScanError);
      bluetoothService.stopScan();
    };
  }, []);

  const checkBluetoothStatus = async () => {
    try {
      const btStatus = await bluetoothService.getStatus();
      setStatus(btStatus);
      
      if (!btStatus.isPoweredOn) {
        setError('Please turn on Bluetooth');
      } else if (!btStatus.hasPermissions) {
        setError('Bluetooth permissions required');
      } else {
        setError(null);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const startScan = async () => {
    setError(null);
    setDevices([]);
    setIsScanning(true);

    try {
      const result = await bluetoothService.startScan({
        scanDuration: 15000, // 15 seconds
        targetDeviceId,
      });

      if (result.error) {
        setError(result.error);
      }
      
      setDevices(result.devices);
      setIsScanning(false);
    } catch (err: any) {
      setError(err.message);
      setIsScanning(false);
    }
  };

  const stopScan = () => {
    bluetoothService.stopScan();
    setIsScanning(false);
  };

  const handleDevicePress = (device: BluetoothDevice) => {
    if (onDeviceSelect) {
      onDeviceSelect(device);
    }
  };

  const getSignalColor = (quality: number): string => {
    if (quality >= 70) return '#4ade80'; // Green
    if (quality >= 40) return '#fbbf24'; // Yellow
    return '#f87171'; // Red
  };

  const getDistanceLabel = (distance: number): string => {
    if (distance < 1) return '< 1m (Very Close)';
    if (distance < 3) return `${distance.toFixed(1)}m (Close)`;
    if (distance < 10) return `${distance.toFixed(1)}m (Nearby)`;
    return `${distance.toFixed(1)}m (Far)`;
  };

  const renderDevice = ({ item }: { item: BluetoothDevice }) => (
    <TouchableOpacity 
      style={[
        styles.deviceCard,
        item.isFlickerDevice && styles.flickerDevice,
        item.distance < 3 && styles.nearbyDevice,
      ]}
      onPress={() => handleDevicePress(item)}
    >
      <View style={styles.deviceMain}>
        <View style={styles.deviceHeader}>
          <Text style={styles.deviceIcon}>
            {item.isFlickerDevice ? '📱' : '📶'}
          </Text>
          <View style={styles.deviceInfo}>
            <Text style={styles.deviceName}>
              {item.name || 'Unknown Device'}
            </Text>
            <Text style={styles.deviceId}>
              {item.id.slice(0, 17)}...
            </Text>
          </View>
        </View>
        
        <View style={styles.deviceMetrics}>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Distance</Text>
            <Text style={[styles.metricValue, { color: getSignalColor(item.signalQuality) }]}>
              {getDistanceLabel(item.distance)}
            </Text>
          </View>
          
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Signal</Text>
            <View style={styles.signalBar}>
              <View 
                style={[
                  styles.signalFill, 
                  { 
                    width: `${item.signalQuality}%`,
                    backgroundColor: getSignalColor(item.signalQuality)
                  }
                ]} 
              />
            </View>
            <Text style={styles.rssiText}>{item.rssi} dBm</Text>
          </View>
        </View>
      </View>

      {item.isFlickerDevice && (
        <View style={styles.flickerBadge}>
          <Text style={styles.flickerBadgeText}>FlickerSecure</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  const sortedDevices = [...devices].sort((a, b) => {
    // FlickerSecure devices first
    if (a.isFlickerDevice && !b.isFlickerDevice) return -1;
    if (!a.isFlickerDevice && b.isFlickerDevice) return 1;
    // Then by distance
    return a.distance - b.distance;
  });

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🔵 Bluetooth Scanner</Text>
        {onClose && (
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Status Banner */}
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>⚠️ {error}</Text>
          <TouchableOpacity onPress={checkBluetoothStatus}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Bluetooth Status */}
      <View style={styles.statusBar}>
        <View style={styles.statusItem}>
          <View style={[
            styles.statusDot, 
            { backgroundColor: status?.isPoweredOn ? '#4ade80' : '#f87171' }
          ]} />
          <Text style={styles.statusText}>
            Bluetooth {status?.isPoweredOn ? 'On' : 'Off'}
          </Text>
        </View>
        <View style={styles.statusItem}>
          <Text style={styles.statusText}>
            {devices.length} device{devices.length !== 1 ? 's' : ''} found
          </Text>
        </View>
      </View>

      {/* Scan Button */}
      <View style={styles.scanSection}>
        {!isScanning ? (
          <TouchableOpacity 
            style={[styles.scanBtn, (!status?.isPoweredOn) && styles.disabledBtn]}
            onPress={startScan}
            disabled={!status?.isPoweredOn}
          >
            <Text style={styles.scanBtnText}>🔍 Start Scanning</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.stopBtn} onPress={stopScan}>
            <ActivityIndicator color="#fff" size="small" />
            <Text style={styles.stopBtnText}>Scanning... Tap to Stop</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Instructions */}
      {devices.length === 0 && !isScanning && (
        <View style={styles.instructions}>
          <Text style={styles.instructionIcon}>📶</Text>
          <Text style={styles.instructionTitle}>Find Nearby Devices</Text>
          <Text style={styles.instructionText}>
            Tap "Start Scanning" to discover Bluetooth devices near you.{'\n\n'}
            FlickerSecure devices will be highlighted.
          </Text>
        </View>
      )}

      {/* Device List */}
      <FlatList
        data={sortedDevices}
        keyExtractor={(item: { id: string }) => item.id}
        renderItem={renderDevice}
        style={styles.deviceList}
        contentContainerStyle={styles.deviceListContent}
        ListEmptyComponent={
          isScanning ? (
            <View style={styles.scanningIndicator}>
              <ActivityIndicator size="large" color="#3b82f6" />
              <Text style={styles.scanningText}>Searching for devices...</Text>
            </View>
          ) : null
        }
      />

      {/* Target Device Notice */}
      {targetDeviceId && (
        <View style={styles.targetNotice}>
          <Text style={styles.targetText}>
            🎯 Looking for: {targetDeviceId}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: Platform.OS === 'ios' ? 50 : 16,
    backgroundColor: '#16213e',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  closeBtn: {
    padding: 8,
  },
  closeText: {
    fontSize: 24,
    color: '#94a3b8',
  },
  errorBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#7f1d1d',
    padding: 12,
  },
  errorText: {
    color: '#fecaca',
    fontSize: 14,
  },
  retryText: {
    color: '#60a5fa',
    fontWeight: 'bold',
  },
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: '#16213e',
    borderBottomWidth: 1,
    borderBottomColor: '#0f3460',
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  statusText: {
    color: '#94a3b8',
    fontSize: 14,
  },
  scanSection: {
    padding: 16,
  },
  scanBtn: {
    backgroundColor: '#3b82f6',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  scanBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  stopBtn: {
    flexDirection: 'row',
    backgroundColor: '#dc2626',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  stopBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  disabledBtn: {
    backgroundColor: '#4b5563',
    opacity: 0.6,
  },
  instructions: {
    alignItems: 'center',
    padding: 40,
  },
  instructionIcon: {
    fontSize: 60,
    marginBottom: 16,
  },
  instructionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  instructionText: {
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 22,
  },
  deviceList: {
    flex: 1,
  },
  deviceListContent: {
    padding: 16,
    gap: 12,
  },
  deviceCard: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#0f3460',
  },
  flickerDevice: {
    borderColor: '#3b82f6',
    borderWidth: 2,
  },
  nearbyDevice: {
    backgroundColor: '#1e3a5f',
  },
  deviceMain: {
    flex: 1,
  },
  deviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  deviceIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  deviceId: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  deviceMetrics: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metric: {
    flex: 1,
  },
  metricLabel: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  signalBar: {
    height: 6,
    backgroundColor: '#334155',
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 4,
    marginBottom: 4,
  },
  signalFill: {
    height: '100%',
    borderRadius: 3,
  },
  rssiText: {
    fontSize: 11,
    color: '#64748b',
  },
  flickerBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#3b82f6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  flickerBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  scanningIndicator: {
    alignItems: 'center',
    padding: 40,
  },
  scanningText: {
    color: '#94a3b8',
    marginTop: 16,
    fontSize: 16,
  },
  targetNotice: {
    backgroundColor: '#0f3460',
    padding: 12,
    margin: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3b82f6',
  },
  targetText: {
    color: '#60a5fa',
    textAlign: 'center',
  },
});
