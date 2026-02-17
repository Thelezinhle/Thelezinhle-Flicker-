/**
 * PDR (Pedestrian Dead Reckoning) Service for Web
 * 
 * Uses DeviceMotion and DeviceOrientation APIs to track movement
 * in GPS-denied areas. Limited browser support - requires HTTPS and
 * user permission on iOS 13+.
 * 
 * Supported: Chrome, Safari (with permission), Firefox (partial)
 */

// ============== Types ==============

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface PDRPosition {
  latitude: number;
  longitude: number;
  altitude: number;
  accuracy: number;
  heading: number;
  speed: number;
  timestamp: Date;
  source: 'pdr' | 'simulation';
}

export interface GPSAnchor {
  latitude: number;
  longitude: number;
  altitude: number;
  accuracy: number;
  timestamp: Date;
}

export interface PDRStatus {
  isTracking: boolean;
  hasDeviceMotion: boolean;
  hasDeviceOrientation: boolean;
  stepsDetected: number;
  distanceTraveled: number;
  currentHeading: number;
  currentSpeed: number;
  relativePosition: Vector3;
  anchorSet: boolean;
  isSimulation: boolean;
}

export interface SensorAvailability {
  deviceMotion: boolean;
  deviceOrientation: boolean;
  permissionGranted: boolean;
}

type PositionCallback = (position: PDRPosition) => void;
type StepCallback = (stepCount: number) => void;

// ============== Constants ==============

const EARTH_RADIUS = 6371000; // meters
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const GRAVITY = 9.81; // m/s²

// ============== Service ==============

class PDRService {
  private static instance: PDRService;

  // Position tracking
  private position: Vector3 = { x: 0, y: 0, z: 0 };
  private velocity: Vector3 = { x: 0, y: 0, z: 0 };

  // Orientation (Euler angles in radians)
  private yaw: number = 0;      // Heading around Z axis
  private _pitch: number = 0;   // Rotation around Y axis (unused but stored)
  private _roll: number = 0;    // Rotation around X axis (unused but stored)

  // GPS anchor
  private anchorGPS: GPSAnchor | null = null;

  // Step detection
  private stepLength: number = 0.7;
  private totalSteps: number = 0;
  private totalDistance: number = 0;
  private lastStepTime: number = 0;

  // State
  private isTracking: boolean = false;
  private lastUpdateTime: number = 0;
  private hasDeviceMotion: boolean = false;
  private hasDeviceOrientation: boolean = false;
  private permissionGranted: boolean = false;
  private isSimulation: boolean = false;

  // Event handlers
  private motionHandler: ((event: DeviceMotionEvent) => void) | null = null;
  private orientationHandler: ((event: DeviceOrientationEvent) => void) | null = null;

  // Callbacks
  private onPositionUpdate: PositionCallback | null = null;
  private onStepDetected: StepCallback | null = null;

  // Simulation
  private simulationInterval: number | null = null;

  private constructor() {
    this.checkCapabilities();
    console.log('🚶 PDRService initialized (Web)');
  }

  public static getInstance(): PDRService {
    if (!PDRService.instance) {
      PDRService.instance = new PDRService();
    }
    return PDRService.instance;
  }

  /**
   * Check browser capabilities
   */
  private checkCapabilities(): void {
    this.hasDeviceMotion = 'DeviceMotionEvent' in window;
    this.hasDeviceOrientation = 'DeviceOrientationEvent' in window;

    console.log(`DeviceMotion: ${this.hasDeviceMotion}, DeviceOrientation: ${this.hasDeviceOrientation}`);
  }

  /**
   * Request sensor permissions (required for iOS 13+)
   */
  public async requestPermission(): Promise<boolean> {
    try {
      // iOS 13+ requires explicit permission
      if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
        const motionPermission = await (DeviceMotionEvent as any).requestPermission();
        const orientationPermission = await (DeviceOrientationEvent as any).requestPermission();
        
        this.permissionGranted = motionPermission === 'granted' && orientationPermission === 'granted';
        
        if (!this.permissionGranted) {
          console.warn('Sensor permission denied');
        }
      } else {
        // Other browsers don't need explicit permission
        this.permissionGranted = this.hasDeviceMotion;
      }

      return this.permissionGranted;
    } catch (error) {
      console.error('Error requesting sensor permission:', error);
      return false;
    }
  }

  /**
   * Check sensor availability
   */
  public async checkSensorAvailability(): Promise<SensorAvailability> {
    return {
      deviceMotion: this.hasDeviceMotion,
      deviceOrientation: this.hasDeviceOrientation,
      permissionGranted: this.permissionGranted
    };
  }

  /**
   * Start PDR tracking
   */
  public async startTracking(anchor: GPSAnchor): Promise<boolean> {
    if (this.isTracking) {
      console.warn('PDR already tracking');
      return false;
    }

    // Request permission if not granted
    if (!this.permissionGranted) {
      await this.requestPermission();
    }

    this.anchorGPS = anchor;
    this.position = { x: 0, y: 0, z: 0 };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.totalSteps = 0;
    this.totalDistance = 0;
    this.lastUpdateTime = Date.now();
    this.isTracking = true;

    console.log(`🚶 Starting PDR from anchor: ${anchor.latitude.toFixed(6)}, ${anchor.longitude.toFixed(6)}`);

    // Try real sensors first
    if (this.hasDeviceMotion && this.permissionGranted) {
      this.startRealSensors();
      this.isSimulation = false;
    } else {
      console.log('⚠️ Device sensors unavailable - using simulation mode');
      this.startSimulation();
      this.isSimulation = true;
    }

    return true;
  }

  /**
   * Start real device sensors
   */
  private startRealSensors(): void {
    // Device motion handler
    this.motionHandler = (event: DeviceMotionEvent) => {
      this.processDeviceMotion(event);
    };

    // Device orientation handler
    this.orientationHandler = (event: DeviceOrientationEvent) => {
      this.processDeviceOrientation(event);
    };

    window.addEventListener('devicemotion', this.motionHandler, true);
    window.addEventListener('deviceorientation', this.orientationHandler, true);

    console.log('✅ Real sensors started');
  }

  /**
   * Start simulation mode (for desktop/unsupported browsers)
   */
  private startSimulation(): void {
    let time = 0;
    
    this.simulationInterval = window.setInterval(() => {
      time += 0.1;

      // Simulate walking in a pattern
      if (Math.random() > 0.7) {
        // Random step
        this.totalSteps++;
        this.totalDistance += this.stepLength;

        // Update position with some randomness
        const heading = this.yaw + (Math.random() - 0.5) * 0.2;
        this.position.x += this.stepLength * Math.cos(heading);
        this.position.y += this.stepLength * Math.sin(heading);

        this.onStepDetected?.(this.totalSteps);

        const estimated = this.getEstimatedPosition();
        if (estimated) {
          this.onPositionUpdate?.(estimated);
        }
      }

      // Slowly rotate heading
      this.yaw += 0.01;
      if (this.yaw > 2 * Math.PI) this.yaw -= 2 * Math.PI;

    }, 500);
  }

  /**
   * Process DeviceMotion event
   */
  private processDeviceMotion(event: DeviceMotionEvent): void {
    if (!this.isTracking) return;

    const now = Date.now();

    const accel = event.accelerationIncludingGravity;
    if (!accel?.x || !accel?.y || !accel?.z) return;

    // Calculate magnitude
    const magnitude = Math.sqrt(accel.x ** 2 + accel.y ** 2 + (accel.z ?? 0) ** 2);

    // Step detection
    this.detectStep(magnitude, now);

    this.lastUpdateTime = now;
  }

  /**
   * Process DeviceOrientation event
   */
  private processDeviceOrientation(event: DeviceOrientationEvent): void {
    if (!this.isTracking) return;

    // Alpha is the compass heading (0-360)
    if (event.alpha !== null) {
      this.yaw = event.alpha * DEG_TO_RAD;
    }

    // Beta is the pitch (-180 to 180)
    if (event.beta !== null) {
      this._pitch = event.beta * DEG_TO_RAD;
    }

    // Gamma is the roll (-90 to 90)
    if (event.gamma !== null) {
      this._roll = event.gamma * DEG_TO_RAD;
    }
  }

  /**
   * Detect steps from acceleration
   */
  private detectStep(magnitude: number, now: number): void {
    const stepThresholdLow = GRAVITY + 2.0;
    const stepThresholdHigh = GRAVITY + 5.0;

    if (magnitude > stepThresholdLow && magnitude < stepThresholdHigh) {
      if (now - this.lastStepTime > 300) {
        this.totalSteps++;
        this.lastStepTime = now;

        // Advance position
        const dx = this.stepLength * Math.cos(this.yaw);
        const dy = this.stepLength * Math.sin(this.yaw);

        this.position.x += dx;
        this.position.y += dy;
        this.totalDistance += this.stepLength;

        this.onStepDetected?.(this.totalSteps);

        const estimated = this.getEstimatedPosition();
        if (estimated) {
          this.onPositionUpdate?.(estimated);
        }

        console.log(`👣 Step #${this.totalSteps}`);
      }
    }
  }

  /**
   * Stop PDR tracking
   */
  public async stopTracking(): Promise<void> {
    this.isTracking = false;

    if (this.motionHandler) {
      window.removeEventListener('devicemotion', this.motionHandler, true);
      this.motionHandler = null;
    }

    if (this.orientationHandler) {
      window.removeEventListener('deviceorientation', this.orientationHandler, true);
      this.orientationHandler = null;
    }

    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }

    console.log(`🛑 PDR stopped - Steps: ${this.totalSteps}, Distance: ${this.totalDistance.toFixed(2)}m`);
  }

  /**
   * Get estimated absolute position
   */
  public getEstimatedPosition(): PDRPosition | null {
    if (!this.anchorGPS) return null;

    const coords = this.calculateGPSCoordinates(
      this.anchorGPS.latitude,
      this.anchorGPS.longitude,
      this.position.x,
      this.position.y
    );

    const speed = Math.sqrt(this.velocity.x ** 2 + this.velocity.y ** 2);

    return {
      latitude: coords.latitude,
      longitude: coords.longitude,
      altitude: this.anchorGPS.altitude + this.position.z,
      accuracy: 5.0 + (this.totalDistance * 0.1),
      heading: this.yaw * RAD_TO_DEG,
      speed,
      timestamp: new Date(),
      source: this.isSimulation ? 'simulation' : 'pdr'
    };
  }

  /**
   * Get relative position from anchor
   */
  public getRelativePosition(): Vector3 {
    return { ...this.position };
  }

  /**
   * Get heading (0-360 degrees)
   */
  public getHeading(): number {
    return this.yaw * RAD_TO_DEG;
  }

  /**
   * Get step count
   */
  public getStepCount(): number {
    return this.totalSteps;
  }

  /**
   * Get distance traveled
   */
  public getDistanceTraveled(): number {
    return this.totalDistance;
  }

  /**
   * Check if moving
   */
  public isDeviceMoving(): boolean {
    return Math.sqrt(this.velocity.x ** 2 + this.velocity.y ** 2) > 0.2;
  }

  /**
   * Calibrate step length
   */
  public calibrateStepLength(measuredDistance: number, stepCount: number): void {
    if (stepCount > 0 && measuredDistance > 0) {
      this.stepLength = measuredDistance / stepCount;
      console.log(`📏 Step length: ${this.stepLength.toFixed(2)}m`);
    }
  }

  /**
   * Update anchor
   */
  public updateAnchor(newAnchor: GPSAnchor): void {
    this.anchorGPS = newAnchor;
    this.position = { x: 0, y: 0, z: 0 };
    this.totalDistance = 0;
  }

  /**
   * Set position callback
   */
  public setPositionCallback(callback: PositionCallback): void {
    this.onPositionUpdate = callback;
  }

  /**
   * Set step callback
   */
  public setStepCallback(callback: StepCallback): void {
    this.onStepDetected = callback;
  }

  /**
   * Get status
   */
  public getStatus(): PDRStatus & { orientation: { yaw: number; pitch: number; roll: number }; lastUpdate: number } {
    return {
      isTracking: this.isTracking,
      hasDeviceMotion: this.hasDeviceMotion,
      hasDeviceOrientation: this.hasDeviceOrientation,
      stepsDetected: this.totalSteps,
      distanceTraveled: this.totalDistance,
      currentHeading: this.getHeading(),
      currentSpeed: Math.sqrt(this.velocity.x ** 2 + this.velocity.y ** 2),
      relativePosition: { ...this.position },
      anchorSet: this.anchorGPS !== null,
      isSimulation: this.isSimulation,
      orientation: {
        yaw: this.yaw,
        pitch: this._pitch,
        roll: this._roll
      },
      lastUpdate: this.lastUpdateTime
    };
  }

  /**
   * Calculate GPS coordinates from displacement
   */
  private calculateGPSCoordinates(
    lat0: number,
    lon0: number,
    dx: number,
    dy: number
  ): { latitude: number; longitude: number } {
    const dLat = dy / EARTH_RADIUS;
    const dLon = dx / (EARTH_RADIUS * Math.cos(lat0 * DEG_TO_RAD));

    return {
      latitude: lat0 + (dLat * RAD_TO_DEG),
      longitude: lon0 + (dLon * RAD_TO_DEG)
    };
  }

  /**
   * Dispose
   */
  public async dispose(): Promise<void> {
    await this.stopTracking();
    this.onPositionUpdate = null;
    this.onStepDetected = null;
  }
}

// Export singleton
export const pdrService = PDRService.getInstance();
export default PDRService;
