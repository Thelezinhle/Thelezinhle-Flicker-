import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
  Clipboard,
  Vibration,
  Modal,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import BluetoothScanScreen from './screens/BluetoothScanScreen';
import bluetoothService, { BluetoothDevice } from './services/BluetoothService';
import { API_BASE, IS_PRODUCTION } from './config';

// Log which environment we're using
console.log(`🌐 Using API: ${API_BASE} (${IS_PRODUCTION ? 'PRODUCTION' : 'DEVELOPMENT'})`);

// ====== TYPES ======
type UserRole = 'sender' | 'receiver' | null;

interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

interface Delivery {
  id: string;
  verificationCode: string;
  status: string;
  description: string;
  senderLocation: LocationData | null;
}

// ====== MAIN APP ======
export default function App() {
  // Role selection
  const [role, setRole] = useState<UserRole>(null);
  
  // User data
  const [userId, setUserId] = useState<string | null>(null);
  
  // Location
  const [location, setLocation] = useState<LocationData | null>(null);
  const [locationError, setLocationError] = useState<string>('');
  const [watchingLocation, setWatchingLocation] = useState(false);
  const locationSubscription = useRef<Location.LocationSubscription | null>(null);
  
  // Delivery
  const [activeDelivery, setActiveDelivery] = useState<Delivery | null>(null);
  const [deliveryDescription, setDeliveryDescription] = useState('');
  const [deliveryIdInput, setDeliveryIdInput] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  
  // UI State
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  // Bluetooth State
  const [showBluetoothScanner, setShowBluetoothScanner] = useState(false);
  const [nearbyDevices, setNearbyDevices] = useState<BluetoothDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<BluetoothDevice | null>(null);
  const [isBluetoothReady, setIsBluetoothReady] = useState(false);

  // ====== BLUETOOTH FUNCTIONS ======
  const initBluetooth = async () => {
    try {
      const status = await bluetoothService.getStatus();
      setIsBluetoothReady(status.isPoweredOn && status.hasPermissions);
    } catch (error) {
      console.log('Bluetooth init error:', error);
      setIsBluetoothReady(false);
    }
  };

  const handleDeviceSelect = (device: BluetoothDevice) => {
    setSelectedDevice(device);
    setShowBluetoothScanner(false);
    Vibration.vibrate(100);
    setStatusMessage(`📶 Device found: ${device.name} (${device.distance.toFixed(1)}m away)`);
    
    // Send device data to backend for proximity verification
    if (activeDelivery) {
      sendBluetoothData(device);
    }
  };

  const sendBluetoothData = async (device: BluetoothDevice) => {
    try {
      await fetch(`${API_BASE}/api/bluetooth/ranging`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deliveryId: activeDelivery?.id,
          deviceId: device.id,
          rssi: device.rssi,
          distance: device.distance,
          signalQuality: device.signalQuality,
          technology: 'bluetooth_le',
          timestamp: new Date().toISOString(),
        }),
      });
    } catch (error) {
      console.log('Failed to send Bluetooth data:', error);
    }
  };

  // Initialize Bluetooth on mount
  useEffect(() => {
    initBluetooth();
  }, []);

  // ====== LOCATION FUNCTIONS ======
  const startLocationTracking = async () => {
    try {
      setLocationError('');
      
      // Request permissions
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationError('Location permission denied. Please enable in settings.');
        return;
      }

      setWatchingLocation(true);
      setStatusMessage('📍 GPS Active - Tracking your location...');

      // Watch position
      locationSubscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 3000,
          distanceInterval: 5,
        },
        (loc: Location.LocationObject) => {
          const newLocation: LocationData = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            accuracy: loc.coords.accuracy || 0,
            timestamp: loc.timestamp,
          };
          setLocation(newLocation);
        }
      );
    } catch (error: any) {
      setLocationError(`Location error: ${error.message}`);
      setWatchingLocation(false);
    }
  };

  const stopLocationTracking = () => {
    if (locationSubscription.current) {
      locationSubscription.current.remove();
      locationSubscription.current = null;
    }
    setWatchingLocation(false);
    setStatusMessage('');
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (locationSubscription.current) {
        locationSubscription.current.remove();
      }
    };
  }, []);

  // ====== API FUNCTIONS ======
  const registerUser = async (selectedRole: UserRole) => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: `device-${selectedRole}-${Date.now()}`,
          role: selectedRole,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setUserId(data.data.userId);
        setRole(selectedRole);
        setStatusMessage(`✅ Registered as ${selectedRole}`);
      } else {
        Alert.alert('Error', 'Failed to register');
      }
    } catch (error: any) {
      Alert.alert('Connection Error', `Could not connect to server.\n\nMake sure:\n1. Backend is running\n2. API_BASE IP is correct: ${API_BASE}`);
    } finally {
      setLoading(false);
    }
  };

  const createDelivery = async () => {
    if (!location) {
      Alert.alert('GPS Required', 'Please enable GPS tracking first');
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/api/delivery/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderId: userId,
          description: deliveryDescription || 'Package Delivery',
          pickupLocation: {
            lat: location.latitude,
            lng: location.longitude,
          },
        }),
      });

      const data = await response.json();
      if (data.success) {
        const delivery: Delivery = {
          id: data.data.deliveryId,
          verificationCode: data.data.verificationCode,
          status: 'CREATED',
          description: deliveryDescription || 'Package Delivery',
          senderLocation: location,
        };
        setActiveDelivery(delivery);
        Vibration.vibrate(200);
        Alert.alert(
          '✅ Delivery Created!',
          `Delivery ID: ${delivery.id}\n\nVerification Code: ${delivery.verificationCode}\n\nShare this code with the receiver!`
        );
      }
    } catch (error: any) {
      Alert.alert('Error', `Failed to create delivery: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const lookupDelivery = async () => {
    if (!deliveryIdInput.trim()) {
      Alert.alert('Error', 'Please enter a Delivery ID');
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/api/delivery/${deliveryIdInput.trim()}`);
      const data = await response.json();

      if (data.success) {
        setActiveDelivery({
          id: data.data.id || data.data.deliveryId,
          verificationCode: '', // Receiver doesn't see this
          status: data.data.status,
          description: data.data.description || 'Package',
          senderLocation: null,
        });
        setStatusMessage('✅ Delivery found! Enter verification code.');
      } else {
        Alert.alert('Not Found', 'Delivery not found. Check the ID.');
      }
    } catch (error: any) {
      Alert.alert('Error', `Failed to lookup delivery: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const verifyDelivery = async () => {
    if (!activeDelivery || !verificationCode.trim()) {
      Alert.alert('Error', 'Please enter the verification code');
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/api/delivery/${activeDelivery.id}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verificationCode: verificationCode.trim().toUpperCase(),
          location: location,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setActiveDelivery(prev => prev ? { ...prev, status: 'VERIFIED' } : null);
        Vibration.vibrate([0, 200, 100, 200]);
        Alert.alert('🎉 Success!', 'Delivery verified successfully!\n\nHandoff complete.');
      } else {
        Alert.alert('Invalid Code', data.message || 'Verification code is incorrect');
      }
    } catch (error: any) {
      Alert.alert('Error', `Verification failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    Clipboard.setString(text);
    setStatusMessage('📋 Copied to clipboard!');
    setTimeout(() => setStatusMessage(''), 2000);
  };

  const resetApp = () => {
    stopLocationTracking();
    setRole(null);
    setUserId(null);
    setLocation(null);
    setActiveDelivery(null);
    setDeliveryDescription('');
    setDeliveryIdInput('');
    setVerificationCode('');
    setStatusMessage('');
  };

  // ====== RENDER: ROLE SELECTION ======
  if (!role) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.roleScreen}>
          <Text style={styles.logo}>🚚</Text>
          <Text style={styles.title}>FlickerSecure</Text>
          <Text style={styles.subtitle}>Secure Delivery Verification</Text>

          <View style={styles.roleCards}>
            <TouchableOpacity
              style={[styles.roleCard, styles.senderCard]}
              onPress={() => registerUser('sender')}
              disabled={loading}
            >
              <Text style={styles.roleIcon}>📤</Text>
              <Text style={styles.roleTitle}>I'm Sending</Text>
              <Text style={styles.roleDesc}>Create delivery & share code</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.roleCard, styles.receiverCard]}
              onPress={() => registerUser('receiver')}
              disabled={loading}
            >
              <Text style={styles.roleIcon}>📥</Text>
              <Text style={styles.roleTitle}>I'm Receiving</Text>
              <Text style={styles.roleDesc}>Enter code to verify</Text>
            </TouchableOpacity>
          </View>

          {loading && (
            <ActivityIndicator size="large" color="#fff" style={{ marginTop: 20 }} />
          )}

          <Text style={styles.serverInfo}>Server: {API_BASE}</Text>
        </View>
      </View>
    );
  }

  // ====== RENDER: SENDER VIEW ======
  if (role === 'sender') {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <ScrollView style={styles.mainView} contentContainerStyle={styles.scrollContent}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>📤 Sender Mode</Text>
            <TouchableOpacity onPress={resetApp} style={styles.exitBtn}>
              <Text style={styles.exitText}>Exit</Text>
            </TouchableOpacity>
          </View>

          {statusMessage ? (
            <View style={styles.statusBanner}>
              <Text style={styles.statusText}>{statusMessage}</Text>
            </View>
          ) : null}

          {/* Step 1: GPS */}
          <View style={styles.stepCard}>
            <Text style={styles.stepNumber}>Step 1</Text>
            <Text style={styles.stepTitle}>📍 Enable GPS</Text>
            
            {!watchingLocation ? (
              <TouchableOpacity style={styles.primaryBtn} onPress={startLocationTracking}>
                <Text style={styles.btnText}>Start GPS Tracking</Text>
              </TouchableOpacity>
            ) : (
              <View>
                <View style={styles.locationBox}>
                  <Text style={styles.locationLabel}>Your Location:</Text>
                  <Text style={styles.locationValue}>
                    {location ? `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}` : 'Getting location...'}
                  </Text>
                  <Text style={styles.accuracy}>
                    {location ? `Accuracy: ±${location.accuracy.toFixed(0)}m` : ''}
                  </Text>
                </View>
                <TouchableOpacity style={styles.stopBtn} onPress={stopLocationTracking}>
                  <Text style={styles.btnText}>Stop GPS</Text>
                </TouchableOpacity>
              </View>
            )}

            {locationError ? <Text style={styles.errorText}>{locationError}</Text> : null}
          </View>

          {/* Step 2: Create Delivery */}
          <View style={styles.stepCard}>
            <Text style={styles.stepNumber}>Step 2</Text>
            <Text style={styles.stepTitle}>📦 Create Delivery</Text>
            
            {!activeDelivery ? (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="What are you sending? (e.g., Documents)"
                  placeholderTextColor="#999"
                  value={deliveryDescription}
                  onChangeText={setDeliveryDescription}
                />
                <TouchableOpacity
                  style={[styles.primaryBtn, !location && styles.disabledBtn]}
                  onPress={createDelivery}
                  disabled={!location || loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.btnText}>Create Delivery Order</Text>
                  )}
                </TouchableOpacity>
                {!location && <Text style={styles.hint}>⚠️ Enable GPS first</Text>}
              </>
            ) : (
              <View style={styles.deliveryCreated}>
                <Text style={styles.successIcon}>✅</Text>
                <Text style={styles.createdText}>Delivery Created!</Text>
                
                <View style={styles.infoRow}>
                  <Text style={styles.label}>Delivery ID:</Text>
                  <TouchableOpacity onPress={() => copyToClipboard(activeDelivery.id)}>
                    <Text style={styles.idValue}>{activeDelivery.id}</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.codeBox}>
                  <Text style={styles.codeLabel}>🔐 VERIFICATION CODE</Text>
                  <TouchableOpacity onPress={() => copyToClipboard(activeDelivery.verificationCode)}>
                    <Text style={styles.codeValue}>{activeDelivery.verificationCode}</Text>
                  </TouchableOpacity>
                  <Text style={styles.codeTip}>Tap to copy • Share with receiver</Text>
                </View>
              </View>
            )}
          </View>

          {/* Step 3: Bluetooth Proximity */}
          {activeDelivery && (
            <View style={styles.stepCard}>
              <Text style={styles.stepNumber}>Step 3</Text>
              <Text style={styles.stepTitle}>📶 Find Receiver (Bluetooth)</Text>
              <Text style={styles.stepDesc}>Scan for nearby devices</Text>
              
              {selectedDevice ? (
                <View style={styles.deviceFound}>
                  <Text style={styles.deviceFoundIcon}>📱</Text>
                  <Text style={styles.deviceFoundName}>{selectedDevice.name}</Text>
                  <Text style={styles.deviceFoundDistance}>
                    {selectedDevice.distance.toFixed(1)}m away • {selectedDevice.signalQuality}% signal
                  </Text>
                  <TouchableOpacity 
                    style={styles.secondaryBtn} 
                    onPress={() => setShowBluetoothScanner(true)}
                  >
                    <Text style={styles.secondaryBtnText}>Scan Again</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity 
                  style={styles.bluetoothBtn} 
                  onPress={() => setShowBluetoothScanner(true)}
                >
                  <Text style={styles.btnText}>🔵 Scan for Devices</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Instructions */}
          <View style={styles.instructionCard}>
            <Text style={styles.instructionTitle}>📋 Next Steps</Text>
            <Text style={styles.instructionText}>
              1. Share the Delivery ID with the receiver{'\n'}
              2. Share the Verification Code (keep secure){'\n'}
              3. Meet at the delivery location{'\n'}
              4. Receiver enters code to verify handoff
            </Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  // ====== RENDER: RECEIVER VIEW ======
  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <ScrollView style={styles.mainView} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>📥 Receiver Mode</Text>
          <TouchableOpacity onPress={resetApp} style={styles.exitBtn}>
            <Text style={styles.exitText}>Exit</Text>
          </TouchableOpacity>
        </View>

        {statusMessage ? (
          <View style={styles.statusBanner}>
            <Text style={styles.statusText}>{statusMessage}</Text>
          </View>
        ) : null}

        {/* GPS (Optional for receiver) */}
        <View style={styles.stepCard}>
          <Text style={styles.stepNumber}>Optional</Text>
          <Text style={styles.stepTitle}>📍 Enable GPS</Text>
          <Text style={styles.stepDesc}>For location verification</Text>
          
          {!watchingLocation ? (
            <TouchableOpacity style={styles.secondaryBtn} onPress={startLocationTracking}>
              <Text style={styles.secondaryBtnText}>Enable GPS</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.locationActive}>
              <Text style={styles.locationActiveText}>✅ GPS Active</Text>
              {location && (
                <Text style={styles.smallLocation}>
                  {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
                </Text>
              )}
            </View>
          )}
        </View>

        {/* Step 1: Enter Delivery ID */}
        {!activeDelivery && (
          <View style={styles.stepCard}>
            <Text style={styles.stepNumber}>Step 1</Text>
            <Text style={styles.stepTitle}>🔍 Find Your Delivery</Text>
            
            <TextInput
              style={styles.input}
              placeholder="Enter Delivery ID from sender"
              placeholderTextColor="#999"
              value={deliveryIdInput}
              onChangeText={setDeliveryIdInput}
              autoCapitalize="characters"
            />
            <TouchableOpacity
              style={[styles.primaryBtn, !deliveryIdInput && styles.disabledBtn]}
              onPress={lookupDelivery}
              disabled={!deliveryIdInput || loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnText}>Find Delivery</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Step 2: Verify */}
        {activeDelivery && activeDelivery.status !== 'VERIFIED' && (
          <View style={styles.stepCard}>
            <Text style={styles.stepNumber}>Step 2</Text>
            <Text style={styles.stepTitle}>✅ Verify Delivery</Text>
            
            <View style={styles.deliveryInfo}>
              <Text style={styles.label}>Delivery ID:</Text>
              <Text style={styles.value}>{activeDelivery.id}</Text>
              <Text style={styles.label}>Status:</Text>
              <Text style={[styles.value, styles.statusPending]}>{activeDelivery.status}</Text>
            </View>

            <TextInput
              style={[styles.input, styles.codeInput]}
              placeholder="Enter verification code"
              placeholderTextColor="#999"
              value={verificationCode}
              onChangeText={(text: string) => setVerificationCode(text.toUpperCase())}
              autoCapitalize="characters"
              maxLength={6}
            />

            {/* Bluetooth Proximity - Receiver */}
            <View style={styles.bluetoothSection}>
              <Text style={styles.bluetoothLabel}>📶 Optional: Verify via Bluetooth</Text>
              {selectedDevice ? (
                <View style={styles.deviceFoundSmall}>
                  <Text style={styles.deviceSmallText}>
                    ✅ Connected to {selectedDevice.name} ({selectedDevice.distance.toFixed(1)}m)
                  </Text>
                </View>
              ) : (
                <TouchableOpacity 
                  style={styles.bluetoothSmallBtn} 
                  onPress={() => setShowBluetoothScanner(true)}
                >
                  <Text style={styles.bluetoothSmallBtnText}>Scan for Sender</Text>
                </TouchableOpacity>
              )}
            </View>
            
            <TouchableOpacity
              style={[styles.verifyBtn, !verificationCode && styles.disabledBtn]}
              onPress={verifyDelivery}
              disabled={!verificationCode || loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnText}>✅ Verify & Complete</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Success */}
        {activeDelivery?.status === 'VERIFIED' && (
          <View style={styles.successCard}>
            <Text style={styles.successBigIcon}>🎉</Text>
            <Text style={styles.successTitle}>Delivery Verified!</Text>
            <Text style={styles.successDesc}>
              Handoff completed successfully.{'\n'}
              You can now receive your package.
            </Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={resetApp}>
              <Text style={styles.btnText}>Done</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Instructions */}
        <View style={styles.instructionCard}>
          <Text style={styles.instructionTitle}>📋 How to Receive</Text>
          <Text style={styles.instructionText}>
            1. Get the Delivery ID from sender{'\n'}
            2. Enter it above to find your delivery{'\n'}
            3. Ask sender for the verification code{'\n'}
            4. Enter code to confirm handoff
          </Text>
        </View>
      </ScrollView>

      {/* Bluetooth Scanner Modal */}
      <Modal
        visible={showBluetoothScanner}
        animationType="slide"
        onRequestClose={() => setShowBluetoothScanner(false)}
      >
        <BluetoothScanScreen
          onDeviceSelect={handleDeviceSelect}
          targetDeviceId={activeDelivery?.id}
          onClose={() => setShowBluetoothScanner(false)}
        />
      </Modal>
    </View>
  );
}

// ====== STYLES ======
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  // Role Selection Screen
  roleScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  logo: {
    fontSize: 80,
    marginBottom: 10,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 16,
    color: '#94a3b8',
    marginBottom: 40,
  },
  roleCards: {
    flexDirection: 'row',
    gap: 15,
  },
  roleCard: {
    width: 150,
    padding: 25,
    borderRadius: 16,
    alignItems: 'center',
  },
  senderCard: {
    backgroundColor: '#3b82f6',
  },
  receiverCard: {
    backgroundColor: '#22c55e',
  },
  roleIcon: {
    fontSize: 40,
    marginBottom: 10,
  },
  roleTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 5,
  },
  roleDesc: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
  },
  serverInfo: {
    position: 'absolute',
    bottom: 30,
    color: '#64748b',
    fontSize: 12,
  },
  // Main Views
  mainView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  exitBtn: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
  },
  exitText: {
    color: '#ef4444',
    fontWeight: '600',
  },
  statusBanner: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    padding: 12,
    borderRadius: 8,
    marginBottom: 15,
  },
  statusText: {
    color: '#86efac',
    textAlign: 'center',
    fontWeight: '500',
  },
  // Step Cards
  stepCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  stepNumber: {
    fontSize: 12,
    color: '#3b82f6',
    fontWeight: '600',
    marginBottom: 5,
  },
  stepTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 15,
  },
  stepDesc: {
    color: '#94a3b8',
    marginBottom: 15,
    marginTop: -10,
  },
  // Buttons
  primaryBtn: {
    backgroundColor: '#3b82f6',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#3b82f6',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: '#3b82f6',
    fontWeight: '600',
    fontSize: 16,
  },
  stopBtn: {
    backgroundColor: '#ef4444',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  verifyBtn: {
    backgroundColor: '#22c55e',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  disabledBtn: {
    opacity: 0.5,
  },
  btnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  // Input
  input: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 12,
    padding: 16,
    color: '#fff',
    fontSize: 16,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  codeInput: {
    fontSize: 24,
    textAlign: 'center',
    letterSpacing: 5,
    fontWeight: 'bold',
  },
  // Location
  locationBox: {
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
  },
  locationLabel: {
    color: '#94a3b8',
    fontSize: 12,
    marginBottom: 5,
  },
  locationValue: {
    color: '#86efac',
    fontSize: 16,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  accuracy: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 5,
  },
  locationActive: {
    alignItems: 'center',
  },
  locationActiveText: {
    color: '#86efac',
    fontWeight: '600',
  },
  smallLocation: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 3,
  },
  // Delivery Created
  deliveryCreated: {
    alignItems: 'center',
  },
  successIcon: {
    fontSize: 50,
    marginBottom: 10,
  },
  createdText: {
    color: '#86efac',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  label: {
    color: '#94a3b8',
    marginRight: 8,
  },
  idValue: {
    color: '#fff',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  codeBox: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    borderWidth: 2,
    borderColor: '#f59e0b',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    width: '100%',
  },
  codeLabel: {
    color: '#fcd34d',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 10,
  },
  codeValue: {
    color: '#fbbf24',
    fontSize: 36,
    fontWeight: 'bold',
    letterSpacing: 8,
  },
  codeTip: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 10,
  },
  // Delivery Info (Receiver)
  deliveryInfo: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
  },
  value: {
    color: '#fff',
    fontWeight: '600',
    marginBottom: 10,
  },
  statusPending: {
    color: '#fbbf24',
  },
  // Success
  successCard: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderRadius: 16,
    padding: 30,
    alignItems: 'center',
    marginBottom: 15,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  successBigIcon: {
    fontSize: 70,
    marginBottom: 15,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#86efac',
    marginBottom: 10,
  },
  successDesc: {
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  // Instructions
  instructionCard: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 12,
    padding: 20,
    marginBottom: 30,
  },
  instructionTitle: {
    color: '#60a5fa',
    fontWeight: '600',
    marginBottom: 10,
  },
  instructionText: {
    color: '#94a3b8',
    lineHeight: 24,
  },
  // Misc
  hint: {
    color: '#fbbf24',
    fontSize: 13,
    marginTop: 10,
    textAlign: 'center',
  },
  errorText: {
    color: '#ef4444',
    marginTop: 10,
  },
  // Bluetooth Styles
  bluetoothBtn: {
    backgroundColor: '#3b82f6',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  deviceFound: {
    alignItems: 'center',
    backgroundColor: 'rgba(74, 222, 128, 0.1)',
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#4ade80',
  },
  deviceFoundIcon: {
    fontSize: 40,
    marginBottom: 10,
  },
  deviceFoundName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  deviceFoundDistance: {
    color: '#4ade80',
    fontSize: 14,
    marginBottom: 15,
  },
  bluetoothSection: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
  },
  bluetoothLabel: {
    color: '#60a5fa',
    fontSize: 14,
    marginBottom: 10,
  },
  deviceFoundSmall: {
    backgroundColor: 'rgba(74, 222, 128, 0.2)',
    padding: 10,
    borderRadius: 8,
  },
  deviceSmallText: {
    color: '#4ade80',
    fontSize: 13,
    textAlign: 'center',
  },
  bluetoothSmallBtn: {
    backgroundColor: 'rgba(59, 130, 246, 0.3)',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  bluetoothSmallBtnText: {
    color: '#60a5fa',
    fontSize: 14,
    fontWeight: '600',
  },
});
