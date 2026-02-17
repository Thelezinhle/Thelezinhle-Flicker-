/**
 * PDR (Pedestrian Dead Reckoning) Service for React Native
 * 
 * Uses accelerometer, gyroscope, and magnetometer sensor fusion to maintain
 * tracking in GPS-denied areas (indoors, tunnels, underground).
 * 
 * Features:
 * - Step detection via accelerometer
 * - Heading tracking via gyroscope + magnetometer fusion
 * - Position estimation from anchor GPS point
 * - Works in blind spots where GPS is unavailable
 */

import { Accelerometer, Gyroscope, Magnetometer } from 'expo-sensors';
import type { EventSubscription } from 'expo-modules-core';

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
  source: 'pdr';
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
  hasTriplexSensors: boolean;
  stepsDetected: number;
  distanceTraveled: number;
  currentHeading: number;
  currentSpeed: number;
  relativePosition: Vector3;
  anchorSet: boolean;
}

export interface SensorAvailability {
  accelerometer: boolean;
  gyroscope: boolean;
  magnetometer: boolean;
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

  // Subscriptions
  private accelerometerSubscription: EventSubscription | null = null;
  private gyroscopeSubscription: EventSubscription | null = null;
  private magnetometerSubscription: EventSubscription | null = null;

  // Position tracking
  private position: Vector3 = { x: 0, y: 0, z: 0 }; // Relative from anchor
  private velocity: Vector3 = { x: 0, y: 0, z: 0 };
  private acceleration: Vector3 = { x: 0, y: 0, z: 0 };

  // Orientation (Euler angles in radians)
  private yaw: number = 0; // Heading around Z axis
  private pitch: number = 0;
  private roll: number = 0;

  // GPS anchor
  private anchorGPS: GPSAnchor | null = null;

  // Step detection
  private stepLength: number = 0.7; // Average step length in meters
  private stepThreshold: number = 1.5; // Acceleration threshold
  private stepCounter: number = 0;
  private lastStepTime: number = 0;
  private totalSteps: number = 0;
  private totalDistance: number = 0;

  // State
  private isTracking: boolean = false;
  private lastUpdateTime: number = 0;
  private hasTriplexSensors: boolean = false;

  // Callbacks
  private onPositionUpdate: PositionCallback | null = null;
  private onStepDetected: StepCallback | null = null;

  // Sensor update interval (ms)
  private static readonly SENSOR_INTERVAL = 50;

  private constructor() {
    console.log('🚶 PDRService initialized');
  }

  public static getInstance(): PDRService {
    if (!PDRService.instance) {
      PDRService.instance = new PDRService();
    }
    return PDRService.instance;
  }

  /**
   * Check sensor availability
   */
  public async checkSensorAvailability(): Promise<SensorAvailability> {
    const [accel, gyro, mag] = await Promise.all([
      Accelerometer.isAvailableAsync(),
      Gyroscope.isAvailableAsync(),
      Magnetometer.isAvailableAsync()
    ]);

    this.hasTriplexSensors = accel && gyro && mag;

    return {
      accelerometer: accel,
      gyroscope: gyro,
      magnetometer: mag
    };
  }

  /**
   * Start PDR tracking from GPS anchor point
   */
  public async startTracking(anchor: GPSAnchor): Promise<boolean> {
    if (this.isTracking) {
      console.warn('PDR already tracking');
      return false;
    }

    // Check sensors
    const availability = await this.checkSensorAvailability();
    if (!availability.accelerometer) {
      console.error('Accelerometer not available - PDR cannot function');
      return false;
    }

    // Set anchor
    this.anchorGPS = anchor;
    
    // Reset state
    this.position = { x: 0, y: 0, z: 0 };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;
    this.totalSteps = 0;
    this.totalDistance = 0;
    this.lastUpdateTime = Date.now();

    this.isTracking = true;

    console.log(`🚶 Starting PDR from anchor: ${anchor.latitude.toFixed(6)}, ${anchor.longitude.toFixed(6)}`);

    try {
      // Set sensor update interval
      Accelerometer.setUpdateInterval(PDRService.SENSOR_INTERVAL);
      Gyroscope.setUpdateInterval(PDRService.SENSOR_INTERVAL);
      Magnetometer.setUpdateInterval(PDRService.SENSOR_INTERVAL * 2); // Lower frequency

      // Start accelerometer (required)
      this.accelerometerSubscription = Accelerometer.addListener((data: { x: number; y: number; z: number }) => {
        this.processAccelerometer(data);
      });

      // Start gyroscope (if available)
      if (availability.gyroscope) {
        this.gyroscopeSubscription = Gyroscope.addListener((data: { x: number; y: number; z: number }) => {
          this.processGyroscope(data);
        });
      }

      // Start magnetometer (if available)
      if (availability.magnetometer) {
        this.magnetometerSubscription = Magnetometer.addListener((data: { x: number; y: number; z: number }) => {
          this.processMagnetometer(data);
        });
      }

      console.log(`✅ PDR sensors started (Accel${availability.gyroscope ? ' + Gyro' : ''}${availability.magnetometer ? ' + Mag' : ''})`);
      return true;
    } catch (error: any) {
      console.error('Error starting PDR sensors:', error);
      this.isTracking = false;
      return false;
    }
  }

  /**
   * Stop PDR tracking
   */
  public async stopTracking(): Promise<void> {
    this.isTracking = false;

    this.accelerometerSubscription?.remove();
    this.gyroscopeSubscription?.remove();
    this.magnetometerSubscription?.remove();

    this.accelerometerSubscription = null;
    this.gyroscopeSubscription = null;
    this.magnetometerSubscription = null;

    console.log(`🛑 PDR stopped - Steps: ${this.totalSteps}, Distance: ${this.totalDistance.toFixed(2)}m`);
  }

  /**
   * Process accelerometer data for step detection
   */
  private processAccelerometer(data: { x: number; y: number; z: number }): void {
    if (!this.isTracking) return;

    const now = Date.now();
    const dt = (now - this.lastUpdateTime) / 1000; // Convert to seconds

    // Calculate acceleration magnitude
    const accelMagnitude = Math.sqrt(data.x * data.x + data.y * data.y + data.z * data.z);

    // Step detection
    this.detectStep(accelMagnitude, now);

    // Update motion
    this.updateMotion(accelMagnitude, dt);

    this.lastUpdateTime = now;
  }

  /**
   * Detect steps from acceleration pattern
   */
  private detectStep(accelMagnitude: number, now: number): void {
    // Typical walking acceleration peaks: 1.5-3.0 m/s² above gravity
    const stepThresholdLow = GRAVITY + 1.5;
    const stepThresholdHigh = GRAVITY + 3.0;

    if (accelMagnitude > stepThresholdLow && accelMagnitude < stepThresholdHigh) {
      // Debounce: steps should be at least 300ms apart
      if (now - this.lastStepTime > 300) {
        this.stepCounter++;
        this.totalSteps++;
        this.lastStepTime = now;

        // Advance position in heading direction
        const dx = this.stepLength * Math.cos(this.yaw);
        const dy = this.stepLength * Math.sin(this.yaw);

        this.position.x += dx;
        this.position.y += dy;
        this.totalDistance += this.stepLength;

        // Notify callback
        this.onStepDetected?.(this.totalSteps);

        // Notify position update
        const estimated = this.getEstimatedPosition();
        if (estimated) {
          this.onPositionUpdate?.(estimated);
        }

        console.log(`👣 Step #${this.totalSteps} - Pos: (${this.position.x.toFixed(2)}, ${this.position.y.toFixed(2)})`);
      }
    }
  }

  /**
   * Update motion state
   */
  private updateMotion(accelMagnitude: number, dt: number): void {
    // Remove gravity component
    const netAccel = accelMagnitude - GRAVITY;

    if (Math.abs(netAccel) > 0.2 && dt > 0 && dt < 1) {
      // Calculate speed from net acceleration
      const speed = Math.abs(netAccel) * dt;
      
      // Clamp to reasonable walking speed
      const clampedSpeed = Math.min(speed, 2.0); // Max 2 m/s walking

      this.velocity = {
        x: clampedSpeed * Math.cos(this.yaw),
        y: clampedSpeed * Math.sin(this.yaw),
        z: 0
      };
    }
  }

  /**
   * Process gyroscope data for orientation
   */
  private processGyroscope(data: { x: number; y: number; z: number }): void {
    if (!this.isTracking) return;

    const now = Date.now();
    const dt = (now - this.lastUpdateTime) / 1000;

    if (dt > 0 && dt < 1) {
      // Integrate angular velocity to get rotation
      this.roll += data.x * dt;
      this.pitch += data.y * dt;
      this.yaw += data.z * dt;

      // Normalize yaw to 0-2π
      this.yaw = this.yaw % (2 * Math.PI);
      if (this.yaw < 0) this.yaw += 2 * Math.PI;
    }
  }

  /**
   * Process magnetometer data for absolute heading
   */
  private processMagnetometer(data: { x: number; y: number; z: number }): void {
    if (!this.isTracking) return;

    // Calculate magnetic heading
    const magneticHeading = Math.atan2(data.y, data.x);

    // Fuse with gyroscope heading (70% mag, 30% gyro)
    this.yaw = 0.7 * magneticHeading + 0.3 * this.yaw;

    // Normalize
    if (this.yaw < 0) this.yaw += 2 * Math.PI;
  }

  /**
   * Get estimated absolute position
   */
  public getEstimatedPosition(): PDRPosition | null {
    if (!this.anchorGPS) {
      console.warn('No GPS anchor set');
      return null;
    }

    // Calculate new GPS coordinates from relative position
    const coords = this.calculateGPSCoordinates(
      this.anchorGPS.latitude,
      this.anchorGPS.longitude,
      this.position.x, // meters east
      this.position.y  // meters north
    );

    // Calculate speed
    const speed = Math.sqrt(
      this.velocity.x * this.velocity.x + 
      this.velocity.y * this.velocity.y
    );

    return {
      latitude: coords.latitude,
      longitude: coords.longitude,
      altitude: this.anchorGPS.altitude + this.position.z,
      accuracy: 5.0 + (this.totalDistance * 0.05), // Accuracy degrades over distance
      heading: this.yaw * RAD_TO_DEG,
      speed,
      timestamp: new Date(),
      source: 'pdr'
    };
  }

  /**
   * Get relative position from anchor (meters)
   */
  public getRelativePosition(): Vector3 {
    return { ...this.position };
  }

  /**
   * Get current heading (0-360 degrees, 0=North)
   */
  public getHeading(): number {
    return this.yaw * RAD_TO_DEG;
  }

  /**
   * Get total steps detected
   */
  public getStepCount(): number {
    return this.totalSteps;
  }

  /**
   * Get total distance traveled (meters)
   */
  public getDistanceTraveled(): number {
    return this.totalDistance;
  }

  /**
   * Check if device is moving
   */
  public isDeviceMoving(): boolean {
    const speed = Math.sqrt(
      this.velocity.x * this.velocity.x + 
      this.velocity.y * this.velocity.y
    );
    return speed > 0.2;
  }

  /**
   * Calibrate step length
   * @param measuredDistance Actual distance walked (meters)
   * @param stepCount Number of steps taken
   */
  public calibrateStepLength(measuredDistance: number, stepCount: number): void {
    if (stepCount > 0 && measuredDistance > 0) {
      this.stepLength = measuredDistance / stepCount;
      console.log(`📏 Step length calibrated: ${this.stepLength.toFixed(2)}m`);
    }
  }

  /**
   * Update GPS anchor (call when GPS becomes available again)
   */
  public updateAnchor(newAnchor: GPSAnchor): void {
    this.anchorGPS = newAnchor;
    this.position = { x: 0, y: 0, z: 0 };
    this.totalDistance = 0;
    console.log(`📍 PDR anchor updated: ${newAnchor.latitude.toFixed(6)}, ${newAnchor.longitude.toFixed(6)}`);
  }

  /**
   * Set position update callback
   */
  public setPositionCallback(callback: PositionCallback): void {
    this.onPositionUpdate = callback;
  }

  /**
   * Set step detection callback
   */
  public setStepCallback(callback: StepCallback): void {
    this.onStepDetected = callback;
  }

  /**
   * Get service status
   */
  public getStatus(): PDRStatus {
    return {
      isTracking: this.isTracking,
      hasTriplexSensors: this.hasTriplexSensors,
      stepsDetected: this.totalSteps,
      distanceTraveled: this.totalDistance,
      currentHeading: this.getHeading(),
      currentSpeed: Math.sqrt(this.velocity.x ** 2 + this.velocity.y ** 2),
      relativePosition: { ...this.position },
      anchorSet: this.anchorGPS !== null
    };
  }

  /**
   * Calculate GPS coordinates from relative position
   */
  private calculateGPSCoordinates(
    lat0: number,
    lon0: number,
    dx: number, // meters east
    dy: number  // meters north
  ): { latitude: number; longitude: number } {
    const dLat = dy / EARTH_RADIUS;
    const dLon = dx / (EARTH_RADIUS * Math.cos(lat0 * DEG_TO_RAD));

    return {
      latitude: lat0 + (dLat * RAD_TO_DEG),
      longitude: lon0 + (dLon * RAD_TO_DEG)
    };
  }

  /**
   * Dispose resources
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
