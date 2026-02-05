/**
 * DeliveryTrackingScreen - Real-time delivery tracking for Uber Eats style deliveries
 * Shows current location, route, ETA, and distance to customer
 */

import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import LocationService, { LocationData } from '../services/LocationService';
import axios from 'axios';

const { width } = Dimensions.get('window');

interface DeliveryOrder {
  orderId: string;
  deliveryPersonId: string;
  customerLocation: { latitude: number; longitude: number };
  restaurantLocation: { latitude: number; longitude: number };
  currentLocation: LocationData;
  distanceToCustomer: number;
  distanceToRestaurant: number;
  eta: number;
  status: 'assigned' | 'at_restaurant' | 'picked_up' | 'arriving' | 'completed';
  createdAt: string;
}

export default function DeliveryTrackingScreen({ orderId = 'sample-order-123' }) {
  const [delivery, setDelivery] = useState<DeliveryOrder | null>(null);
  const [location, setLocation] = useState<LocationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isTracking, setIsTracking] = useState(false);
  const locationService = useRef(LocationService.getInstance());

  useEffect(() => {
    initializeDelivery();
    return () => {
      if (isTracking) {
        locationService.current.stopTracking();
      }
    };
  }, []);

  const initializeDelivery = async () => {
    try {
      setLoading(true);
      // Initialize location service
      const authorized = await locationService.current.initialize();
      if (!authorized) {
        Alert.alert('Location Required', 'Please enable location permissions for delivery tracking');
        return;
      }

      // Get initial location
      const initialLocation = await locationService.current.getCurrentLocation();
      setLocation(initialLocation);

      // Create delivery order in backend
      await createDeliveryOrder(initialLocation);

      // Start continuous tracking
      startDeliveryTracking();
    } catch (error) {
      console.error('Delivery initialization error:', error);
      Alert.alert('Error', 'Failed to initialize delivery tracking');
    } finally {
      setLoading(false);
    }
  };

  const createDeliveryOrder = async (currentLocation: LocationData) => {
    try {
      const response = await axios.post(
        'http://localhost:5000/api/delivery/orders',
        {
          orderId,
          deliveryPersonId: 'delivery-person-123', // Replace with actual user ID
          customerId: 'customer-456', // Replace with actual customer ID
          customerLocation: {
            latitude: -26.2041,
            longitude: 28.0473, // Mock Johannesburg location
          },
          restaurantLocation: {
            latitude: -26.1890,
            longitude: 28.0625, // Mock restaurant location
          },
          estimatedDistance: 5000, // 5km estimated
        }
      );

      setDelivery(response.data.data);
    } catch (error) {
      console.error('Error creating delivery order:', error);
    }
  };

  const startDeliveryTracking = () => {
    setIsTracking(true);

    // Subscribe to location updates
    const unsubscribe = locationService.current.onLocationChange(
      async (newLocation: LocationData) => {
        setLocation(newLocation);
        await updateDeliveryLocation(newLocation);
      }
    );

    // Start continuous tracking
    locationService.current.startTracking();
  };

  const updateDeliveryLocation = async (currentLocation: LocationData) => {
    if (!delivery) return;

    try {
      const response = await axios.post(
        `http://localhost:5000/api/delivery/orders/${orderId}/location`,
        {
          deliveryPersonId: 'delivery-person-123',
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
          accuracy: currentLocation.accuracy,
          speed: currentLocation.speed,
          heading: currentLocation.heading,
        }
      );

      setDelivery((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          ...response.data.data,
          currentLocation,
        };
      });
    } catch (error) {
      console.error('Error updating delivery location:', error);
    }
  };

  const completeDelivery = async () => {
    if (!location) return;

    try {
      await axios.put(
        `http://localhost:5000/api/delivery/orders/${orderId}/complete`,
        {
          deliveryPersonId: 'delivery-person-123',
          finalLocation: {
            latitude: location.latitude,
            longitude: location.longitude,
          },
        }
      );

      Alert.alert('Success', 'Delivery completed! Thank you for delivering with us.');
      locationService.current.stopTracking();
      setIsTracking(false);
      setDelivery((prev) => (prev ? { ...prev, status: 'completed' } : null));
    } catch (error) {
      console.error('Error completing delivery:', error);
      Alert.alert('Error', 'Failed to complete delivery');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'at_restaurant':
        return '#FF6B6B';
      case 'picked_up':
        return '#FFA500';
      case 'arriving':
        return '#4CAF50';
      case 'completed':
        return '#2196F3';
      default:
        return '#9C27B0';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'assigned':
        return '📍 Heading to Restaurant';
      case 'at_restaurant':
        return '🏪 At Restaurant (Picking Up)';
      case 'picked_up':
        return '🚴 On the Way';
      case 'arriving':
        return '📌 Arriving Soon';
      case 'completed':
        return '✅ Delivered';
      default:
        return '⏳ Processing';
    }
  };

  if (loading || !delivery || !location) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#9C27B0" />
        <Text style={styles.loadingText}>Initializing delivery tracking...</Text>
      </View>
    );
  }

  const etaMinutes = Math.round(delivery.eta / 60);

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: getStatusColor(delivery.status) }]}>
        <Text style={styles.headerTitle}>Order #{orderId.slice(-6)}</Text>
        <Text style={styles.statusText}>{getStatusLabel(delivery.status)}</Text>
      </View>

      {/* Map Placeholder */}
      <View style={styles.mapPlaceholder}>
        <MaterialIcons name="place" size={48} color="#9C27B0" />
        <Text style={styles.mapText}>📍 Real-time Location Tracking</Text>
        <Text style={styles.mapSubText}>
          {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
        </Text>
      </View>

      {/* ETA Card */}
      <View style={styles.etaCard}>
        <View style={styles.etaContent}>
          <MaterialIcons name="schedule" size={32} color="#FF6B6B" />
          <View style={styles.etaTextContainer}>
            <Text style={styles.etaLabel}>Estimated Arrival</Text>
            <Text style={styles.etaTime}>{etaMinutes} minute{etaMinutes !== 1 ? 's' : ''}</Text>
          </View>
        </View>
      </View>

      {/* Distance Info */}
      <View style={styles.infoSection}>
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <MaterialIcons name="restaurant" size={24} color="#FF6B6B" />
            <View style={styles.infoText}>
              <Text style={styles.infoLabel}>To Restaurant</Text>
              <Text style={styles.infoValue}>
                {(delivery.distanceToRestaurant / 1000).toFixed(1)} km
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <MaterialIcons name="location-on" size={24} color="#4CAF50" />
            <View style={styles.infoText}>
              <Text style={styles.infoLabel}>To Customer</Text>
              <Text style={styles.infoValue}>
                {(delivery.distanceToCustomer / 1000).toFixed(1)} km
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Current Status Details */}
      <View style={styles.detailsSection}>
        <Text style={styles.sectionTitle}>Delivery Details</Text>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Current Speed</Text>
          <Text style={styles.detailValue}>
            {location.speed ? (location.speed * 3.6).toFixed(1) : '0'} km/h
          </Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Location Accuracy</Text>
          <Text style={styles.detailValue}>
            {location.accuracy ? location.accuracy.toFixed(1) : 'N/A'} m
          </Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Altitude</Text>
          <Text style={styles.detailValue}>
            {location.altitude ? location.altitude.toFixed(1) : 'N/A'} m
          </Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Status</Text>
          <Text style={[styles.detailValue, { color: getStatusColor(delivery.status) }]}>
            {delivery.status.replace('_', ' ').toUpperCase()}
          </Text>
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.buttonsContainer}>
        {delivery.status !== 'completed' ? (
          <>
            <TouchableOpacity
              style={[
                styles.button,
                delivery.status === 'arriving' ? styles.buttonPrimary : styles.buttonSecondary,
              ]}
              onPress={completeDelivery}
              disabled={delivery.status !== 'arriving'}
            >
              <MaterialIcons name="check-circle" size={20} color="white" />
              <Text style={styles.buttonText}>Complete Delivery</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.buttonSecondary}
              onPress={() => {
                Alert.alert(
                  'Navigation',
                  'Integrate with Google Maps or Apple Maps for turn-by-turn directions'
                );
              }}
            >
              <MaterialIcons name="directions" size={20} color="white" />
              <Text style={styles.buttonText}>Navigate</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={[styles.button, styles.buttonSuccess]}
            onPress={() => {
              setDelivery(null);
              setIsTracking(false);
            }}
          >
            <MaterialIcons name="done-all" size={20} color="white" />
            <Text style={styles.buttonText}>Delivery Complete ✓</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Live Tracking Status */}
      <View style={styles.trackingStatus}>
        <MaterialIcons
          name="location-on"
          size={16}
          color={isTracking ? '#4CAF50' : '#FF6B6B'}
        />
        <Text style={[styles.trackingText, { color: isTracking ? '#4CAF50' : '#FF6B6B' }]}>
          {isTracking ? '● Live Tracking Active' : '● Tracking Paused'}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 24,
    paddingTop: 32,
    backgroundColor: '#9C27B0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
  },
  statusText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 4,
  },
  mapPlaceholder: {
    margin: 16,
    padding: 24,
    backgroundColor: '#f0e5f5',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#9C27B0',
    marginTop: 8,
  },
  mapSubText: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  etaCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    backgroundColor: 'white',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  etaContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  etaTextContainer: {
    marginLeft: 12,
    flex: 1,
  },
  etaLabel: {
    fontSize: 12,
    color: '#666',
  },
  etaTime: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 4,
  },
  infoSection: {
    marginHorizontal: 16,
    marginBottom: 16,
    gap: 12,
  },
  infoCard: {
    padding: 16,
    backgroundColor: 'white',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoText: {
    marginLeft: 12,
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: '#999',
  },
  infoValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginTop: 4,
  },
  detailsSection: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    backgroundColor: 'white',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  detailLabel: {
    fontSize: 14,
    color: '#666',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  buttonsContainer: {
    marginHorizontal: 16,
    marginBottom: 16,
    gap: 12,
  },
  button: {
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonPrimary: {
    backgroundColor: '#4CAF50',
  },
  buttonSecondary: {
    backgroundColor: '#9C27B0',
  },
  buttonSuccess: {
    backgroundColor: '#2196F3',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  trackingStatus: {
    marginHorizontal: 16,
    marginBottom: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    gap: 6,
  },
  trackingText: {
    fontSize: 12,
    fontWeight: '600',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: '#666',
  },
});
