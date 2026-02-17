/**
 * Mobile Services Index - Export all services for FlickerSecure Mobile
 */

// Location Service
export { default as LocationService } from './LocationService';
export type { LocationData, DeliveryLocation } from './LocationService';

// UWB Service
export { uwbService, default as UWBService } from './UWBService';
export type { 
  UWBRangingData, 
  UWBCapabilities, 
  UWBSessionInfo 
} from './UWBService';

// NFC Service
export { nfcService, default as NFCService } from './NFCService';
export type { 
  NFCVerificationData, 
  NFCVerificationResult,
  NFCTagData,
  NFCCapabilities 
} from './NFCService';

// Solana Blockchain Service
export { solanaService, default as SolanaService } from './SolanaService';
export type {
  SolanaConfig,
  WalletInfo,
  ProofOfPresenceMetadata,
  MintResult,
  TransactionStatus
} from './SolanaService';

// PDR (Pedestrian Dead Reckoning) Service
export { pdrService, default as PDRService } from './PDRService';
export type {
  Vector3,
  PDRPosition,
  GPSAnchor,
  PDRStatus,
  SensorAvailability
} from './PDRService';

// Barometer Service
export { barometerService, default as BarometerService } from './BarometerService';
export type {
  BarometerReading,
  BarometerStatus,
  FloorChangeEvent
} from './BarometerService';

// Hardware Services
export { HardwareService } from './HardwareService';
export { ExpoHardwareService } from './ExpoHardwareService';
