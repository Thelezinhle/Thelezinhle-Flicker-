/**
 * LocationService - Real-time GPS tracking for delivery apps
 * Handles continuous location tracking, background updates, and geofencing
 * Optimized for Uber Eats style delivery tracking
 */

import * as Location from 'expo-location';
import { AppState, AppStateStatus } from 'react-native';

export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  altitude: number | null;
  altitudeAccuracy: number | null;
  heading: number | null;
  speed: number | null;
  timestamp: number;
}

export interface DeliveryLocation {
  orderId: string;
  deliveryPersonId: string;
  customerLocation: { latitude: number; longitude: number };
  restaurantLocation: { latitude: number; longitude: number };
  currentLocation: LocationData;
  distanceToCustomer: number; // in meters
  distanceToRestaurant: number; // in meters
  eta: number; // in seconds
  status: 'picking_up' | 'in_transit' | 'arriving' | 'delivered';
}

class LocationService {
  private static instance: LocationService;
  private locationSubscription: Location.LocationSubscription | null = null;
  private appState = AppState.currentState;
  private isTracking = false;
  private locationUpdateCallbacks: ((location: LocationData) => void)[] = [];
  private backgroundTaskId: string | null = null;

  private constructor() {
    // Subscribe to app state changes
    AppState.addEventListener('change', this.handleAppStateChange);
  }

  static getInstance(): LocationService {
    if (!LocationService.instance) {
      LocationService.instance = new LocationService();
    }
    return LocationService.instance;
  }

  /**
   * Initialize location services and request permissions
   */
  async initialize(): Promise<boolean> {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      
      if (status !== 'granted') {
        console.warn('Foreground location permission denied');
        return false;
      }

      // Request background permission for continuous tracking
      const bgStatus = await Location.requestBackgroundPermissionsAsync();
      if (bgStatus.status !== 'granted') {
        console.warn('Background location permission denied');
      }

      return true;
    } catch (error) {
      console.error('Failed to initialize location service:', error);
      return false;
    }
  }

  /**
   * Start continuous location tracking
   * Updates location every 5 seconds with high accuracy
   */
  async startTracking(): Promise<void> {
    if (this.isTracking) {
      console.warn('Location tracking already active');
      return;
    }

    try {
      this.isTracking = true;

      // Stop any existing subscription
      if (this.locationSubscription) {
        this.locationSubscription.remove();
      }

      // High accuracy tracking for delivery apps (every 5 seconds)
      this.locationSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 5000, // Update every 5 seconds
          distanceInterval: 10, // Or when moved 10 meters
        },
        (location) => {
          const locationData: LocationData = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            accuracy: location.coords.accuracy,
            altitude: location.coords.altitude,
            altitudeAccuracy: location.coords.altitudeAccuracy,
            heading: location.coords.heading,
            speed: location.coords.speed,
            timestamp: location.timestamp,
          };

          // Notify all subscribers
          this.notifyLocationUpdate(locationData);
        }
      );

      console.log('✅ Location tracking started');
    } catch (error) {
      console.error('Failed to start location tracking:', error);
      this.isTracking = false;
      throw error;
    }
  }

  /**
   * Stop location tracking
   */
  stopTracking(): void {
    if (this.locationSubscription) {
      this.locationSubscription.remove();
      this.locationSubscription = null;
    }
    this.isTracking = false;
    console.log('⏹️ Location tracking stopped');
  }

  /**
   * Get current location once
   */
  async getCurrentLocation(): Promise<LocationData> {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      
      if (status !== 'granted') {
        throw new Error('Location permission not granted');
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
      });

      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy,
        altitude: location.coords.altitude,
        altitudeAccuracy: location.coords.altitudeAccuracy,
        heading: location.coords.heading,
        speed: location.coords.speed,
        timestamp: location.timestamp,
      };
    } catch (error) {
      console.error('Failed to get current location:', error);
      throw error;
    }
  }

  /**
   * Calculate distance between two coordinates (Haversine formula)
   * Returns distance in meters
   */
  static calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) *
      Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Calculate ETA in seconds based on current speed and distance
   */
  static calculateETA(
    distanceMeters: number,
    speedMPS: number | null
  ): number {
    // If no speed data, estimate 10 m/s (36 km/h) for delivery
    const speed = speedMPS && speedMPS > 0 ? speedMPS : 10;
    return Math.round(distanceMeters / speed);
  }

  /**
   * Check if location is within a geofence radius
   */
  static isWithinGeofence(
    currentLat: number,
    currentLng: number,
    fenceLat: number,
    fenceLng: number,
    radiusMeters: number
  ): boolean {
    const distance = this.calculateDistance(
      currentLat,
      currentLng,
      fenceLat,
      fenceLng
    );
    return distance <= radiusMeters;
  }

  /**
   * Calculate bearing between two points (for turn-by-turn directions)
   * Returns bearing in degrees (0-360)
   */
  static calculateBearing(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x =
      Math.cos(φ1) * Math.sin(φ2) -
      Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

    const bearing = Math.atan2(y, x);
    return ((bearing * 180) / Math.PI + 360) % 360;
  }

  /**
   * Subscribe to location updates
   */
  onLocationChange(callback: (location: LocationData) => void): () => void {
    this.locationUpdateCallbacks.push(callback);

    // Return unsubscribe function
    return () => {
      this.locationUpdateCallbacks = this.locationUpdateCallbacks.filter(
        (cb) => cb !== callback
      );
    };
  }

  /**
   * Notify all subscribers of location change
   */
  private notifyLocationUpdate(location: LocationData): void {
    this.locationUpdateCallbacks.forEach((callback) => {
      try {
        callback(location);
      } catch (error) {
        console.error('Error in location callback:', error);
      }
    });
  }

  /**
   * Handle app state changes (foreground/background)
   */
  private handleAppStateChange = (nextAppState: AppStateStatus): void => {
    if (
      this.appState.match(/inactive|background/) &&
      nextAppState === 'active'
    ) {
      // App has come to foreground
      if (this.isTracking) {
        console.log('App returned to foreground - resuming location tracking');
        this.startTracking();
      }
    } else if (nextAppState.match(/inactive|background/)) {
      // App has gone to background
      // Location tracking continues if permission granted
      console.log('App moved to background - location tracking continues');
    }

    this.appState = nextAppState;
  };

  /**
   * Get current tracking status
   */
  isActive(): boolean {
    return this.isTracking;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.stopTracking();
    AppState.removeEventListener('change', this.handleAppStateChange);
    this.locationUpdateCallbacks = [];
  }
}

export default LocationService;
