import { ProximityHandshake, ProximityTracking } from '../models';
import { EncryptionService } from './EncryptionService';

// ============== Request/Response Types ==============

export interface StartTrackingRequest {
  target_user_id: string;
  target_latitude: number;
  target_longitude: number;
}

export interface TrackingStatus {
  id: string;
  user_id: string;
  target_user_id: string;
  current_distance: number;
  phase: string;
  technology: string;
  status: string;
  last_update: Date;
}

export class ProximityService {
  /**
   * Calculate distance between two coordinates in meters
   * Uses Haversine formula
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
   * Initiate a new proximity handshake
   */
  static async initiateHandshake(
    initiatorId: string,
    latitude: number,
    longitude: number
  ): Promise<{ 
    handshakeCode: string; 
    sessionId: string; 
    expiresAt: Date 
  }> {
    // Generate 6-digit handshake code
    const handshakeCode = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Set expiration (10 minutes from now)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    
    const handshake = await ProximityHandshake.create({
      initiatorId,
      handshakeCode,
      latitude,
      longitude,
      status: 'pending',
      phase: 'gps'
    });
    
    return {
      handshakeCode,
      sessionId: handshake.id,
      expiresAt
    };
  }

  /**
   * Verify proximity between two devices
   */
  static async verifyProximity(
    sessionId: string,
    receiverLat: number,
    receiverLng: number,
    bluetoothRSSI?: number,
    uwbDistance?: number
  ): Promise<{
    verified: boolean;
    phase: string;
    message: string;
    distance?: number;
  }> {
    const handshake = await ProximityHandshake.findByPk(sessionId);
    
    if (!handshake) {
      throw new Error('Handshake session not found');
    }
    
    // Calculate GPS distance
    const distance = this.calculateDistance(
      Number(handshake.latitude),
      Number(handshake.longitude),
      receiverLat,
      receiverLng
    );
    
    // Phase 1: GPS Verification (within 100m)
    if (distance > 100) {
      return {
        verified: false,
        phase: 'gps',
        message: 'Devices too far apart for GPS verification',
        distance
      };
    }
    
    // Update phase to Bluetooth
    await handshake.update({ phase: 'bluetooth' });
    
    // Phase 2: Bluetooth RSSI Verification (-30dBm to -70dBm acceptable)
    if (bluetoothRSSI !== undefined) {
      if (bluetoothRSSI < -70) {
        return {
          verified: false,
          phase: 'bluetooth',
          message: 'Bluetooth signal too weak',
          distance
        };
      }
      
      // Update phase to UWB
      await handshake.update({ phase: 'uwb' });
    }
    
    // Phase 3: UWB Distance Verification (must be < 1m)
    if (uwbDistance !== undefined) {
      if (uwbDistance > 1.0) {
        return {
          verified: false,
          phase: 'uwb',
          message: 'UWB distance too great for secure handoff',
          distance: uwbDistance
        };
      }
      
      // Update phase to NFC (ready for tap)
      await handshake.update({ phase: 'nfc' });
      
      return {
        verified: true,
        phase: 'nfc',
        message: 'Ready for NFC handshake',
        distance: uwbDistance
      };
    }
    
    // If no UWB but Bluetooth is good, still proceed
    return {
      verified: true,
      phase: 'bluetooth',
      message: 'Proximity verified via Bluetooth',
      distance
    };
  }

  /**
   * Generate LED flash pattern for Light-ID
   */
  static generateLightIDPattern(
    sessionId: string,
    frequency: number = 2000
  ): { pattern: number[]; duration: number } {
    // Create unique pattern from session ID hash
    const hash = EncryptionService.sha256(sessionId);
    const binaryPattern = hash
      .split('')
      .slice(0, 16) // Use first 16 chars
      .map(char => parseInt(char, 16) % 2); // Convert to binary (0 or 1)
    
    return {
      pattern: binaryPattern,
      duration: binaryPattern.length * (1000 / frequency) // milliseconds
    };
  }

  // ============== Continuous Tracking Methods (from Go) ==============

  /**
   * Start proximity tracking session
   */
  static async startTracking(userId: string, req: StartTrackingRequest): Promise<TrackingStatus> {
    const tracking = await ProximityTracking.create({
      userId: userId,
      targetUserId: req.target_user_id,
      targetLatitude: req.target_latitude,
      targetLongitude: req.target_longitude,
      phase: 'gps',
      status: 'active',
      technology: 'gps',
      currentDistance: 0,
      lastUpdate: new Date()
    });

    return {
      id: tracking.id,
      user_id: tracking.userId,
      target_user_id: tracking.targetUserId,
      current_distance: 0,
      phase: tracking.phase,
      technology: tracking.technology,
      status: tracking.status,
      last_update: tracking.lastUpdate
    };
  }

  /**
   * Stop proximity tracking
   */
  static async stopTracking(trackingId: string): Promise<void> {
    await ProximityTracking.update(
      { 
        status: 'completed',
        completedAt: new Date()
      },
      { where: { id: trackingId } }
    );
  }

  /**
   * Get tracking status
   */
  static async getStatus(trackingId: string): Promise<TrackingStatus | null> {
    const tracking = await ProximityTracking.findByPk(trackingId);
    
    if (!tracking) {
      return null;
    }

    return {
      id: tracking.id,
      user_id: tracking.userId,
      target_user_id: tracking.targetUserId,
      current_distance: Number(tracking.currentDistance),
      phase: tracking.phase,
      technology: tracking.technology,
      status: tracking.status,
      last_update: tracking.lastUpdate
    };
  }

  /**
   * Update distance and phase based on current position
   */
  static async updateDistance(
    trackingId: string, 
    userLat: number, 
    userLon: number
  ): Promise<TrackingStatus | null> {
    const tracking = await ProximityTracking.findByPk(trackingId);
    
    if (!tracking) {
      return null;
    }

    // Calculate distance using Haversine formula
    const distance = this.calculateDistance(
      userLat, 
      userLon, 
      Number(tracking.targetLatitude), 
      Number(tracking.targetLongitude)
    );

    // Determine phase and technology based on distance
    const phase = this.determinePhase(distance);
    const technology = this.selectTechnology(distance);

    // Update tracking
    await tracking.update({
      currentDistance: distance,
      phase: phase,
      technology: technology,
      lastUpdate: new Date()
    });

    return {
      id: tracking.id,
      user_id: tracking.userId,
      target_user_id: tracking.targetUserId,
      current_distance: distance,
      phase: phase,
      technology: technology,
      status: tracking.status,
      last_update: new Date()
    };
  }

  /**
   * Get all active tracking sessions for a user
   */
  static async getActiveTrackings(userId: string): Promise<TrackingStatus[]> {
    const trackings = await ProximityTracking.findAll({
      where: { 
        userId: userId, 
        status: 'active' 
      }
    });

    return trackings.map(t => ({
      id: t.id,
      user_id: t.userId,
      target_user_id: t.targetUserId,
      current_distance: Number(t.currentDistance),
      phase: t.phase,
      technology: t.technology,
      status: t.status,
      last_update: t.lastUpdate
    }));
  }

  /**
   * Determine phase based on distance (meters)
   */
  static determinePhase(distance: number): 'gps' | 'discovery' | 'close_range' | 'nfc_ready' | 'verified' {
    if (distance > 300) {
      return 'gps';
    } else if (distance > 50) {
      return 'discovery';
    } else if (distance > 0.1) {
      return 'close_range';
    } else if (distance > 0.001) {
      return 'nfc_ready';
    }
    return 'verified';
  }

  /**
   * Select best technology for given distance
   */
  static selectTechnology(distance: number): 'gps' | 'uwb' | 'pdr' | 'nfc' {
    if (distance > 300) {
      return 'gps';
    } else if (distance > 50) {
      return 'uwb'; // with bluetooth fallback
    } else if (distance > 0.1) {
      return 'pdr';
    } else {
      return 'nfc';
    }
  }
}
