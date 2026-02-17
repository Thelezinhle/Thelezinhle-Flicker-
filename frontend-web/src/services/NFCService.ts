/**
 * NFC Service for Web - Near Field Communication
 * 
 * Web NFC API is ONLY supported in:
 * - Chrome 89+ on Android
 * - NOT supported: iOS, Desktop browsers, Firefox, Safari
 * 
 * For unsupported platforms, this service gracefully degrades
 * to QR code-based verification as a fallback.
 * 
 * Range: 0.1cm (physical tap required)
 */

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
  usedFallback: boolean; // True if QR was used instead of NFC
}

export interface NFCTagData {
  id: string;
  technology: string;
  payload: any;
  records: NFCReadingEvent['message']['records'] | null;
}

export interface NFCCapabilities {
  available: boolean;
  canRead: boolean;
  canWrite: boolean;
  reason?: string;
}

// Web NFC types (not in standard TypeScript)
interface NDEFReader {
  scan(options?: { signal?: AbortSignal }): Promise<void>;
  write(message: NDEFMessageInit, options?: { signal?: AbortSignal }): Promise<void>;
  addEventListener(type: 'reading', listener: (event: NFCReadingEvent) => void): void;
  addEventListener(type: 'readingerror', listener: (event: Event) => void): void;
  removeEventListener(type: string, listener: EventListener): void;
}

interface NFCReadingEvent extends Event {
  serialNumber: string;
  message: {
    records: Array<{
      recordType: string;
      mediaType?: string;
      id?: string;
      data: DataView;
      encoding?: string;
      lang?: string;
    }>;
  };
}

interface NDEFMessageInit {
  records: Array<{
    recordType: string;
    data?: string | BufferSource;
    mediaType?: string;
    id?: string;
    encoding?: string;
    lang?: string;
  }>;
}

declare global {
  interface Window {
    NDEFReader?: new () => NDEFReader;
  }
}

type VerificationCallback = (result: NFCVerificationResult) => void;
type ErrorCallback = (error: string) => void;

// ============== Service ==============

class NFCService {
  private static instance: NFCService;
  private isNfcSupported: boolean = false;
  private reader: NDEFReader | null = null;
  private abortController: AbortController | null = null;
  private isSessionActive: boolean = false;
  private currentDeviceId: string | null = null;
  
  // Location
  private currentLatitude: number | null = null;
  private currentLongitude: number | null = null;
  
  // Callbacks
  private onVerificationComplete: VerificationCallback | null = null;
  private onError: ErrorCallback | null = null;
  
  // Blockchain service
  private solanaService: any = null;
  
  // History
  private verificationHistory: NFCVerificationResult[] = [];
  
  // Session timeout
  private sessionTimer: number | null = null;
  private static readonly SESSION_TIMEOUT_MS = 30000;

  private constructor() {
    this.checkSupport();
    console.log('📱 NFCService initialized (Web)');
  }

  public static getInstance(): NFCService {
    if (!NFCService.instance) {
      NFCService.instance = new NFCService();
    }
    return NFCService.instance;
  }

  /**
   * Check if Web NFC is supported
   */
  private checkSupport(): void {
    this.isNfcSupported = 'NDEFReader' in window;
    
    if (this.isNfcSupported) {
      console.log('✅ Web NFC API supported');
    } else {
      console.log('⚠️ Web NFC not supported - will use QR fallback');
    }
  }

  /**
   * Check if NFC is available
   */
  public async isAvailable(): Promise<boolean> {
    // Web NFC only works on Chrome Android with HTTPS
    if (!this.isNfcSupported) {
      return false;
    }

    // Check if we're on a secure context
    if (!window.isSecureContext) {
      console.warn('Web NFC requires HTTPS');
      return false;
    }

    return true;
  }

  /**
   * Get NFC capabilities
   */
  public async getCapabilities(): Promise<NFCCapabilities> {
    const available = await this.isAvailable();
    
    if (!available) {
      return {
        available: false,
        canRead: false,
        canWrite: false,
        reason: this.getUnavailableReason()
      };
    }

    return {
      available: true,
      canRead: true,
      canWrite: true
    };
  }

  /**
   * Get reason why NFC is unavailable
   */
  private getUnavailableReason(): string {
    if (!('NDEFReader' in window)) {
      return 'Web NFC API not supported. Only Chrome 89+ on Android supports Web NFC.';
    }
    if (!window.isSecureContext) {
      return 'Web NFC requires HTTPS (secure context)';
    }
    return 'Web NFC not available';
  }

  /**
   * Set current device ID
   */
  public setDeviceId(deviceId: string): void {
    this.currentDeviceId = deviceId;
  }

  /**
   * Set Solana service for blockchain integration
   */
  public setSolanaService(solanaService: any): void {
    this.solanaService = solanaService;
    console.log('🔗 Solana service connected to NFC');
  }

  /**
   * Update current location
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
    timeoutMs?: number;
  }): Promise<boolean> {
    const {
      targetDeviceId,
      onVerificationComplete,
      onError,
      timeoutMs = NFCService.SESSION_TIMEOUT_MS
    } = options;

    // Check if NFC is available
    if (!await this.isAvailable()) {
      console.log('NFC not available, suggesting QR fallback');
      onError?.('NFC not available. Use QR code verification instead.');
      return false;
    }

    if (this.isSessionActive) {
      console.warn('NFC session already active');
      return false;
    }

    this.onVerificationComplete = onVerificationComplete || null;
    this.onError = onError || null;
    this.isSessionActive = true;

    console.log(`🎯 Starting NFC verification for target: ${targetDeviceId}`);

    try {
      // Create NDEFReader
      this.reader = new window.NDEFReader!();
      this.abortController = new AbortController();

      // Handle tag reading
      this.reader.addEventListener('reading', ((event: NFCReadingEvent) => {
        this.handleTagReading(event, targetDeviceId);
      }) as EventListener);

      this.reader.addEventListener('readingerror', (() => {
        console.error('NFC reading error');
        onError?.('Failed to read NFC tag');
      }) as EventListener);

      // Start scanning
      await this.reader.scan({ signal: this.abortController.signal });
      
      console.log('📱 NFC scanning started - tap a tag');

      // Set timeout
      this.sessionTimer = window.setTimeout(() => {
        console.warn('NFC verification timed out');
        onError?.('Verification timed out');
        this.cancelVerification();
      }, timeoutMs);

      return true;
    } catch (error: any) {
      console.error('Failed to start NFC:', error);
      
      if (error.name === 'NotAllowedError') {
        onError?.('NFC permission denied. Please allow NFC access.');
      } else {
        onError?.(error.message || 'Failed to start NFC');
      }
      
      this.isSessionActive = false;
      return false;
    }
  }

  /**
   * Handle NFC tag reading
   */
  private async handleTagReading(event: NFCReadingEvent, targetDeviceId: string): Promise<void> {
    console.log('📍 NFC tag discovered!');
    
    const tagId = event.serialNumber || 'unknown';
    console.log(`Tag Serial: ${tagId}`);

    try {
      // Extract payload from records
      let payload: any = null;
      let isTargetMatch = true;

      for (const record of event.message.records) {
        if (record.recordType === 'text') {
          const decoder = new TextDecoder(record.encoding || 'utf-8');
          const text = decoder.decode(record.data);
          
          try {
            payload = JSON.parse(text);
            
            // Check device ID match
            if (payload.deviceId && payload.deviceId !== targetDeviceId) {
              console.warn(`Device mismatch: ${payload.deviceId} != ${targetDeviceId}`);
              isTargetMatch = false;
            }
          } catch {
            payload = text;
          }
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

      // Stop session
      await this.cancelVerification();

      // Mint NFT if valid
      let result: NFCVerificationResult;

      if (isTargetMatch && this.solanaService) {
        result = await this.mintProofOfPresence(verificationData);
      } else if (isTargetMatch) {
        result = {
          success: true,
          data: verificationData,
          transactionId: null,
          nftMintAddress: null,
          errorMessage: null,
          timestamp: new Date(),
          usedFallback: false
        };
        console.log('✅ NFC verification successful');
      } else {
        result = {
          success: false,
          data: verificationData,
          transactionId: null,
          nftMintAddress: null,
          errorMessage: 'Device ID mismatch',
          timestamp: new Date(),
          usedFallback: false
        };
      }

      this.verificationHistory.push(result);
      this.onVerificationComplete?.(result);

    } catch (error: any) {
      console.error('Error processing NFC tag:', error);
      this.onError?.(`Error: ${error.message}`);
    }
  }

  /**
   * Write data to NFC tag
   */
  public async writeToTag(options: {
    deviceId: string;
    additionalData?: Record<string, any>;
  }): Promise<boolean> {
    if (!await this.isAvailable()) {
      return false;
    }

    try {
      const reader = new window.NDEFReader!();
      
      const payload = {
        deviceId: options.deviceId,
        app: 'FlickerSecure',
        version: '1.0',
        timestamp: new Date().toISOString(),
        ...options.additionalData
      };

      await reader.write({
        records: [
          {
            recordType: 'text',
            data: JSON.stringify(payload),
            lang: 'en'
          }
        ]
      });

      console.log('✅ Successfully wrote to NFC tag');
      return true;
    } catch (error: any) {
      console.error('Error writing to NFC:', error);
      return false;
    }
  }

  /**
   * Verify using QR code (fallback when NFC unavailable)
   * Returns verification data that can be used with blockchain
   */
  public async verifyWithQRCode(options: {
    qrData: string;
    targetDeviceId: string;
  }): Promise<NFCVerificationResult> {
    const { qrData, targetDeviceId } = options;

    try {
      // Parse QR data
      let payload: any;
      try {
        payload = JSON.parse(qrData);
      } catch {
        payload = { code: qrData };
      }

      // Check if QR contains valid device ID
      const isTargetMatch = !payload.deviceId || payload.deviceId === targetDeviceId;

      const verificationId = this.generateVerificationId();
      const signature = this.generateSignature(
        verificationId,
        this.currentDeviceId || 'unknown',
        targetDeviceId,
        `qr-${Date.now()}`
      );

      const verificationData: NFCVerificationData = {
        verificationId,
        sourceDeviceId: this.currentDeviceId || 'unknown',
        targetDeviceId,
        latitude: this.currentLatitude || 0,
        longitude: this.currentLongitude || 0,
        timestamp: new Date(),
        nfcTagId: `qr-${payload.code || Date.now()}`,
        signature,
        isValid: isTargetMatch
      };

      let result: NFCVerificationResult;

      if (isTargetMatch && this.solanaService) {
        result = await this.mintProofOfPresence(verificationData);
        result.usedFallback = true;
      } else if (isTargetMatch) {
        result = {
          success: true,
          data: verificationData,
          transactionId: null,
          nftMintAddress: null,
          errorMessage: null,
          timestamp: new Date(),
          usedFallback: true
        };
        console.log('✅ QR verification successful');
      } else {
        result = {
          success: false,
          data: verificationData,
          transactionId: null,
          nftMintAddress: null,
          errorMessage: 'Invalid QR code',
          timestamp: new Date(),
          usedFallback: true
        };
      }

      this.verificationHistory.push(result);
      return result;

    } catch (error: any) {
      return {
        success: false,
        data: null,
        transactionId: null,
        nftMintAddress: null,
        errorMessage: error.message,
        timestamp: new Date(),
        usedFallback: true
      };
    }
  }

  /**
   * Simple proximity verification
   */
  public async verifyProximity(targetDeviceId: string): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.cancelVerification();
        resolve(false);
      }, NFCService.SESSION_TIMEOUT_MS);

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
   * Cancel verification session
   */
  public async cancelVerification(): Promise<void> {
    if (this.sessionTimer) {
      clearTimeout(this.sessionTimer);
      this.sessionTimer = null;
    }

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    this.reader = null;
    this.isSessionActive = false;
    console.log('🛑 NFC session cancelled');
  }

  /**
   * Mint Proof-of-Presence NFT
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
          errorMessage: 'Blockchain not configured',
          timestamp: new Date(),
          usedFallback: false
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
        console.log('✅ NFT minted:', mintResult.transactionId);
        return {
          success: true,
          data,
          transactionId: mintResult.transactionId,
          nftMintAddress: mintResult.mintAddress,
          errorMessage: null,
          timestamp: new Date(),
          usedFallback: false
        };
      } else {
        return {
          success: true, // NFC succeeded
          data,
          transactionId: null,
          nftMintAddress: null,
          errorMessage: `Mint failed: ${mintResult.error}`,
          timestamp: new Date(),
          usedFallback: false
        };
      }
    } catch (error: any) {
      return {
        success: true,
        data,
        transactionId: null,
        nftMintAddress: null,
        errorMessage: error.message,
        timestamp: new Date(),
        usedFallback: false
      };
    }
  }

  /**
   * Generate verification ID
   */
  private generateVerificationId(): string {
    return `FV-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  }

  /**
   * Generate signature
   */
  private generateSignature(
    verificationId: string,
    sourceDeviceId: string,
    targetDeviceId: string,
    tagId: string
  ): string {
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
   * Clear history
   */
  public clearHistory(): void {
    this.verificationHistory = [];
  }

  /**
   * Get service status
   */
  public getHealthStatus(): Record<string, any> {
    return {
      isSupported: this.isNfcSupported,
      isSessionActive: this.isSessionActive,
      hasBlockchain: this.solanaService !== null,
      historyCount: this.verificationHistory.length,
      fallbackAvailable: true // QR always available
    };
  }

  /**
   * Dispose resources
   */
  public dispose(): void {
    this.cancelVerification();
    this.verificationHistory = [];
  }
}

// Export singleton
export const nfcService = NFCService.getInstance();
export default NFCService;
