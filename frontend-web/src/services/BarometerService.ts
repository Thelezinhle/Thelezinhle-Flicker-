/**
 * Barometer Service for Web
 * 
 * NOTE: Web browsers do NOT have access to barometer sensors.
 * This service provides a manual floor tracking fallback that
 * allows users to manually indicate floor changes or uses
 * external data sources.
 * 
 * For automatic floor detection, use the React Native mobile app.
 */

// ============== Types ==============

export interface BarometerStatus {
  isMonitoring: boolean;
  hasBarometer: boolean;
  currentPressure: number | null;
  baselinePressure: number | null;
  verticalDistance: number | null;
  estimatedAltitude: number;
  detectedFloor: number;
  lastUpdate: Date | null;
  isManualMode: boolean;
}

export interface FloorChangeEvent {
  previousFloor: number;
  currentFloor: number;
  altitudeChange: number;
  timestamp: Date;
  source: 'manual' | 'api' | 'simulation';
}

type FloorChangeCallback = (event: FloorChangeEvent) => void;
type AltitudeCallback = (altitude: number) => void;

// ============== Constants ==============

const DEFAULT_FLOOR_HEIGHT = 3.5; // meters

// ============== Service ==============

class BarometerService {
  private static instance: BarometerService;

  // State
  private isMonitoring: boolean = false;
  private currentFloor: number = 0;
  private estimatedAltitude: number = 0;
  private floorHeight: number = DEFAULT_FLOOR_HEIGHT;
  private lastUpdateTime: Date | null = null;

  // Floor mappings
  private floorAltitudes: Map<number, number> = new Map();

  // Callbacks
  private onFloorChange: FloorChangeCallback | null = null;
  private onAltitudeUpdate: AltitudeCallback | null = null;

  // Simulation
  private simulationInterval: number | null = null;

  private constructor() {
    console.log('📊 BarometerService initialized (Web - Manual Mode)');
    this.initializeFloors();
  }

  public static getInstance(): BarometerService {
    if (!BarometerService.instance) {
      BarometerService.instance = new BarometerService();
    }
    return BarometerService.instance;
  }

  /**
   * Initialize floor mappings
   */
  private initializeFloors(): void {
    for (let floor = -5; floor <= 15; floor++) {
      this.floorAltitudes.set(floor, floor * this.floorHeight);
    }
  }

  /**
   * Check if barometer is available (always false for web)
   */
  public async isAvailable(): Promise<boolean> {
    // Web browsers don't have barometer access
    return false;
  }

  /**
   * Start monitoring (manual mode for web)
   */
  public async startMonitoring(options?: {
    referenceAltitude?: number;
    referenceFloor?: number;
    enableSimulation?: boolean;
  }): Promise<boolean> {
    if (this.isMonitoring) {
      console.warn('Already monitoring');
      return false;
    }

    this.isMonitoring = true;
    this.currentFloor = options?.referenceFloor ?? 0;
    this.estimatedAltitude = options?.referenceAltitude ?? (this.currentFloor * this.floorHeight);
    this.lastUpdateTime = new Date();

    console.log('📊 Barometer monitoring started (Manual Mode)');
    console.log('⚠️ Web browsers cannot access barometer. Use setFloor() to manually update.');

    // Optional simulation for testing
    if (options?.enableSimulation) {
      this.startSimulation();
    }

    return true;
  }

  /**
   * Start simulation for testing
   */
  private startSimulation(): void {
    console.log('🎮 Starting floor simulation');
    
    let direction = 1;
    
    this.simulationInterval = window.setInterval(() => {
      // Randomly change floors
      if (Math.random() > 0.9) {
        const newFloor = this.currentFloor + direction;
        
        // Reverse direction at limits
        if (newFloor > 5 || newFloor < -1) {
          direction *= -1;
        } else {
          this.setFloor(newFloor, 'simulation');
        }
      }
    }, 3000);
  }

  /**
   * Stop monitoring
   */
  public async stopMonitoring(): Promise<void> {
    this.isMonitoring = false;
    
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }

    console.log('🛑 Barometer monitoring stopped');
  }

  /**
   * Manually set current floor
   * Use this method for web since we can't auto-detect
   */
  public setFloor(floor: number, source: 'manual' | 'api' | 'simulation' = 'manual'): void {
    if (floor === this.currentFloor) return;

    const prevFloor = this.currentFloor;
    const prevAltitude = this.estimatedAltitude;
    
    this.currentFloor = floor;
    this.estimatedAltitude = floor * this.floorHeight;
    this.lastUpdateTime = new Date();

    console.log(`🏢 Floor change: ${prevFloor} → ${floor} (${source})`);

    // Notify callbacks
    this.onFloorChange?.({
      previousFloor: prevFloor,
      currentFloor: floor,
      altitudeChange: this.estimatedAltitude - prevAltitude,
      timestamp: new Date(),
      source
    });

    this.onAltitudeUpdate?.(this.estimatedAltitude);
  }

  /**
   * Move up one floor
   */
  public moveUp(): void {
    this.setFloor(this.currentFloor + 1, 'manual');
  }

  /**
   * Move down one floor
   */
  public moveDown(): void {
    this.setFloor(this.currentFloor - 1, 'manual');
  }

  /**
   * Get vertical distance from baseline
   */
  public getVerticalDistance(): number | null {
    return this.estimatedAltitude;
  }

  /**
   * Get estimated altitude
   */
  public getAltitude(): number {
    return this.estimatedAltitude;
  }

  /**
   * Get current floor
   */
  public getFloor(): number {
    return this.currentFloor;
  }

  /**
   * Get pressure (not available on web)
   */
  public getPressure(): number | null {
    return null;
  }

  /**
   * Get baseline pressure (not available on web)
   */
  public getBaselinePressure(): number | null {
    return null;
  }

  /**
   * Reset baseline to current
   */
  public resetBaseline(newFloor: number = 0): void {
    this.currentFloor = newFloor;
    this.estimatedAltitude = newFloor * this.floorHeight;
    console.log(`📍 Baseline reset to floor ${newFloor}`);
  }

  /**
   * Calibrate floor height
   */
  public calibrateFloorHeight(measuredAltitude: number, floorsDifference: number): void {
    if (floorsDifference > 0 && measuredAltitude > 0) {
      const calculated = measuredAltitude / floorsDifference;
      if (calculated >= 2.0 && calculated <= 5.0) {
        this.floorHeight = calculated;
        this.initializeFloors();
        console.log(`🏗️ Floor height calibrated: ${calculated.toFixed(2)}m`);
      }
    }
  }

  /**
   * Get sea level altitude (not available on web)
   */
  public getSeaLevelAltitude(): number | null {
    return null;
  }

  /**
   * Set floor change callback
   */
  public setFloorChangeCallback(callback: FloorChangeCallback): void {
    this.onFloorChange = callback;
  }

  /**
   * Set altitude callback
   */
  public setAltitudeCallback(callback: AltitudeCallback): void {
    this.onAltitudeUpdate = callback;
  }

  /**
   * Check if moved up
   */
  public movedUp(): boolean {
    return this.estimatedAltitude > 0;
  }

  /**
   * Check if moved down
   */
  public movedDown(): boolean {
    return this.estimatedAltitude < 0;
  }

  /**
   * Get status
   */
  public getStatus(): BarometerStatus {
    return {
      isMonitoring: this.isMonitoring,
      hasBarometer: false, // Never available on web
      currentPressure: null,
      baselinePressure: null,
      verticalDistance: this.estimatedAltitude,
      estimatedAltitude: this.estimatedAltitude,
      detectedFloor: this.currentFloor,
      lastUpdate: this.lastUpdateTime,
      isManualMode: true
    };
  }

  /**
   * Get floor name helper
   */
  public getFloorName(floor?: number): string {
    const f = floor ?? this.currentFloor;
    if (f === 0) return 'Ground Floor';
    if (f < 0) return `Basement ${Math.abs(f)}`;
    return `Floor ${f}`;
  }

  /**
   * Dispose
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
