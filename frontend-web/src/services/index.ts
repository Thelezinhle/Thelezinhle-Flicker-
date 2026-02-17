/**
 * Services Index - Export all services
 */

// GPS Service
export { gpsService, default as GPSService } from './GPSService';
export type { Position, GPSError } from './GPSService';

// Delivery Service
export { deliveryService, default as DeliveryService } from './DeliveryService';
export type {
  CreateOrderRequest,
  QRVerifyRequest,
  DeliveryResponse,
  VenueResponse,
  CreateVenueRequest,
  DeliveryStatus,
  APIResponse,
  LocationUpdate,
} from './DeliveryService';

// Hardware Service (existing)
export { HardwareService } from './HardwareService';
// Bluetooth Service
export { bluetoothService, default as BluetoothService } from './BluetoothService';
export type { BluetoothRangingData, BluetoothDeviceInfo } from './BluetoothService';

// Audio Ranging Service
export { audioRangingService, default as AudioRangingService } from './AudioRangingService';
export type { AudioRangingData, PingDetection } from './AudioRangingService';

// UWB Service
export { uwbService, default as UWBService } from './UWBService';
export type { UWBRangingData, UWBCapabilities, UWBSessionInfo } from './UWBService';

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
  BarometerStatus,
  FloorChangeEvent
} from './BarometerService';

// Proximity Manager
export { proximityManager, default as ProximityManager } from './ProximityManager';
export type { 
  ProximityStatus, 
  ProximityPhase, 
  ActiveTechnology,
  DeliveryTarget,
  GPSCoordinates 
} from './ProximityManager';

// API Service
export { apiService, default as ApiService } from './ApiService';