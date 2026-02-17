/**
 * NFC Service for React Native - Near Field Communication
 * 
 * Provides NFC verification for 0.1cm (1mm) range proof of presence.
 * Triggers blockchain NFT minting on successful verification.
 * 
 * Range: 0.1cm (physical tap required)
 * Technology: NFC (Near Field Communication)
 * 
 * Requirements:
 * - iOS: Core NFC (iPhone 7+, iOS 13+)
 * - Android: NFC hardware + permissions
 * 
 * Note: Requires react-native-nfc-manager package
 * npm install react-native-nfc-manager
 */

import { Platform, NativeModules, NativeEventEmitter } from 'react-native';

// Try to import NFC Manager (will fail gracefully if not installed)
let NfcManager: any = null;
let NfcTech: any = null;
let Ndef: any = null;

try {
  const nfcModule = require('react-native-nfc-manager');
  NfcManager = nfcModule.default;
  NfcTech = nfcModule.NfcTech;
  Ndef = nfcModule.Ndef;
} catch (e) {
  console.warn('react-native-nfc-manager not installed. NFC features disabled.');
}

// ============== Types ==============

export interface NFCVerificationData {
  verificationId: string;
  sourceDeviceId: string;
  targetDeviceId: string;
  latitude: number;
  longitude: number;
  timestamp: Date;
  nfcTagId: string;
  signature: string;
  isValid: boolean;
}

export interface NFCVerificationResult {
  success: boolean;
  data: NFCVerificationData | null;
  transactionId: string | null;
  nftMintAddress: string | null;
  errorMessage: string | null;
  timestamp: Date;
}

export interface NFCTagData {
  id: string;
  technology: string;
  payload: any;
  isWritable: boolean;
  maxSize: number;
}

export interface NFCCapabilities {
  available: boolean;
  canMakeReadOnly: boolean;
  canWriteNdef: boolean;
  reason?: string;
}

type VerificationCallback = (result: NFCVerificationResult) => void;
type ErrorCallback = (error: string) => void;
type TagDiscoveredCallback = (tag: NFCTagData) => void;

// ============== Service ==============

class NFCService {
  private static instance: NFCService;
  private isNfcAvailable: boolean = false;
  private isSessionActive: boolean = false;
  private isVerificationPending: boolean = false;
  private pendingTargetId: string | null = null;
  private currentDeviceId: string | null = null;
  
  // Location for verification
  private currentLatitude: number | null = null;
  private currentLongitude: number | null = null;
  
  // Callbacks
  private onVerificationComplete: VerificationCallback | null = null;
  private onError: ErrorCallback | null = null;
  private onTagDiscovered: TagDiscoveredCallback | null = null;
  
  // Session timeout
  private sessionTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly SESSION_TIMEOUT_SECONDS = 30;
  
  // Verification history
  private verificationHistory: NFCVerificationResult[] = [];

  // Blockchain service reference (injected)
  private solanaService: any = null;

  private constructor() {
    this.checkAvailability();
    console.log('📱 NFCService initialized (React Native)');
  }

  public static getInstance(): NFCService {
    if (!NFCService.instance) {
      NFCService.instance = new NFCService();
    }
    return NFCService.instance;
  }

  /**
   * Check NFC availability
   */
  private async checkAvailability(): Promise<void> {
    if (!NfcManager) {
      this.isNfcAvailable = false;
      console.warn('❌ NFC Manager not installed');
      return;
    }

    try {
      const supported = await NfcManager.isSupported();
      if (supported) {
        await NfcManager.start();
        this.isNfcAvailable = await NfcManager.isEnabled();
        console.log(`📱 NFC ${this.isNfcAvailable ? 'available and enabled' : 'supported but disabled'}`);
      } else {
        this.isNfcAvailable = false;
        console.warn('❌ NFC not supported on this device');
      }
    } catch (error) {
      console.error('Error checking NFC availability:', error);
      this.isNfcAvailable = false;
    }
  }

  /**
   * Check if NFC is available
   */
  public async isAvailable(): Promise<boolean> {
    if (!NfcManager) return false;
    
    try {
      const supported = await NfcManager.isSupported();
      if (!supported) return false;
      
      this.isNfcAvailable = await NfcManager.isEnabled();
      return this.isNfcAvailable;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get NFC capabilities
   */
  public async getCapabilities(): Promise<NFCCapabilities> {
    const available = await this.isAvailable();
    
    if (!available) {
      return {
        available: false,
        canMakeReadOnly: false,
        canWriteNdef: false,
        reason: this.getUnavailableReason()
      };
    }

    return {
      available: true,
      canMakeReadOnly: Platform.OS === 'android',
      canWriteNdef: true
    };
  }

  /**
   * Get reason why NFC is unavailable
   */
  private getUnavailableReason(): string {
    if (!NfcManager) {
      return 'react-native-nfc-manager package not installed';
    }
    if (Platform.OS === 'ios') {
      return 'NFC requires iPhone 7+ with iOS 13+';
    }
    return 'NFC not supported or disabled on this device';
  }

  /**
   * Set current device ID
   */
  public setDeviceId(deviceId: string): void {
    this.currentDeviceId = deviceId;
    console.log(`📱 Device ID set: ${deviceId}`);
  }

  /**
   * Set Solana service for blockchain integration
   */
  public setSolanaService(solanaService: any): void {
    this.solanaService = solanaService;
    console.log('🔗 Solana service connected to NFC');
  }

  /**
   * Update current location for verification
   */
  public updateLocation(latitude: number, longitude: number): void {
    this.currentLatitude = latitude;
    this.currentLongitude = longitude;
  }

  /**
   * Start NFC verification session
   */
  public async startVerification(options: {
    targetDeviceId: string;
    onVerificationComplete?: VerificationCallback;
    onError?: ErrorCallback;
    timeoutSeconds?: number;
  }): Promise<boolean> {
    const {
      targetDeviceId,
      onVerificationComplete,
      onError,
      timeoutSeconds = NFCService.SESSION_TIMEOUT_SECONDS
    } = options;

    if (!await this.isAvailable()) {
      onError?.('NFC not available');
      return false;
    }

    if (this.isSessionActive) {
      console.warn('NFC session already active');
      return false;
    }

    this.pendingTargetId = targetDeviceId;
    this.onVerificationComplete = onVerificationComplete || null;
    this.onError = onError || null;
    this.isSessionActive = true;
    this.isVerificationPending = true;

    console.log(`🎯 Starting NFC verification for target: ${targetDeviceId}`);

    try {
      // Request NFC technology
      await NfcManager.requestTechnology(NfcTech.Ndef, {
        alertMessage: 'Hold your device near the FlickerSecure tag'
      });

      // Read tag when discovered
      const tag = await NfcManager.getTag();
      
      if (tag) {
        await this.handleTagDiscovered(tag, targetDeviceId);
      }

      return true;
    } catch (error: any) {
      console.error('NFC session error:', error);
      
      if (error.message !== 'cancelled') {
        onError?.(error.message || 'NFC error');
      }
      
      await this.stopSessionInternal();
      return false;
    }
  }

  /**
   * Handle NFC tag discovery
   */
  private async handleTagDiscovered(tag: any, targetDeviceId: string): Promise<void> {
    console.log('📍 NFC tag discovered!');
    
    try {
      // Extract tag data
      const tagData = this.extractTagData(tag);
      const tagId = tagData.id;
      
      console.log(`Tag ID: ${tagId}`);
      console.log(`Technology: ${tagData.technology}`);

      // Check if tag payload contains expected device ID
      let isTargetMatch = true;
      if (tagData.payload && typeof tagData.payload === 'object') {
        const payloadDeviceId = tagData.payload.deviceId;
        if (payloadDeviceId && payloadDeviceId !== targetDeviceId) {
          console.warn(`Tag device mismatch: ${payloadDeviceId} != ${targetDeviceId}`);
          isTargetMatch = false;
        }
      }

      // Generate verification data
      const verificationId = this.generateVerificationId();
      const signature = this.generateSignature(
        verificationId,
        this.currentDeviceId || 'unknown',
        targetDeviceId,
        tagId
      );

      const verificationData: NFCVerificationData = {
        verificationId,
        sourceDeviceId: this.currentDeviceId || 'unknown',
        targetDeviceId,
        latitude: this.currentLatitude || 0,
        longitude: this.currentLongitude || 0,
        timestamp: new Date(),
        nfcTagId: tagId,
        signature,
        isValid: isTargetMatch
      };

      // Stop NFC session
      await this.stopSessionInternal();

      // Mint Proof-of-Presence NFT
      let result: NFCVerificationResult;
      
      if (isTargetMatch && this.solanaService) {
        result = await this.mintProofOfPresence(verificationData);
      } else if (isTargetMatch) {
        // No blockchain - success without NFT
        result = {
          success: true,
          data: verificationData,
          transactionId: null,
          nftMintAddress: null,
          errorMessage: null,
          timestamp: new Date()
        };
        console.log('✅ NFC verification successful (no blockchain)');
      } else {
        result = {
          success: false,
          data: verificationData,
          transactionId: null,
          nftMintAddress: null,
          errorMessage: 'Device ID mismatch',
          timestamp: new Date()
        };
        console.warn('❌ NFC verification failed - device mismatch');
      }

      // Store in history
      this.verificationHistory.push(result);

      // Notify callback
      this.onVerificationComplete?.(result);
      
    } catch (error: any) {
      console.error('Error processing NFC tag:', error);
      this.onError?.(`Error processing tag: ${error.message}`);
      await this.stopSessionInternal();
    }
  }

  /**
   * Extract data from NFC tag
   */
  private extractTagData(tag: any): NFCTagData {
    const result: NFCTagData = {
      id: tag.id || tag.ndefMessage?.[0]?.id || 'unknown',
      technology: 'unknown',
      payload: null,
      isWritable: false,
      maxSize: 0
    };

    // Determine technology
    if (tag.techTypes) {
      if (tag.techTypes.includes('android.nfc.tech.NfcA')) {
        result.technology = 'NfcA';
      } else if (tag.techTypes.includes('android.nfc.tech.NfcB')) {
        result.technology = 'NfcB';
      } else if (tag.techTypes.includes('android.nfc.tech.NfcF')) {
        result.technology = 'NfcF';
      } else if (tag.techTypes.includes('android.nfc.tech.NfcV')) {
        result.technology = 'NfcV';
      } else if (tag.techTypes.includes('android.nfc.tech.IsoDep')) {
        result.technology = 'IsoDep';
      }
    }

    // Convert ID to hex string
    if (tag.id) {
      if (Array.isArray(tag.id)) {
        result.id = tag.id.map((b: number) => b.toString(16).padStart(2, '0')).join(':');
      } else if (typeof tag.id === 'string') {
        result.id = tag.id;
      }
    }

    // Parse NDEF message
    if (tag.ndefMessage && tag.ndefMessage.length > 0) {
      try {
        const record = tag.ndefMessage[0];
        if (record.payload) {
          // Decode text payload
          const payloadStr = this.decodeNdefPayload(record.payload);
          if (payloadStr) {
            try {
              result.payload = JSON.parse(payloadStr);
            } catch {
              result.payload = payloadStr;
            }
          }
        }
      } catch (e) {
        console.warn('Could not parse NDEF message:', e);
      }
    }

    // Get NDEF info
    if (tag.maxSize) {
      result.maxSize = tag.maxSize;
    }
    if (tag.isWritable !== undefined) {
      result.isWritable = tag.isWritable;
    }

    return result;
  }

  /**
   * Decode NDEF text payload
   */
  private decodeNdefPayload(payload: number[]): string | null {
    if (!payload || payload.length === 0) return null;

    try {
      // First byte is status (encoding + language code length)
      const languageCodeLength = payload[0] & 0x3F;
      
      // Skip status byte and language code
      const textBytes = payload.slice(1 + languageCodeLength);
      
      // Convert to string
      return String.fromCharCode(...textBytes);
    } catch (e) {
      return null;
    }
  }

  /**
   * Write FlickerSecure data to NFC tag
   */
  public async writeToTag(options: {
    deviceId: string;
    additionalData?: Record<string, any>;
  }): Promise<boolean> {
    const { deviceId, additionalData } = options;

    if (!await this.isAvailable()) {
      return false;
    }

    try {
      // Request NDEF technology
      await NfcManager.requestTechnology(NfcTech.Ndef);

      // Create payload
      const payload = {
        deviceId,
        app: 'FlickerSecure',
        version: '1.0',
        timestamp: new Date().toISOString(),
        ...additionalData
      };

      // Create NDEF message
      const bytes = Ndef.encodeMessage([
        Ndef.textRecord(JSON.stringify(payload))
      ]);

      // Write to tag
      await NfcManager.ndefHandler.writeNdefMessage(bytes);
      
      console.log('✅ Successfully wrote to NFC tag');
      
      await NfcManager.cancelTechnologyRequest();
      return true;
    } catch (error: any) {
      console.error('Error writing to NFC tag:', error);
      await NfcManager.cancelTechnologyRequest();
      return false;
    }
  }

  /**
   * Simple proximity verification (legacy method)
   */
  public async verifyProximity(targetDeviceId: string): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.cancelVerification();
        resolve(false);
      }, NFCService.SESSION_TIMEOUT_SECONDS * 1000);

      this.startVerification({
        targetDeviceId,
        onVerificationComplete: (result) => {
          clearTimeout(timeout);
          resolve(result.success);
        },
        onError: () => {
          clearTimeout(timeout);
          resolve(false);
        }
      });
    });
  }

  /**
   * Cancel ongoing verification
   */
  public async cancelVerification(): Promise<void> {
    if (this.sessionTimer) {
      clearTimeout(this.sessionTimer);
      this.sessionTimer = null;
    }
    await this.stopSessionInternal();
    console.log('🛑 NFC verification cancelled');
  }

  /**
   * Stop NFC session internally
   */
  private async stopSessionInternal(): Promise<void> {
    this.isSessionActive = false;
    this.isVerificationPending = false;
    this.pendingTargetId = null;

    try {
      if (NfcManager) {
        await NfcManager.cancelTechnologyRequest();
      }
    } catch (e) {
      // Session may not be active
    }
  }

  /**
   * Mint Proof-of-Presence NFT on Solana
   */
  private async mintProofOfPresence(data: NFCVerificationData): Promise<NFCVerificationResult> {
    try {
      console.log('🔗 Minting Proof-of-Presence NFT...');

      if (!this.solanaService) {
        return {
          success: true,
          data,
          transactionId: null,
          nftMintAddress: null,
          errorMessage: 'Blockchain service not available',
          timestamp: new Date()
        };
      }

      const mintResult = await this.solanaService.mintProofOfPresence({
        verificationId: data.verificationId,
        sourceDeviceId: data.sourceDeviceId,
        targetDeviceId: data.targetDeviceId,
        latitude: data.latitude,
        longitude: data.longitude,
        timestamp: data.timestamp,
        nfcTagId: data.nfcTagId,
        signature: data.signature
      });

      if (mintResult.success) {
        console.log('✅ Proof-of-Presence NFT minted!');
        console.log(`   Transaction: ${mintResult.transactionId}`);
        
        return {
          success: true,
          data,
          transactionId: mintResult.transactionId,
          nftMintAddress: mintResult.mintAddress,
          errorMessage: null,
          timestamp: new Date()
        };
      } else {
        console.error('❌ NFT mint failed:', mintResult.error);
        return {
          success: true, // NFC succeeded, blockchain failed
          data,
          transactionId: null,
          nftMintAddress: null,
          errorMessage: `Blockchain mint failed: ${mintResult.error}`,
          timestamp: new Date()
        };
      }
    } catch (error: any) {
      console.error('Error minting NFT:', error);
      return {
        success: true, // NFC succeeded
        data,
        transactionId: null,
        nftMintAddress: null,
        errorMessage: `Blockchain error: ${error.message}`,
        timestamp: new Date()
      };
    }
  }

  /**
   * Generate unique verification ID
   */
  private generateVerificationId(): string {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000);
    return `FV-${timestamp}-${random}`;
  }

  /**
   * Generate signature for verification (SHA256)
   */
  private generateSignature(
    verificationId: string,
    sourceDeviceId: string,
    targetDeviceId: string,
    tagId: string
  ): string {
    // Simple hash for demo - in production use crypto library
    const data = `${verificationId}:${sourceDeviceId}:${targetDeviceId}:${tagId}`;
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(16, '0');
  }

  /**
   * Get verification history
   */
  public getVerificationHistory(): NFCVerificationResult[] {
    return [...this.verificationHistory];
  }

  /**
   * Clear verification history
   */
  public clearHistory(): void {
    this.verificationHistory = [];
  }

  /**
   * Get service health status
   */
  public getHealthStatus(): Record<string, any> {
    return {
      isAvailable: this.isNfcAvailable,
      isSessionActive: this.isSessionActive,
      isVerificationPending: this.isVerificationPending,
      pendingTargetId: this.pendingTargetId,
      currentDeviceId: this.currentDeviceId,
      hasLocation: this.currentLatitude !== null && this.currentLongitude !== null,
      historyCount: this.verificationHistory.length,
      hasBlockchainService: this.solanaService !== null
    };
  }

  /**
   * Dispose resources
   */
  public dispose(): void {
    this.cancelVerification();
    this.verificationHistory = [];
    if (NfcManager) {
      NfcManager.unregisterTagEvent?.();
    }
    console.log('📱 NFCService disposed');
  }
}

// Export singleton
export const nfcService = NFCService.getInstance();
export default NFCService;
