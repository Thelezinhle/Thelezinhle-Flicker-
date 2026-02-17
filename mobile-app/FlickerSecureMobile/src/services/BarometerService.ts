/**
 * Barometer Service for React Native
 * 
 * Uses atmospheric pressure to detect elevation changes and floor levels.
 * Especially useful in multi-floor buildings, stadiums, and vertical venues.
 * 
 * Formula: altitude = (R × T / g) × ln(P₀/P)
 * Typical floor height: ~3.5 meters
 */

import { Barometer } from 'expo-sensors';
import type { EventSubscription } from 'expo-modules-core';

// ============== Types ==============

export interface BarometerReading {
  pressure: number; // Pascals (Pa)
  relativeAltitude: number; // iOS only, meters
  timestamp: Date;
}

export interface BarometerStatus {
  isMonitoring: boolean;
  hasBarometer: boolean;
  currentPressure: number | null;
  baselinePressure: number | null;
  verticalDistance: number | null;
  estimatedAltitude: number;
  detectedFloor: number;
  lastUpdate: Date | null;
}

export interface FloorChangeEvent {
  previousFloor: number;
  currentFloor: number;
  altitudeChange: number;
  timestamp: Date;
}

type FloorChangeCallback = (event: FloorChangeEvent) => void;
type AltitudeCallback = (altitude: number) => void;

// ============== Constants ==============

// Standard atmosphere at sea level
const SEA_LEVEL_PRESSURE = 101325; // Pascals
const GAS_CONSTANT = 287.05; // J/(kg·K) - specific gas constant for dry air
const STANDARD_TEMP = 288.15; // Kelvin (15°C)
const GRAVITY = 9.80665; // m/s²
const DEFAULT_FLOOR_HEIGHT = 3.5; // meters

// ============== Service ==============

class BarometerService {
  private static instance: BarometerService;

  // Subscription
  private barometerSubscription: EventSubscription | null = null;

  // Pressure readings
  private baselinePressure: number | null = null;
  private currentPressure: number | null = null;
  private pressureBuffer: number[] = [];
  private static readonly BUFFER_SIZE = 10;

  // State
  private isMonitoring: boolean = false;
  private hasBarometer: boolean = false;
  private lastUpdateTime: Date | null = null;

  // Altitude tracking
  private estimatedAltitude: number = 0;
  private detectedFloor: number = 0;
  private floorHeight: number = DEFAULT_FLOOR_HEIGHT;

  // Floor altitude mappings (floor number -> altitude in meters)
  private floorAltitudes: Map<number, number> = new Map();

  // Callbacks
  private onFloorChange: FloorChangeCallback | null = null;
  private onAltitudeUpdate: AltitudeCallback | null = null;

  private constructor() {
    console.log('📊 BarometerService initialized');
    this.initializeFloors();
  }

  public static getInstance(): BarometerService {
    if (!BarometerService.instance) {
      BarometerService.instance = new BarometerService();
    }
    return BarometerService.instance;
  }

  /**
   * Initialize floor altitude mappings
   */
  private initializeFloors(): void {
    // Standard floor heights from -5 to +15
    for (let floor = -5; floor <= 15; floor++) {
      this.floorAltitudes.set(floor, floor * this.floorHeight);
    }
  }

  /**
   * Check if barometer is available
   */
  public async isAvailable(): Promise<boolean> {
    try {
      this.hasBarometer = await Barometer.isAvailableAsync();
      return this.hasBarometer;
    } catch {
      this.hasBarometer = false;
      return false;
    }
  }

  /**
   * Start barometer monitoring
   * @param referenceAltitude Optional starting altitude (default: 0 = ground level)
   */
  public async startMonitoring(options?: {
    referenceAltitude?: number;
    referenceFloor?: number;
  }): Promise<boolean> {
    if (this.isMonitoring) {
      console.warn('Barometer already monitoring');
      return false;
    }

    // Check availability
    const available = await this.isAvailable();
    if (!available) {
      console.error('Barometer not available on this device');
      return false;
    }

    this.isMonitoring = true;
    this.pressureBuffer = [];
    this.estimatedAltitude = options?.referenceAltitude ?? 0;
    this.detectedFloor = options?.referenceFloor ?? 0;
    this.lastUpdateTime = new Date();

    console.log('📊 Starting barometer monitoring');

    try {
      // Set update interval (100ms)
      Barometer.setUpdateInterval(100);

      let isFirstReading = true;

      this.barometerSubscription = Barometer.addListener((data: { pressure: number; relativeAltitude?: number }) => {
        this.processPressureReading(data.pressure, isFirstReading);
        
        if (isFirstReading) {
          this.baselinePressure = data.pressure;
          console.log(`✅ Barometer baseline: ${this.baselinePressure.toFixed(1)} Pa`);
          isFirstReading = false;
        }
      });

      return true;
    } catch (error: any) {
      console.error('Error starting barometer:', error);
      this.isMonitoring = false;
      return false;
    }
  }

  /**
   * Stop barometer monitoring
   */
  public async stopMonitoring(): Promise<void> {
    this.isMonitoring = false;
    this.barometerSubscription?.remove();
    this.barometerSubscription = null;
    console.log('🛑 Barometer monitoring stopped');
  }

  /**
   * Process pressure reading with averaging
   */
  private processPressureReading(pressure: number, isFirstReading: boolean): void {
    if (!this.isMonitoring) return;

    // Add to buffer
    this.pressureBuffer.push(pressure);
    if (this.pressureBuffer.length > BarometerService.BUFFER_SIZE) {
      this.pressureBuffer.shift();
    }

    // Calculate averaged pressure
    const sum = this.pressureBuffer.reduce((a, b) => a + b, 0);
    this.currentPressure = sum / this.pressureBuffer.length;

    if (!isFirstReading && this.baselinePressure !== null) {
      this.updateAltitude();
    }

    this.lastUpdateTime = new Date();
  }

  /**
   * Update altitude based on pressure change
   */
  private updateAltitude(): void {
    if (this.baselinePressure === null || this.currentPressure === null) return;

    // Barometric formula: h = (R × T / g) × ln(P₀/P)
    const pressureRatio = this.baselinePressure / this.currentPressure;
    const altitudeChange = (GAS_CONSTANT * STANDARD_TEMP / GRAVITY) * Math.log(pressureRatio);

    // Low-pass filter for smooth updates
    this.estimatedAltitude += altitudeChange * 0.1;
    this.estimatedAltitude = Math.max(-100, Math.min(500, this.estimatedAltitude));

    // Detect floor changes
    this.detectFloor();

    // Notify altitude callback
    this.onAltitudeUpdate?.(this.estimatedAltitude);
  }

  /**
   * Detect which floor user is on
   */
  private detectFloor(): void {
    let closestFloor = 0;
    let minDifference = Infinity;

    this.floorAltitudes.forEach((altitude, floor) => {
      const difference = Math.abs(this.estimatedAltitude - altitude);
      if (difference < minDifference) {
        minDifference = difference;
        closestFloor = floor;
      }
    });

    // Only update if within 1.5m of floor level and different from current
    if (minDifference < 1.5 && closestFloor !== this.detectedFloor) {
      const prevFloor = this.detectedFloor;
      this.detectedFloor = closestFloor;

      console.log(`🏢 Floor change: ${prevFloor} → ${closestFloor}`);

      // Notify callback
      this.onFloorChange?.({
        previousFloor: prevFloor,
        currentFloor: closestFloor,
        altitudeChange: this.estimatedAltitude,
        timestamp: new Date()
      });
    }
  }

  /**
   * Get vertical distance from baseline (meters)
   * Positive = above baseline, Negative = below
   */
  public getVerticalDistance(): number | null {
    if (this.baselinePressure === null || this.currentPressure === null) {
      return null;
    }

    const pressureRatio = this.baselinePressure / this.currentPressure;
    return (GAS_CONSTANT * STANDARD_TEMP / GRAVITY) * Math.log(pressureRatio);
  }

  /**
   * Get estimated altitude
   */
  public getAltitude(): number {
    return this.estimatedAltitude;
  }

  /**
   * Get detected floor number
   */
  public getFloor(): number {
    return this.detectedFloor;
  }

  /**
   * Get current pressure (Pascals)
   */
  public getPressure(): number | null {
    return this.currentPressure;
  }

  /**
   * Get baseline pressure
   */
  public getBaselinePressure(): number | null {
    return this.baselinePressure;
  }

  /**
   * Reset baseline to current pressure
   * Call when user changes reference point
   */
  public resetBaseline(newFloor: number = 0): void {
    if (this.currentPressure !== null) {
      this.baselinePressure = this.currentPressure;
      this.estimatedAltitude = newFloor * this.floorHeight;
      this.detectedFloor = newFloor;
      console.log(`📍 Baseline reset: ${this.baselinePressure.toFixed(1)} Pa at floor ${newFloor}`);
    }
  }

  /**
   * Calibrate floor height
   * @param measuredAltitude Actual altitude change measured
   * @param floorsDifference Number of floors traveled
   */
  public calibrateFloorHeight(measuredAltitude: number, floorsDifference: number): void {
    if (floorsDifference > 0 && measuredAltitude > 0) {
      const calculatedHeight = measuredAltitude / floorsDifference;
      
      // Reasonable range check (2-5 meters per floor)
      if (calculatedHeight >= 2.0 && calculatedHeight <= 5.0) {
        this.floorHeight = calculatedHeight;
        this.initializeFloors(); // Recalculate floor altitudes
        console.log(`🏗️ Floor height calibrated: ${calculatedHeight.toFixed(2)}m`);
      }
    }
  }

  /**
   * Get altitude relative to sea level
   */
  public getSeaLevelAltitude(): number | null {
    if (this.currentPressure === null) return null;

    const ratio = SEA_LEVEL_PRESSURE / this.currentPressure;
    return (GAS_CONSTANT * STANDARD_TEMP / GRAVITY) * Math.log(ratio);
  }

  /**
   * Set floor change callback
   */
  public setFloorChangeCallback(callback: FloorChangeCallback): void {
    this.onFloorChange = callback;
  }

  /**
   * Set altitude update callback
   */
  public setAltitudeCallback(callback: AltitudeCallback): void {
    this.onAltitudeUpdate = callback;
  }

  /**
   * Check if user moved up
   */
  public movedUp(): boolean {
    const vertical = this.getVerticalDistance();
    return vertical !== null && vertical > 1.0;
  }

  /**
   * Check if user moved down
   */
  public movedDown(): boolean {
    const vertical = this.getVerticalDistance();
    return vertical !== null && vertical < -1.0;
  }

  /**
   * Get service status
   */
  public getStatus(): BarometerStatus {
    return {
      isMonitoring: this.isMonitoring,
      hasBarometer: this.hasBarometer,
      currentPressure: this.currentPressure,
      baselinePressure: this.baselinePressure,
      verticalDistance: this.getVerticalDistance(),
      estimatedAltitude: this.estimatedAltitude,
      detectedFloor: this.detectedFloor,
      lastUpdate: this.lastUpdateTime
    };
  }

  /**
   * Dispose resources
   */
  public async dispose(): Promise<void> {
    await this.stopMonitoring();
    this.onFloorChange = null;
    this.onAltitudeUpdate = null;
  }
}

// Export singleton
export const barometerService = BarometerService.getInstance();
export default BarometerService;
