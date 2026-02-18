/**
 * UWB Scanner Screen - Ultra-Wideband proximity finding
 * Shows distance and direction to target device with cm accuracy
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Animated,
  Vibration,
  Platform,
} from 'react-native';
import uwbService, { UWBRangingData, UWBCapabilities } from '../services/UWBService';

interface UWBScanScreenProps {
  targetDeviceId: string;
  deliveryId: string;
  onClose: () => void;
  onArrived?: () => void;
}

const UWBScanScreen: React.FC<UWBScanScreenProps> = ({
  targetDeviceId,
  deliveryId,
  onClose,
  onArrived
}) => {
  const [isScanning, setIsScanning] = useState(false);
  const [distance, setDistance] = useState<number | null>(null);
  const [direction, setDirection] = useState<number | null>(null);
  const [status, setStatus] = useState<string>('Initializing...');
  const [capabilities, setCapabilities] = useState<UWBCapabilities | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Animation for the radar effect
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const arrowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    initializeUWB();
    return () => {
      uwbService.stopSession();
    };
  }, []);

  // Pulse animation
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
    }
  }, [isScanning]);

  // Arrow rotation animation
  useEffect(() => {
    if (direction !== null) {
      Animated.spring(arrowAnim, {
        toValue: direction,
        useNativeDriver: true,
        tension: 50,
        friction: 7,
      }).start();
    }
  }, [direction]);

  const initializeUWB = async () => {
    try {
      const caps = await uwbService.initialize();
      setCapabilities(caps);

      if (caps.available) {
        setStatus('UWB ready - tap to start');
      } else {
        setStatus(`UWB not available: ${caps.reason}`);
        setError(caps.reason || 'UWB hardware not found');
      }
    } catch (err: any) {
      setError(err.message);
      setStatus('Failed to initialize UWB');
    }
  };

  const startScanning = async () => {
    setIsScanning(true);
    setStatus('Starting UWB session...');
    setError(null);

    const session = await uwbService.startSession(
      deliveryId,
      targetDeviceId,
      handleRangingUpdate
    );

    if (session) {
      setStatus('Scanning for customer...');
    } else {
      setError('Failed to start UWB session');
      setStatus('Session failed - using simulation');
    }
  };

  const handleRangingUpdate = (data: UWBRangingData) => {
    setDistance(data.distance);
    setDirection(data.azimuth);

    // Update status based on distance
    if (data.distance <= 1) {
      setStatus('🎯 ARRIVED! Customer is right here!');
      Vibration.vibrate([0, 500, 100, 500]);
      if (onArrived) {
        onArrived();
      }
    } else if (data.distance <= 5) {
      setStatus('Almost there! Look around');
      Vibration.vibrate(100);
    } else if (data.distance <= 20) {
      setStatus('Getting closer...');
    } else {
      setStatus('Walking towards customer...');
    }
  };

  const stopScanning = () => {
    uwbService.stopSession();
    setIsScanning(false);
    setDistance(null);
    setDirection(null);
    setStatus('Stopped');
  };

  const getDistanceColor = (): string => {
    if (distance === null) return '#666';
    if (distance <= 1) return '#00E676';   // Green - arrived
    if (distance <= 5) return '#FFEB3B';   // Yellow - very close
    if (distance <= 20) return '#FF9800';  // Orange - close
    return '#2196F3';                       // Blue - far
  };

  const getArrowEmoji = (): string => {
    if (direction === null) return '📍';
    const arrows = ['⬆️', '↗️', '➡️', '↘️', '⬇️', '↙️', '⬅️', '↖️'];
    const index = Math.round(direction / 45) % 8;
    return arrows[index];
  };

  const formatDistance = (): string => {
    if (distance === null) return '--';
    if (distance < 1) return `${(distance * 100).toFixed(0)}cm`;
    return `${distance.toFixed(1)}m`;
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Find Customer</Text>
        <Text style={styles.subtitle}>
          {capabilities?.available ? 'UWB Active' : 'Simulation Mode'}
        </Text>
      </View>

      {/* Radar Display */}
      <View style={styles.radarContainer}>
        {isScanning && (
          <Animated.View
            style={[
              styles.radarPulse,
              {
                opacity: pulseAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.5, 0],
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
        )}

        {/* Direction Arrow */}
        <Animated.View
          style={[
            styles.arrowContainer,
            {
              transform: [
                {
                  rotate: arrowAnim.interpolate({
                    inputRange: [0, 360],
                    outputRange: ['0deg', '360deg'],
                  }),
                },
              ],
            },
          ]}
        >
          <Text style={styles.arrow}>{distance !== null ? '↑' : '○'}</Text>
        </Animated.View>

        {/* Distance Display */}
        <View style={[styles.distanceCircle, { borderColor: getDistanceColor() }]}>
          <Text style={[styles.distanceText, { color: getDistanceColor() }]}>
            {formatDistance()}
          </Text>
          <Text style={styles.directionEmoji}>{getArrowEmoji()}</Text>
        </View>
      </View>

      {/* Status */}
      <View style={styles.statusContainer}>
        <Text style={styles.statusText}>{status}</Text>
        {error && !capabilities?.available && (
          <Text style={styles.errorText}>
            Note: Using simulation mode for demo
          </Text>
        )}
      </View>

      {/* Info Panel */}
      <View style={styles.infoPanel}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Distance</Text>
          <Text style={styles.infoValue}>{formatDistance()}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Direction</Text>
          <Text style={styles.infoValue}>
            {direction !== null ? `${direction.toFixed(0)}°` : '--'}
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Accuracy</Text>
          <Text style={styles.infoValue}>
            {capabilities?.accuracyMeters 
              ? `±${(capabilities.accuracyMeters * 100).toFixed(0)}cm` 
              : '--'}
          </Text>
        </View>
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        {!isScanning ? (
          <TouchableOpacity 
            style={styles.startButton} 
            onPress={startScanning}
          >
            <Text style={styles.buttonText}>🎯 Start Finding</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity 
            style={styles.stopButton} 
            onPress={stopScanning}
          >
            <Text style={styles.buttonText}>⏹ Stop</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Capabilities Info */}
      {capabilities && (
        <View style={styles.capsInfo}>
          <Text style={styles.capsText}>
            {capabilities.available 
              ? `📡 ${capabilities.hardwareVersion} | Range: ${capabilities.maxRange}m`
              : '📱 GPS + Bluetooth fallback mode'}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  closeButton: {
    position: 'absolute',
    right: 0,
    top: 0,
    padding: 10,
  },
  closeText: {
    color: '#fff',
    fontSize: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 10,
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    marginTop: 5,
  },
  radarContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 250,
    marginVertical: 20,
  },
  radarPulse: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#2196F3',
  },
  arrowContainer: {
    position: 'absolute',
    width: 200,
    height: 200,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 20,
  },
  arrow: {
    fontSize: 40,
    color: '#00E676',
  },
  distanceCircle: {
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  distanceText: {
    fontSize: 36,
    fontWeight: 'bold',
  },
  directionEmoji: {
    fontSize: 24,
    marginTop: 5,
  },
  statusContainer: {
    alignItems: 'center',
    marginVertical: 15,
  },
  statusText: {
    fontSize: 18,
    color: '#fff',
    textAlign: 'center',
  },
  errorText: {
    fontSize: 12,
    color: '#FF9800',
    marginTop: 5,
  },
  infoPanel: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: 15,
    marginVertical: 15,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  infoLabel: {
    color: '#888',
    fontSize: 14,
  },
  infoValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  controls: {
    marginVertical: 20,
  },
  startButton: {
    backgroundColor: '#00E676',
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
  },
  stopButton: {
    backgroundColor: '#FF5252',
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  capsInfo: {
    alignItems: 'center',
    marginTop: 10,
  },
  capsText: {
    color: '#666',
    fontSize: 12,
  },
});

export default UWBScanScreen;
