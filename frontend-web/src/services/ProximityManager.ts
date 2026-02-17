/**
 * Proximity Manager - Coordinates all ranging technologies
 * 
 * Technology Selection by Distance:
 * - GPS: >300m (coarse location)
 * - UWB: 0-50m (centimeter accuracy, when available)
 * - Bluetooth: 10-300m (RSSI-based ranging, UWB fallback)
 * - Audio: 0.5-10m (ultrasonic time-of-flight)
 * - QR Code: <0.5m (visual verification for handoff)
 * 
 * This manager automatically transitions between technologies
 * based on the estimated distance, optimizing accuracy and
 * battery usage.
 */

import { gpsService, Position } from './GPSService';
import { bluetoothService, BluetoothRangingData } from './BluetoothService';
import { audioRangingService, AudioRangingData } from './AudioRangingService';
import { uwbService, UWBRangingData } from './UWBService';

// Alias for compatibility
export type GPSCoordinates = Position;

export type ProximityPhase = 'far' | 'approaching' | 'near' | 'handoff' | 'completed';
export type ActiveTechnology = 'gps' | 'uwb' | 'bluetooth' | 'audio' | 'qr' | 'none';

export interface ProximityStatus {
  phase: ProximityPhase;
  activeTechnology: ActiveTechnology;
  distance: number;
  accuracy: number;
  targetId: string | null;
  targetLocation: GPSCoordinates | null;
  lastUpdate: number;
  technologies: {
    gps: boolean;
    uwb: boolean;
    bluetooth: boolean;
    audio: boolean;
  };
}

export interface DeliveryTarget {
  id: string;
  location?: GPSCoordinates;
  bluetoothId?: string;
}

type StatusCallback = (status: ProximityStatus) => void;
type PhaseChangeCallback = (phase: ProximityPhase, previousPhase: ProximityPhase) => void;

class ProximityManager {
  private status: ProximityStatus = {
    phase: 'far',
    activeTechnology: 'none',
    distance: Infinity,
    accuracy: Infinity,
    targetId: null,
    targetLocation: null,
    lastUpdate: 0,
    technologies: {
      gps: false,
      uwb: false,
      bluetooth: false,
      audio: false
    }
  };

  private statusCallbacks: StatusCallback[] = [];
  private phaseChangeCallbacks: PhaseChangeCallback[] = [];
  private isTracking: boolean = false;
  private apiEndpoint: string = '/api/proximity/update';
  private uwbAvailable: boolean = false;

  // Distance thresholds for phase transitions
  private thresholds = {
    far: 300,        // >300m = far (GPS only)
    approaching: 50, // 50-300m = approaching (GPS + UWB/Bluetooth)
    near: 10,        // 10-50m = near (UWB/Bluetooth primary)
    handoff: 0.5     // <0.5m = handoff ready (QR code)
  };

  constructor() {
    console.log('📍 ProximityManager initialized');
  }

  /**
   * Start tracking proximity to a delivery target
   */
  async startTracking(target: DeliveryTarget): Promise<boolean> {
    if (this.isTracking) {
      console.log('Already tracking, stopping previous session');
      await this.stopTracking();
    }

    this.status.targetId = target.id;
    this.status.targetLocation = target.location || null;
    this.isTracking = true;

    console.log(`🎯 Starting proximity tracking for target: ${target.id}`);

    // Always start with GPS
    await this.startGPS();

    // Check UWB availability
    this.uwbAvailable = await uwbService.isAvailable();
    if (this.uwbAvailable) {
      console.log('✅ UWB available - will use for precision ranging');
    } else {
      console.log('ℹ️ UWB not available - using Bluetooth + Audio fallback');
    }

    // Check which technologies are available
    this.status.technologies = {
      gps: gpsService.isSupported(),
      uwb: this.uwbAvailable,
      bluetooth: bluetoothService.isAvailable(),
      audio: audioRangingService.isAvailable()
    };

    return true;
  }

  /**
   * Stop all tracking
   */
  async stopTracking(): Promise<void> {
    this.isTracking = false;
    
    // Stop all technologies
    gpsService.stopTracking();
    await uwbService.stopSession();
    bluetoothService.stopRanging();
    audioRangingService.stopRanging();

    this.status.activeTechnology = 'none';
    this.status.targetId = null;
    
    console.log('🛑 Proximity tracking stopped');
  }

  /**
   * Start GPS tracking
   */
  private async startGPS(): Promise<void> {
    this.status.activeTechnology = 'gps';

    // Subscribe to position updates
    gpsService.onPositionUpdate((position: Position) => {
      this.onGPSUpdate(position);
    });

    gpsService.onError((error) => {
      console.error('GPS error:', error);
    });

    // Start tracking
    gpsService.startTracking();
  }

  /**
   * Handle GPS position updates
   */
  private onGPSUpdate(position: Position): void {
    if (!this.status.targetLocation) return;

    const distance = gpsService.calculateDistance(
      position.latitude, 
      position.longitude,
      this.status.targetLocation.latitude, 
      this.status.targetLocation.longitude
    );

    this.updateDistance(distance, position.accuracy, 'gps');
  }

  /**
   * Start UWB ranging (when available and in range)
   */
  private async startUWB(): Promise<void> {
    if (!this.uwbAvailable || !this.status.targetId) return;

    try {
      const started = await uwbService.startSession(
        this.status.targetId,
        (data: UWBRangingData) => {
          this.onUWBUpdate(data);
        }
      );
      if (started) {
        console.log('📡 UWB ranging started');
      }
    } catch (error) {
      console.error('Failed to start UWB:', error);
      // Fall back to Bluetooth
      await this.startBluetooth();
    }
  }

  /**
   * Handle UWB ranging updates
   */
  private onUWBUpdate(data: UWBRangingData): void {
    // UWB has highest accuracy for medium range
    this.updateDistance(data.distance, data.accuracy, 'uwb');
  }

  /**
   * Start Bluetooth ranging (when in range)
   */
  private async startBluetooth(): Promise<void> {
    if (!this.status.technologies.bluetooth) return;

    try {
      await bluetoothService.startRanging((data: BluetoothRangingData) => {
        this.onBluetoothUpdate(data);
      });
      console.log('📶 Bluetooth ranging started');
    } catch (error) {
      console.error('Failed to start Bluetooth:', error);
    }
  }

  /**
   * Handle Bluetooth ranging updates
   */
  private onBluetoothUpdate(data: BluetoothRangingData): void {
    // Bluetooth takes priority over GPS when in range
    if (data.distance !== null) {
      this.updateDistance(data.distance, data.accuracy, 'bluetooth');
    }
  }

  /**
   * Start Audio ranging (for close proximity)
   */
  private async startAudio(): Promise<void> {
    if (!this.status.technologies.audio) return;

    try {
      await audioRangingService.startRanging((data: AudioRangingData) => {
        this.onAudioUpdate(data);
      });
      console.log('🔊 Audio ranging started');
    } catch (error) {
      console.error('Failed to start Audio ranging:', error);
    }
  }

  /**
   * Handle Audio ranging updates
   */
  private onAudioUpdate(data: AudioRangingData): void {
    // Audio has highest accuracy for close range
    this.updateDistance(data.distance, data.accuracy, 'audio');
  }

  /**
   * Central method to update distance and manage phase transitions
   */
  private async updateDistance(
    distance: number, 
    accuracy: number, 
    technology: ActiveTechnology
  ): Promise<void> {
    const previousPhase = this.status.phase;
    
    this.status.distance = distance;
    this.status.accuracy = accuracy;
    this.status.activeTechnology = technology;
    this.status.lastUpdate = Date.now();

    // Determine new phase based on distance
    const newPhase = this.determinePhase(distance);
    
    if (newPhase !== previousPhase) {
      this.status.phase = newPhase;
      await this.handlePhaseTransition(previousPhase, newPhase);
      this.notifyPhaseChange(newPhase, previousPhase);
    }

    // Send update to server
    await this.sendUpdateToServer();

    // Notify listeners
    this.notifyStatusUpdate();
  }

  /**
   * Determine phase based on distance
   */
  private determinePhase(distance: number): ProximityPhase {
    if (distance > this.thresholds.far) {
      return 'far';
    } else if (distance > this.thresholds.near) {
      return 'approaching';
    } else if (distance > this.thresholds.handoff) {
      return 'near';
    } else {
      return 'handoff';
    }
  }

  /**
   * Handle technology transitions when phase changes
   */
  private async handlePhaseTransition(
    previousPhase: ProximityPhase, 
    newPhase: ProximityPhase
  ): Promise<void> {
    console.log(`📍 Phase transition: ${previousPhase} → ${newPhase}`);

    switch (newPhase) {
      case 'far':
        // Only GPS needed
        await uwbService.stopSession();
        bluetoothService.stopRanging();
        audioRangingService.stopRanging();
        break;

      case 'approaching':
        // Start UWB if available, otherwise Bluetooth
        if (this.uwbAvailable) {
          await this.startUWB();
        } else if (!bluetoothService.isScanning) {
          await this.startBluetooth();
        }
        audioRangingService.stopRanging();
        break;

      case 'near':
        // UWB or Bluetooth + Audio for precision
        if (this.uwbAvailable) {
          // UWB handles close range well, but add audio for extra precision
          if (!audioRangingService.isCurrentlyListening) {
            await this.startAudio();
          }
        } else {
          // Bluetooth + Audio fallback
          if (!bluetoothService.isScanning) {
            await this.startBluetooth();
          }
          if (!audioRangingService.isCurrentlyListening) {
            await this.startAudio();
          }
        }
        break;

      case 'handoff':
        // Ready for QR code verification
        console.log('📱 Ready for QR code handoff');
        // Keep audio running for distance verification
        break;
    }
  }

  /**
   * Send proximity update to server
   */
  private async sendUpdateToServer(): Promise<void> {
    if (!this.status.targetId) return;

    const cachedPosition = gpsService.getCachedPosition();

    try {
      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`
        },
        body: JSON.stringify({
          deliveryId: this.status.targetId,
          latitude: cachedPosition?.latitude || 0,
          longitude: cachedPosition?.longitude || 0,
          distance: this.status.distance,
          phase: this.status.phase,
          technology: this.status.activeTechnology,
          accuracy: this.status.accuracy
        })
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }
    } catch (error) {
      console.error('Failed to send proximity update:', error);
    }
  }

  /**
   * Subscribe to status updates
   */
  onStatusUpdate(callback: StatusCallback): () => void {
    this.statusCallbacks.push(callback);
    return () => {
      this.statusCallbacks = this.statusCallbacks.filter(cb => cb !== callback);
    };
  }

  /**
   * Subscribe to phase changes
   */
  onPhaseChange(callback: PhaseChangeCallback): () => void {
    this.phaseChangeCallbacks.push(callback);
    return () => {
      this.phaseChangeCallbacks = this.phaseChangeCallbacks.filter(cb => cb !== callback);
    };
  }

  /**
   * Notify all status listeners
   */
  private notifyStatusUpdate(): void {
    this.statusCallbacks.forEach(callback => {
      callback({ ...this.status });
    });
  }

  /**
   * Notify phase change listeners
   */
  private notifyPhaseChange(newPhase: ProximityPhase, previousPhase: ProximityPhase): void {
    this.phaseChangeCallbacks.forEach(callback => {
      callback(newPhase, previousPhase);
    });
  }

  /**
   * Get current status
   */
  getStatus(): ProximityStatus {
    return { ...this.status };
  }

  /**
   * Check if tracking is active
   */
  isActive(): boolean {
    return this.isTracking;
  }

  /**
   * Update target location (for moving targets)
   */
  updateTargetLocation(location: GPSCoordinates): void {
    this.status.targetLocation = location;
  }

  /**
   * Get available technologies
   */
  getAvailableTechnologies(): typeof this.status.technologies {
    return { ...this.status.technologies };
  }

  /**
   * Configure thresholds
   */
  setThresholds(thresholds: Partial<typeof this.thresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
  }

  /**
   * Set API endpoint
   */
  setApiEndpoint(endpoint: string): void {
    this.apiEndpoint = endpoint;
  }

  /**
   * Request QR scan (when in handoff phase)
   */
  requestQRScan(): boolean {
    if (this.status.phase === 'handoff') {
      console.log('📷 QR scan requested for handoff');
      return true;
    }
    console.log('⚠️ Not in handoff range yet');
    return false;
  }

  /**
   * Complete delivery handoff (after QR verification)
   */
  async completeHandoff(verificationCode: string): Promise<boolean> {
    if (this.status.phase !== 'handoff') {
      throw new Error('Not in handoff range');
    }

    try {
      const response = await fetch('/api/delivery/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`
        },
        body: JSON.stringify({
          deliveryId: this.status.targetId,
          verificationCode: verificationCode,
          distance: this.status.distance,
          technology: this.status.activeTechnology
        })
      });

      if (response.ok) {
        this.status.phase = 'completed';
        this.notifyPhaseChange('completed', 'handoff');
        await this.stopTracking();
        return true;
      }

      return false;
    } catch (error) {
      console.error('Handoff verification failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const proximityManager = new ProximityManager();
export default ProximityManager;
