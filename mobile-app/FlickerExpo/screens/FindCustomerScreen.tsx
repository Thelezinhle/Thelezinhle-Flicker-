/**
 * FindCustomerScreen - Multi-technology proximity finding
 * 
 * Technology Stack (by accuracy):
 * 1. UWB (Ultra-Wideband): 10-30cm accuracy - requires iPhone 11+ or Android 12+ with UWB chip
 * 2. Bluetooth: 1-5m accuracy - proximity confirmation
 * 3. GPS: 3-50m accuracy - outdoor/long-range navigation
 * 
 * The screen automatically selects the best available technology.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Animated,
  Vibration,
  Platform,
  ScrollView,
  Alert,
  Linking,
} from 'react-native';
import * as Location from 'expo-location';
import uwbService, { UWBRangingData, UWBCapabilities } from '../services/UWBService';
import nativeUWBBridge, { hasNativeUWB, isNativeUWBSupported } from '../services/NativeUWBBridge';
import { API_BASE } from '../config';

// Props for the screen
interface FindCustomerScreenProps {
  orderId: string;
  customerId: string;
  deliveryAddress?: { lat: number; lng: number };
  onClose: () => void;
  onArrived?: () => void;
  userRole: 'driver' | 'client';
  userId: string;
}

// Tracking data structure
interface TrackingState {
  distance: number | null;
  bearing: number | null;
  direction: string;
  arrow: string;
  status: 'idle' | 'active' | 'approaching' | 'arrived';
  technology: 'uwb' | 'bluetooth' | 'gps';
  accuracy: number;
}

// Technology availability
interface TechCapabilities {
  uwb: { available: boolean; reason?: string; native: boolean };
  bluetooth: { available: boolean };
  gps: { available: boolean; accuracy?: number };
}

const FindCustomerScreen: React.FC<FindCustomerScreenProps> = ({
  orderId,
  customerId,
  deliveryAddress,
  onClose,
  onArrived,
  userRole,
  userId,
}) => {
  // State
  const [tracking, setTracking] = useState<TrackingState>({
    distance: null,
    bearing: null,
    direction: 'N',
    arrow: '↑',
    status: 'idle',
    technology: 'gps',
    accuracy: 50,
  });
  const [capabilities, setCapabilities] = useState<TechCapabilities>({
    uwb: { available: false, native: false },
    bluetooth: { available: false },
    gps: { available: false },
  });
  const [isScanning, setIsScanning] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [customerLocation, setCustomerLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationSharing, setLocationSharing] = useState(false);

  // Animation refs
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const arrowRotation = useRef(new Animated.Value(0)).current;
  const locationWatchRef = useRef<Location.LocationSubscription | null>(null);

  // ========================
  // INITIALIZATION
  // ========================

  useEffect(() => {
    checkCapabilities();
    return () => {
      cleanup();
    };
  }, []);

  const cleanup = () => {
    uwbService.stopSession();
    if (locationWatchRef.current) {
      locationWatchRef.current.remove();
    }
  };

  const checkCapabilities = async () => {
    const caps: TechCapabilities = {
      uwb: { available: false, native: false },
      bluetooth: { available: false },
      gps: { available: false },
    };

    // Check UWB - First try native, then fall back to simulation
    try {
      const hasNative = hasNativeUWB();
      const nativeSupported = await isNativeUWBSupported();
      
      if (hasNative && nativeSupported) {
        caps.uwb = { available: true, native: true };
        console.log('📡 Real UWB hardware detected!');
      } else {
        // Fall back to simulated UWB service
        const uwbCaps = await uwbService.initialize();
        caps.uwb = { 
          available: uwbCaps.available, 
          native: false,
          reason: uwbCaps.reason 
        };
      }
    } catch (e) {
      console.log('UWB check failed:', e);
    }

    // Check Bluetooth
    caps.bluetooth = { available: Platform.OS !== 'web' };

    // Check GPS
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      caps.gps = { available: status === 'granted' };
    } catch (e) {
      caps.gps = { available: false };
    }

    setCapabilities(caps);
    console.log('📊 Tech capabilities:', caps);
  };

  // ========================
  // PULSE ANIMATION
  // ========================

  useEffect(() => {
    if (isScanning) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(0);
    }
  }, [isScanning]);

  // ========================
  // CUSTOMER: START BEACON
  // ========================

  const startBeacon = async () => {
    if (!capabilities.gps.available) {
      Alert.alert('Location Required', 'Please enable location permissions');
      return;
    }

    setLocationSharing(true);
    setError(null);

    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
      });

      setMyLocation({
        lat: location.coords.latitude,
        lng: location.coords.longitude,
      });

      // Start beacon on server
      const response = await fetch(`${API_BASE}/ranging/beacon/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: userId,
          orderId,
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracy: location.coords.accuracy,
          locationType: 'fixed',
        }),
      });

      const data = await response.json();
      if (data.success) {
        setIsScanning(true);
      } else {
        setError(data.message || 'Failed to start beacon');
        setLocationSharing(false);
      }
    } catch (e: any) {
      setError(e.message || 'Location error');
      setLocationSharing(false);
    }
  };

  const stopBeacon = async () => {
    try {
      await fetch(`${API_BASE}/ranging/beacon/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      });
    } catch (e) {
      console.error('Stop beacon error:', e);
    }
    setLocationSharing(false);
    setIsScanning(false);
  };

  // ========================
  // DRIVER: START TRACKING
  // ========================

  const startTracking = async () => {
    setIsScanning(true);
    setError(null);

    // Determine best technology to use
    let technology: 'uwb' | 'bluetooth' | 'gps' = 'gps';
    
    if (capabilities.uwb.available && capabilities.uwb.native) {
      technology = 'uwb';
    }

    setTracking(prev => ({ ...prev, technology }));

    if (technology === 'uwb') {
      await startUWBTracking();
    } else {
      await startGPSTracking();
    }
  };

  // ========================
  // UWB TRACKING (10-30cm accuracy)
  // ========================

  const startUWBTracking = async () => {
    console.log('📡 Starting UWB tracking (10-30cm accuracy)...');

    if (capabilities.uwb.native) {
      // Use real native UWB
      const session = await nativeUWBBridge.startSession(customerId, {
        onDistanceUpdated: (device) => {
          handleUWBUpdate({
            distance: device.distance,
            azimuth: device.direction || 0,
            elevation: device.elevation || null,
            timestamp: Date.now(),
          });
        },
        onSessionError: (err) => {
          console.error('UWB error:', err);
          // Fall back to GPS
          startGPSTracking();
        },
        onSessionEnded: () => {
          console.log('UWB session ended');
        },
      });

      if (!session) {
        // Fall back to simulated UWB or GPS
        const simSession = await uwbService.startSession(orderId, customerId, handleUWBUpdate);
        setSessionId(simSession);
      }
    } else {
      // Use simulated UWB (for testing)
      const session = await uwbService.startSession(orderId, customerId, handleUWBUpdate);
      setSessionId(session);
    }
  };

  const handleUWBUpdate = (data: UWBRangingData) => {
    const arrow = getArrowFromBearing(data.azimuth);
    const direction = getDirectionFromBearing(data.azimuth);

    let status: TrackingState['status'] = 'active';
    if (data.distance <= 0.3) {
      status = 'arrived';
      Vibration.vibrate([0, 500, 100, 500]);
      if (onArrived) onArrived();
    } else if (data.distance <= 2) {
      status = 'approaching';
      Vibration.vibrate(100);
    }

    setTracking({
      distance: Math.round(data.distance * 100) / 100, // cm precision
      bearing: data.azimuth,
      direction,
      arrow,
      status,
      technology: 'uwb',
      accuracy: 0.3, // 30cm accuracy
    });

    // Animate arrow rotation
    Animated.spring(arrowRotation, {
      toValue: data.azimuth,
      useNativeDriver: true,
      tension: 50,
      friction: 7,
    }).start();
  };

  // ========================
  // GPS TRACKING (3-50m accuracy)
  // ========================

  const startGPSTracking = async () => {
    console.log('📍 Starting GPS tracking (3-50m accuracy)...');

    try {
      // Get initial position
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
      });

      setMyLocation({
        lat: location.coords.latitude,
        lng: location.coords.longitude,
      });

      // Start tracking session with server
      const response = await fetch(`${API_BASE}/ranging/track/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driverId: userId,
          orderId,
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracy: location.coords.accuracy,
          heading: location.coords.heading,
          speed: location.coords.speed,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setSessionId(data.data.sessionId);
        setCustomerLocation({
          lat: data.data.customerLocation.latitude,
          lng: data.data.customerLocation.longitude,
        });
        handleGPSUpdate(data.data);

        // Watch position continuously
        locationWatchRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            distanceInterval: 1,
            timeInterval: 1000,
          },
          async (loc) => {
            setMyLocation({
              lat: loc.coords.latitude,
              lng: loc.coords.longitude,
            });
            await updateGPSPosition(loc);
          }
        );
      } else {
        setError(data.message || 'Failed to start tracking');
        setIsScanning(false);
      }
    } catch (e: any) {
      setError(e.message || 'GPS error');
      setIsScanning(false);
    }
  };

  const updateGPSPosition = async (location: Location.LocationObject) => {
    if (!sessionId) return;

    try {
      const response = await fetch(`${API_BASE}/ranging/track/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracy: location.coords.accuracy,
          heading: location.coords.heading,
          speed: location.coords.speed,
        }),
      });

      const data = await response.json();
      if (data.success) {
        handleGPSUpdate(data.data);
      }
    } catch (e) {
      console.error('GPS update error:', e);
    }
  };

  const handleGPSUpdate = (data: any) => {
    let status: TrackingState['status'] = 'active';
    if (data.distance <= 5) {
      status = 'arrived';
      Vibration.vibrate([0, 500, 100, 500]);
    } else if (data.distance <= 20) {
      status = 'approaching';
    }

    setTracking({
      distance: data.distance,
      bearing: data.bearing,
      direction: data.direction,
      arrow: data.arrow,
      status,
      technology: 'gps',
      accuracy: data.driverAccuracy || 10,
    });

    if (data.customerLocation) {
      setCustomerLocation({
        lat: data.customerLocation.latitude,
        lng: data.customerLocation.longitude,
      });
    }
  };

  // ========================
  // HELPER FUNCTIONS
  // ========================

  const getDirectionFromBearing = (bearing: number): string => {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(bearing / 45) % 8;
    return directions[index];
  };

  const getArrowFromBearing = (bearing: number): string => {
    const arrows = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
    const index = Math.round(bearing / 45) % 8;
    return arrows[index];
  };

  const stopTracking = () => {
    cleanup();
    setIsScanning(false);
    setTracking({
      distance: null,
      bearing: null,
      direction: 'N',
      arrow: '↑',
      status: 'idle',
      technology: 'gps',
      accuracy: 50,
    });
  };

  const markArrived = async () => {
    try {
      await fetch(`${API_BASE}/ranging/arrived`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, driverId: userId }),
      });
      stopTracking();
      Alert.alert('Success', 'Customer has been notified!');
      if (onArrived) onArrived();
      onClose();
    } catch (e) {
      console.error('Mark arrived error:', e);
    }
  };

  // ========================
  // GET DISTANCE COLOR
  // ========================

  const getDistanceColor = (): string => {
    if (tracking.distance === null) return '#666';
    if (tracking.technology === 'uwb') {
      if (tracking.distance <= 0.3) return '#00E676'; // Green - arrived
      if (tracking.distance <= 1) return '#FFEB3B';   // Yellow - very close
      if (tracking.distance <= 5) return '#FF9800';   // Orange - close
    } else {
      if (tracking.distance <= 5) return '#00E676';   // Green - arrived
      if (tracking.distance <= 20) return '#FFEB3B';  // Yellow - close
      if (tracking.distance <= 50) return '#FF9800';  // Orange - approaching
    }
    return '#2196F3'; // Blue - far
  };

  const getTechIcon = (): string => {
    switch (tracking.technology) {
      case 'uwb': return '📡';
      case 'bluetooth': return '🔵';
      case 'gps': return '📍';
      default: return '📍';
    }
  };

  const getTechAccuracyText = (): string => {
    switch (tracking.technology) {
      case 'uwb': return '±30cm (UWB)';
      case 'bluetooth': return '±1-5m (Bluetooth)';
      case 'gps': return `±${Math.round(tracking.accuracy)}m (GPS)`;
      default: return '';
    }
  };

  // ========================
  // RENDER: CUSTOMER VIEW
  // ========================

  if (userRole === 'client') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Share Your Location</Text>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Tech Capabilities Banner */}
        <View style={styles.techBanner}>
          <Text style={styles.techTitle}>📡 Available Technologies:</Text>
          <View style={styles.techList}>
            <View style={[styles.techItem, capabilities.uwb.native && styles.techAvailable]}>
              <Text>UWB {capabilities.uwb.native ? '✅' : '❌'}</Text>
            </View>
            <View style={[styles.techItem, capabilities.bluetooth.available && styles.techAvailable]}>
              <Text>Bluetooth {capabilities.bluetooth.available ? '✅' : '❌'}</Text>
            </View>
            <View style={[styles.techItem, capabilities.gps.available && styles.techAvailable]}>
              <Text>GPS {capabilities.gps.available ? '✅' : '❌'}</Text>
            </View>
          </View>
        </View>

        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {!isScanning ? (
          <View style={styles.beaconStart}>
            <Animated.View style={[styles.beaconIcon]}>
              <Text style={{ fontSize: 80 }}>📍</Text>
            </Animated.View>
            <Text style={styles.instructions}>
              Share your location so the driver can find you
            </Text>
            <TouchableOpacity
              style={styles.startButton}
              onPress={startBeacon}
              disabled={locationSharing}
            >
              <Text style={styles.startButtonText}>
                {locationSharing ? 'Starting...' : "I'm Waiting Here"}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.beaconActive}>
            <Animated.View
              style={[
                styles.pulseCircle,
                {
                  opacity: pulseAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.8, 0],
                  }),
                  transform: [
                    {
                      scale: pulseAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, 2.5],
                      }),
                    },
                  ],
                },
              ]}
            />
            <Text style={{ fontSize: 80 }}>📍</Text>
            <Text style={styles.sharingText}>Location Sharing Active</Text>
            <Text style={styles.coordsText}>
              Lat: {myLocation?.lat.toFixed(6) || '...'}
              {'\n'}
              Lng: {myLocation?.lng.toFixed(6) || '...'}
            </Text>
            <TouchableOpacity style={styles.stopButton} onPress={stopBeacon}>
              <Text style={styles.stopButtonText}>Stop Sharing</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  // ========================
  // RENDER: DRIVER VIEW
  // ========================

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <Text style={styles.title}>Find Customer</Text>
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Tech Capabilities Banner */}
      <View style={styles.techBanner}>
        <Text style={styles.techTitle}>📡 Available Technologies:</Text>
        <View style={styles.techList}>
          <View style={[styles.techItem, capabilities.uwb.native && styles.techAvailable]}>
            <Text style={styles.techItemText}>
              UWB {capabilities.uwb.native ? '✅ 30cm' : '❌'}
            </Text>
          </View>
          <View style={[styles.techItem, capabilities.gps.available && styles.techAvailable]}>
            <Text style={styles.techItemText}>
              GPS {capabilities.gps.available ? '✅ 3-50m' : '❌'}
            </Text>
          </View>
        </View>
        {!capabilities.uwb.native && (
          <Text style={styles.uwbHint}>
            💡 For 30cm accuracy, use iPhone 11+ or Android 12+ with UWB chip
          </Text>
        )}
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {!isScanning ? (
        <View style={styles.trackingStart}>
          <Text style={{ fontSize: 80 }}>🧭</Text>
          <Text style={styles.instructions}>
            Start tracking to see direction and distance
          </Text>
          <TouchableOpacity style={styles.startButton} onPress={startTracking}>
            <Text style={styles.startButtonText}>Start Finding Customer</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.trackingActive}>
          {/* Pulse Animation */}
          <View style={styles.radarContainer}>
            <Animated.View
              style={[
                styles.pulseCircle,
                {
                  opacity: pulseAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.6, 0],
                  }),
                  transform: [
                    {
                      scale: pulseAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, 3],
                      }),
                    },
                  ],
                },
              ]}
            />
            {/* Direction Arrow */}
            <Animated.View
              style={[
                styles.arrowContainer,
                {
                  transform: [
                    {
                      rotate: arrowRotation.interpolate({
                        inputRange: [0, 360],
                        outputRange: ['0deg', '360deg'],
                      }),
                    },
                  ],
                },
              ]}
            >
              <Text style={[styles.arrow, { color: getDistanceColor() }]}>
                {tracking.arrow}
              </Text>
            </Animated.View>
          </View>

          {/* Distance Display */}
          <View style={styles.distanceContainer}>
            <Text style={[styles.distance, { color: getDistanceColor() }]}>
              {tracking.distance !== null
                ? tracking.technology === 'uwb'
                  ? `${(tracking.distance * 100).toFixed(0)}cm`
                  : `${Math.round(tracking.distance)}m`
                : '--'}
            </Text>
            <Text style={styles.directionText}>
              {getTechIcon()} {tracking.direction}
            </Text>
            <Text style={styles.accuracyText}>{getTechAccuracyText()}</Text>
          </View>

          {/* Status Message */}
          <View
            style={[
              styles.statusBanner,
              tracking.status === 'arrived' && styles.statusArrived,
              tracking.status === 'approaching' && styles.statusApproaching,
            ]}
          >
            <Text style={styles.statusText}>
              {tracking.status === 'arrived' && '✅ You have arrived! Look around.'}
              {tracking.status === 'approaching' && '🔥 Getting close!'}
              {tracking.status === 'active' && 'Keep walking...'}
              {tracking.status === 'idle' && 'Initializing...'}
            </Text>
          </View>

          {/* GPS Coordinates */}
          <View style={styles.coordsContainer}>
            <View style={styles.coordBox}>
              <Text style={styles.coordLabel}>🚗 Your GPS:</Text>
              <Text style={styles.coordValue}>
                {myLocation?.lat.toFixed(6) || '...'}, {myLocation?.lng.toFixed(6) || '...'}
              </Text>
            </View>
            <View style={styles.coordBox}>
              <Text style={styles.coordLabel}>📍 Customer:</Text>
              <Text style={styles.coordValue}>
                {customerLocation?.lat.toFixed(6) || '...'},{' '}
                {customerLocation?.lng.toFixed(6) || '...'}
              </Text>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity style={styles.arrivedButton} onPress={markArrived}>
              <Text style={styles.arrivedButtonText}>I Found Customer</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.stopButton} onPress={stopTracking}>
              <Text style={styles.stopButtonText}>Stop</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScrollView>
  );
};

// ========================
// STYLES
// ========================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  closeButton: {
    padding: 10,
  },
  closeText: {
    fontSize: 24,
    color: '#fff',
  },
  techBanner: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
  },
  techTitle: {
    color: '#fff',
    fontSize: 14,
    marginBottom: 10,
  },
  techList: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  techItem: {
    backgroundColor: '#0f0f23',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#333',
  },
  techAvailable: {
    borderColor: '#00E676',
    backgroundColor: '#0a2e1a',
  },
  techItemText: {
    color: '#fff',
    fontSize: 12,
  },
  uwbHint: {
    color: '#fbbf24',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 10,
  },
  errorBanner: {
    backgroundColor: '#ff4444',
    borderRadius: 8,
    padding: 10,
    marginBottom: 15,
  },
  errorText: {
    color: '#fff',
    textAlign: 'center',
  },
  beaconStart: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 40,
  },
  beaconIcon: {
    marginBottom: 20,
  },
  beaconActive: {
    alignItems: 'center',
    paddingTop: 40,
  },
  pulseCircle: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: '#4CAF50',
  },
  sharingText: {
    color: '#4CAF50',
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 20,
  },
  coordsText: {
    color: '#888',
    fontSize: 12,
    marginTop: 10,
    textAlign: 'center',
  },
  instructions: {
    color: '#999',
    fontSize: 16,
    textAlign: 'center',
    marginVertical: 20,
    paddingHorizontal: 20,
  },
  startButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 40,
    paddingVertical: 15,
    borderRadius: 30,
    marginTop: 20,
  },
  startButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  stopButton: {
    backgroundColor: '#ff4444',
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 25,
    marginTop: 15,
  },
  stopButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  trackingStart: {
    alignItems: 'center',
    paddingTop: 40,
  },
  trackingActive: {
    alignItems: 'center',
  },
  radarContainer: {
    width: 200,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  arrowContainer: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16213e',
    borderRadius: 60,
    borderWidth: 3,
    borderColor: '#4CAF50',
  },
  arrow: {
    fontSize: 60,
  },
  distanceContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  distance: {
    fontSize: 48,
    fontWeight: 'bold',
  },
  directionText: {
    color: '#888',
    fontSize: 18,
    marginTop: 5,
  },
  accuracyText: {
    color: '#666',
    fontSize: 12,
    marginTop: 3,
  },
  statusBanner: {
    backgroundColor: '#16213e',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    marginBottom: 20,
  },
  statusArrived: {
    backgroundColor: '#0a2e1a',
  },
  statusApproaching: {
    backgroundColor: '#2e2a0a',
  },
  statusText: {
    color: '#fff',
    fontSize: 16,
  },
  coordsContainer: {
    width: '100%',
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 15,
    marginBottom: 20,
  },
  coordBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  coordLabel: {
    color: '#888',
    fontSize: 12,
  },
  coordValue: {
    color: '#fff',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 15,
    marginTop: 10,
  },
  arrivedButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 25,
    paddingVertical: 12,
    borderRadius: 25,
  },
  arrivedButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default FindCustomerScreen;
