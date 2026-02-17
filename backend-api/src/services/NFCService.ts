/**
 * NFC Service for Backend - Near Field Communication Verification
 * Final handshake verification at 0.1cm (physical tap required)
 * 
 * NFC Support:
 * - iOS: iPhone 7+ with Core NFC
 * - Android: Most Android devices with NFC
 * 
 * This service handles NFC verification data from mobile clients
 */

import { EventEmitter } from 'events';
import crypto from 'crypto';

// ============== Types ==============

export interface NFCVerificationRequest {
  verificationId: string;
  sourceDeviceId: string;
  targetDeviceId: string;
  deliveryId: string;
  nfcTagId: string;
  latitude: number;
  longitude: number;
  timestamp: Date;
  payload: string;
  signature: string;
}

export interface NFCVerificationResult {
  verified: boolean;
  verificationId: string;
  transactionId: string | null;
  nftMintAddress: string | null;
  errorMessage: string | null;
  timestamp: Date;
  proofOfPresence: ProofOfPresence | null;
}

export interface ProofOfPresence {
  deliveryId: string;
  courierDeviceId: string;
  recipientDeviceId: string;
  nfcTagId: string;
  latitude: number;
  longitude: number;
  verifiedAt: Date;
  proofHash: string;
  signatureValid: boolean;
}

export interface NFCSession {
  sessionId: string;
  deliveryId: string;
  courierDeviceId: string;
  recipientDeviceId: string;
  status: 'pending' | 'ready' | 'verifying' | 'verified' | 'failed';
  expectedNfcTagId: string | null;
  verificationCode: string;
  startTime: Date;
  lastUpdate: Date;
  verificationAttempts: NFCVerificationRequest[];
  proofOfPresence: ProofOfPresence | null;
}

export interface NFCCapabilities {
  available: boolean;
  canRead: boolean;
  canWrite: boolean;
  supportedTechnologies: string[];
}

export interface NFCDeviceInfo {
  deviceId: string;
  capabilities: NFCCapabilities;
  lastSeen: Date;
}

export interface NFCHealthStatus {
  isAvailable: boolean;
  activeSessions: number;
  verifiedToday: number;
  pendingSessions: number;
  lastHealthCheck: Date;
}

// ============== Service ==============

class NFCService extends EventEmitter {
  private activeSessions: Map<string, NFCSession> = new Map();
  private deviceInfo: Map<string, NFCDeviceInfo> = new Map();
  private verifiedDeliveries: Set<string> = new Set();
  private dailyVerifications: number = 0;
  private isInitialized: boolean = false;

  // Secret for signature verification (in production, use proper key management)
  private readonly signingSecret: string;

  constructor() {
    super();
    this.signingSecret = process.env.NFC_SIGNING_SECRET || 'flicker-nfc-secret-key';
    this.initialize();
  }

  /**
   * Initialize NFC service
   */
  private initialize(): void {
    console.log('📱 NFCService initialized');
    this.isInitialized = true;
    
    // Reset daily counter at midnight
    this.scheduleDailyReset();
    
    this.emit('initialized');
  }

  /**
   * Schedule daily verification counter reset
   */
  private scheduleDailyReset(): void {
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const msUntilMidnight = tomorrow.getTime() - now.getTime();

    setTimeout(() => {
      this.dailyVerifications = 0;
      this.scheduleDailyReset();
    }, msUntilMidnight);
  }

  /**
   * Check if service is available
   */
  public isAvailable(): boolean {
    return this.isInitialized;
  }

  /**
   * Register device NFC capabilities
   */
  public registerDevice(deviceId: string, capabilities: NFCCapabilities): NFCDeviceInfo {
    const info: NFCDeviceInfo = {
      deviceId,
      capabilities,
      lastSeen: new Date()
    };

    this.deviceInfo.set(deviceId, info);
    console.log(`📱 NFC device registered: ${deviceId}`);
    
    this.emit('device_registered', info);
    return info;
  }

  /**
   * Create NFC verification session
   */
  public createSession(
    deliveryId: string,
    courierDeviceId: string,
    recipientDeviceId: string
  ): NFCSession {
    const sessionId = `nfc-session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Generate 6-digit verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    const session: NFCSession = {
      sessionId,
      deliveryId,
      courierDeviceId,
      recipientDeviceId,
      status: 'pending',
      expectedNfcTagId: null,
      verificationCode,
      startTime: new Date(),
      lastUpdate: new Date(),
      verificationAttempts: [],
      proofOfPresence: null
    };

    this.activeSessions.set(sessionId, session);
    console.log(`📍 Created NFC session: ${sessionId} for delivery: ${deliveryId}`);
    
    this.emit('session_created', session);
    return session;
  }

  /**
   * Prepare session for NFC verification (ready for tap)
   */
  public prepareForVerification(sessionId: string, expectedTagId?: string): boolean {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return false;
    }

    session.status = 'ready';
    session.expectedNfcTagId = expectedTagId || null;
    session.lastUpdate = new Date();

    console.log(`✅ NFC session ready for verification: ${sessionId}`);
    this.emit('session_ready', { sessionId });

    return true;
  }

  /**
   * Verify NFC tap and create Proof of Presence
   */
  public async verifyProximity(request: NFCVerificationRequest): Promise<NFCVerificationResult> {
    const {
      verificationId,
      sourceDeviceId,
      targetDeviceId,
      deliveryId,
      nfcTagId,
      latitude,
      longitude,
      timestamp,
      payload,
      signature
    } = request;

    // Find active session
    let session: NFCSession | null = null;
    for (const [_, s] of this.activeSessions) {
      if (s.deliveryId === deliveryId && s.status === 'ready') {
        session = s;
        break;
      }
    }

    if (!session) {
      return {
        verified: false,
        verificationId,
        transactionId: null,
        nftMintAddress: null,
        errorMessage: 'No active NFC session found for this delivery',
        timestamp: new Date(),
        proofOfPresence: null
      };
    }

    session.status = 'verifying';
    session.verificationAttempts.push(request);
    session.lastUpdate = new Date();

    // Verify signature
    const signatureValid = this.verifySignature(payload, signature);
    if (!signatureValid) {
      session.status = 'failed';
      return {
        verified: false,
        verificationId,
        transactionId: null,
        nftMintAddress: null,
        errorMessage: 'Invalid NFC signature',
        timestamp: new Date(),
        proofOfPresence: null
      };
    }

    // Verify expected tag ID if specified
    if (session.expectedNfcTagId && session.expectedNfcTagId !== nfcTagId) {
      session.status = 'failed';
      return {
        verified: false,
        verificationId,
        transactionId: null,
        nftMintAddress: null,
        errorMessage: 'NFC tag ID mismatch',
        timestamp: new Date(),
        proofOfPresence: null
      };
    }

    // Create Proof of Presence
    const proofHash = this.generateProofHash(
      deliveryId,
      sourceDeviceId,
      targetDeviceId,
      nfcTagId,
      latitude,
      longitude,
      timestamp
    );

    const proofOfPresence: ProofOfPresence = {
      deliveryId,
      courierDeviceId: sourceDeviceId,
      recipientDeviceId: targetDeviceId,
      nfcTagId,
      latitude,
      longitude,
      verifiedAt: new Date(),
      proofHash,
      signatureValid: true
    };

    // Update session
    session.status = 'verified';
    session.proofOfPresence = proofOfPresence;
    session.lastUpdate = new Date();

    // Track verification
    this.verifiedDeliveries.add(deliveryId);
    this.dailyVerifications++;

    // Generate transaction ID
    const transactionId = `txn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    console.log(`✅ NFC verification successful: ${deliveryId}`);
    this.emit('verification_success', { sessionId: session.sessionId, proofOfPresence });

    return {
      verified: true,
      verificationId,
      transactionId,
      nftMintAddress: null, // Will be set by Solana minting
      errorMessage: null,
      timestamp: new Date(),
      proofOfPresence
    };
  }

  /**
   * Verify signature
   */
  private verifySignature(payload: string, signature: string): boolean {
    try {
      const expectedSignature = crypto
        .createHmac('sha256', this.signingSecret)
        .update(payload)
        .digest('hex');
      
      // Ensure same length before comparison
      if (signature.length !== expectedSignature.length) {
        return false;
      }
      
      const signatureBuffer = Uint8Array.from(Buffer.from(signature));
      const expectedBuffer = Uint8Array.from(Buffer.from(expectedSignature));
      
      return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
    } catch {
      // If timingSafeEqual fails (different lengths), return false
      return false;
    }
  }

  /**
   * Generate Proof of Presence hash
   */
  private generateProofHash(
    deliveryId: string,
    courierDeviceId: string,
    recipientDeviceId: string,
    nfcTagId: string,
    latitude: number,
    longitude: number,
    timestamp: Date
  ): string {
    const data = JSON.stringify({
      deliveryId,
      courierDeviceId,
      recipientDeviceId,
      nfcTagId,
      latitude,
      longitude,
      timestamp: timestamp.toISOString()
    });

    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Generate signature for NFC payload (for mobile client)
   */
  public generateSignature(payload: string): string {
    return crypto
      .createHmac('sha256', this.signingSecret)
      .update(payload)
      .digest('hex');
  }

  /**
   * Get session by ID
   */
  public getSession(sessionId: string): NFCSession | null {
    return this.activeSessions.get(sessionId) || null;
  }

  /**
   * Get sessions for a delivery
   */
  public getSessionsForDelivery(deliveryId: string): NFCSession[] {
    return Array.from(this.activeSessions.values())
      .filter(session => session.deliveryId === deliveryId);
  }

  /**
   * Check if delivery is already verified
   */
  public isDeliveryVerified(deliveryId: string): boolean {
    return this.verifiedDeliveries.has(deliveryId);
  }

  /**
   * Cancel verification session
   */
  public cancelVerification(sessionId: string): boolean {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return false;
    }

    session.status = 'failed';
    session.lastUpdate = new Date();

    console.log(`❌ NFC session cancelled: ${sessionId}`);
    this.emit('session_cancelled', { sessionId });

    return true;
  }

  /**
   * Get health status
   */
  public getHealthStatus(): NFCHealthStatus {
    const pendingSessions = Array.from(this.activeSessions.values())
      .filter(s => s.status === 'pending' || s.status === 'ready').length;

    return {
      isAvailable: this.isInitialized,
      activeSessions: this.activeSessions.size,
      verifiedToday: this.dailyVerifications,
      pendingSessions,
      lastHealthCheck: new Date()
    };
  }

  /**
   * Get device info
   */
  public getDeviceInfo(deviceId: string): NFCDeviceInfo | null {
    return this.deviceInfo.get(deviceId) || null;
  }

  /**
   * Get all registered devices
   */
  public getAllDevices(): NFCDeviceInfo[] {
    return Array.from(this.deviceInfo.values());
  }

  /**
   * Dispose resources
   */
  public dispose(): void {
    this.activeSessions.clear();
    this.deviceInfo.clear();
    this.verifiedDeliveries.clear();
    this.isInitialized = false;
    console.log('📱 NFCService disposed');
  }
}

// Export singleton instance
export const nfcService = new NFCService();
export default NFCService;
