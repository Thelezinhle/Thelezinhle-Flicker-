/**
 * GPS Service for Web Location Tracking
 * Handles GPS positioning for the 300m+ range phase
 * Web-compatible version using Browser Geolocation API
 */

export interface Position {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude: number | null;
  altitudeAccuracy: number | null;
  heading: number | null;
  speed: number | null;
  timestamp: number;
}

export interface GPSError {
  code: number;
  message: string;
}

type PositionCallback = (position: Position) => void;
type ErrorCallback = (error: GPSError) => void;

class GPSService {
  private static instance: GPSService;
  private watchId: number | null = null;
  private currentPosition: Position | null = null;
  private positionListeners: Set<PositionCallback> = new Set();
  private errorListeners: Set<ErrorCallback> = new Set();
  private isTracking: boolean = false;

  // Configuration
  private readonly distanceFilter: number = 5; // meters
  private readonly highAccuracy: boolean = true;
  private readonly timeout: number = 10000; // 10 seconds
  private readonly maximumAge: number = 0; // Always get fresh position

  private constructor() {
    console.log('🛰️ GPSService initialized');
  }

  public static getInstance(): GPSService {
    if (!GPSService.instance) {
      GPSService.instance = new GPSService();
    }
    return GPSService.instance;
  }

  /**
   * Check if Geolocation API is available
   */
  public isSupported(): boolean {
    return 'geolocation' in navigator;
  }

  /**
   * Check and request location permissions
   */
  public async checkPermission(): Promise<'granted' | 'denied' | 'prompt'> {
    if (!this.isSupported()) {
      return 'denied';
    }

    try {
      // Use Permissions API if available
      if ('permissions' in navigator) {
        const result = await navigator.permissions.query({ name: 'geolocation' });
        return result.state;
      }
      // Fallback - we don't know, assume prompt
      return 'prompt';
    } catch (error) {
      console.warn('Permissions API not available:', error);
      return 'prompt';
    }
  }

  /**
   * Get current position (one-time)
   */
  public async getCurrentPosition(): Promise<Position | null> {
    if (!this.isSupported()) {
      console.error('❌ Geolocation not supported');
      return null;
    }

    // Return cached position if available and recent (within 5 seconds)
    if (this.currentPosition && 
        Date.now() - this.currentPosition.timestamp < 5000) {
      return this.currentPosition;
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (geoPosition) => {
          const position = this.convertToPosition(geoPosition);
          this.currentPosition = position;
          console.log('📍 GPS Position:', position);
          resolve(position);
        },
        (error) => {
          console.error('❌ GPS Error:', error.message);
          this.notifyError({
            code: error.code,
            message: this.getErrorMessage(error.code)
          });
          resolve(null);
        },
        {
          enableHighAccuracy: this.highAccuracy,
          timeout: this.timeout,
          maximumAge: this.maximumAge
        }
      );
    });
  }

  /**
   * Start continuous GPS tracking
   */
  public async startTracking(): Promise<boolean> {
    if (!this.isSupported()) {
      console.error('❌ Geolocation not supported');
      return false;
    }

    if (this.isTracking) {
      console.log('⚠️ Already tracking');
      return true;
    }

    // Check permission first
    const permission = await this.checkPermission();
    if (permission === 'denied') {
      console.error('❌ Location permission denied');
      this.notifyError({
        code: 1,
        message: 'Location permission denied. Please enable location in your browser settings.'
      });
      return false;
    }

    console.log('🛰️ Starting GPS tracking...');

    this.watchId = navigator.geolocation.watchPosition(
      (geoPosition) => {
        const position = this.convertToPosition(geoPosition);
        
        // Only notify if moved more than distanceFilter
        if (this.shouldNotify(position)) {
          this.currentPosition = position;
          this.notifyPositionListeners(position);
        }
      },
      (error) => {
        console.error('❌ GPS Stream Error:', error.message);
        this.notifyError({
          code: error.code,
          message: this.getErrorMessage(error.code)
        });
      },
      {
        enableHighAccuracy: this.highAccuracy,
        timeout: this.timeout,
        maximumAge: this.maximumAge
      }
    );

    this.isTracking = true;
    console.log('✅ GPS tracking started');
    return true;
  }

  /**
   * Stop GPS tracking
   */
  public stopTracking(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
      this.isTracking = false;
      console.log('🛑 GPS tracking stopped');
    }
  }

  /**
   * Subscribe to position updates
   */
  public onPositionUpdate(callback: PositionCallback): () => void {
    this.positionListeners.add(callback);
    
    // Return unsubscribe function
    return () => {
      this.positionListeners.delete(callback);
    };
  }

  /**
   * Subscribe to errors
   */
  public onError(callback: ErrorCallback): () => void {
    this.errorListeners.add(callback);
    
    return () => {
      this.errorListeners.delete(callback);
    };
  }

  /**
   * Get current cached position
   */
  public getCachedPosition(): Position | null {
    return this.currentPosition;
  }

  /**
   * Check if currently tracking
   */
  public isCurrentlyTracking(): boolean {
    return this.isTracking;
  }

  /**
   * Calculate distance between two coordinates (Haversine formula)
   */
  public calculateDistance(
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
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
  }

  /**
   * Calculate ETA based on speed and distance
   */
  public calculateETA(distanceMeters: number, speedMps: number | null): number {
    if (!speedMps || speedMps <= 0) {
      // Assume walking speed of 1.4 m/s (5 km/h) if no speed available
      speedMps = 1.4;
    }
    return Math.round(distanceMeters / speedMps); // seconds
  }

  /**
   * Format distance for display
   */
  public formatDistance(meters: number): string {
    if (meters < 1000) {
      return `${Math.round(meters)}m`;
    }
    return `${(meters / 1000).toFixed(1)}km`;
  }

  /**
   * Format ETA for display
   */
  public formatETA(seconds: number): string {
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      return `${minutes}min`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}min`;
  }

  /**
   * Cleanup resources
   */
  public dispose(): void {
    this.stopTracking();
    this.positionListeners.clear();
    this.errorListeners.clear();
    this.currentPosition = null;
    console.log('🧹 GPSService disposed');
  }

  // Private helper methods

  private convertToPosition(geoPosition: GeolocationPosition): Position {
    return {
      latitude: geoPosition.coords.latitude,
      longitude: geoPosition.coords.longitude,
      accuracy: geoPosition.coords.accuracy,
      altitude: geoPosition.coords.altitude,
      altitudeAccuracy: geoPosition.coords.altitudeAccuracy,
      heading: geoPosition.coords.heading,
      speed: geoPosition.coords.speed,
      timestamp: geoPosition.timestamp
    };
  }

  private shouldNotify(newPosition: Position): boolean {
    if (!this.currentPosition) {
      return true;
    }

    const distance = this.calculateDistance(
      this.currentPosition.latitude,
      this.currentPosition.longitude,
      newPosition.latitude,
      newPosition.longitude
    );

    return distance >= this.distanceFilter;
  }

  private notifyPositionListeners(position: Position): void {
    this.positionListeners.forEach((callback) => {
      try {
        callback(position);
      } catch (error) {
        console.error('Error in position listener:', error);
      }
    });

    // Also dispatch DOM event for non-React components
    window.dispatchEvent(
      new CustomEvent('gps-position-update', { detail: position })
    );
  }

  private notifyError(error: GPSError): void {
    this.errorListeners.forEach((callback) => {
      try {
        callback(error);
      } catch (e) {
        console.error('Error in error listener:', e);
      }
    });

    window.dispatchEvent(
      new CustomEvent('gps-error', { detail: error })
    );
  }

  private getErrorMessage(code: number): string {
    switch (code) {
      case 1:
        return 'Location permission denied. Please allow location access.';
      case 2:
        return 'Position unavailable. Please check your GPS/location settings.';
      case 3:
        return 'Location request timed out. Please try again.';
      default:
        return 'Unknown location error.';
    }
  }
}

// Export singleton instance
export const gpsService = GPSService.getInstance();
export default GPSService;
