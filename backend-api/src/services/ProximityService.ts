import { ProximityHandshake } from '../models';
import { EncryptionService } from './EncryptionService';

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
}
