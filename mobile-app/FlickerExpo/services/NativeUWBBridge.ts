/**
 * Native UWB Bridge - Safe wrapper for native UWB modules
 * 
 * This file provides a safe interface to native UWB functionality.
 * If native modules are not installed, it returns null/false gracefully.
 * 
 * To enable real UWB:
 * 1. Run: npx expo prebuild
 * 2. Add native iOS/Android modules  
 * 3. Rebuild the app
 */

import { NativeModules, Platform } from 'react-native';

// ============== Types ==============

export interface NativeUWBDevice {
  identifier: string;
  distance: number;
  direction: number | null;  // azimuth in degrees
  elevation: number | null;
}

export interface NativeUWBSession {
  id: string;
  state: 'preparing' | 'running' | 'suspended' | 'invalidated';
}

export interface NativeUWBCallbacks {
  onDeviceDiscovered?: (device: NativeUWBDevice) => void;
  onDistanceUpdated?: (device: NativeUWBDevice) => void;
  onSessionError?: (error: string) => void;
  onSessionEnded?: () => void;
}

// ============== Native Module Interface ==============

/**
 * iOS NearbyInteraction native module interface
 * This would be implemented in Swift/Objective-C
 */
interface NINativeModule {
  isSupported: () => Promise<boolean>;
  startSession: (targetIdentifier: string) => Promise<string>;
  stopSession: () => Promise<void>;
  getDistance: () => Promise<number | null>;
  getDirection: () => Promise<{ azimuth: number; elevation: number } | null>;
}

/**
 * Android UWB native module interface
 * This would be implemented in Kotlin/Java
 */
interface AndroidUWBNativeModule {
  isSupported: () => Promise<boolean>;
  startRanging: (address: string) => Promise<string>;
  stopRanging: () => Promise<void>;
  getRangingResult: () => Promise<{ distance: number; azimuth: number } | null>;
}

// ============== Safe Native Module Access ==============

/**
 * Safely get the native UWB module if it exists
 * Returns null if not installed (won't crash)
 */
function getNativeUWBModule(): NINativeModule | AndroidUWBNativeModule | null {
  try {
    if (Platform.OS === 'ios') {
      // Try to get iOS NearbyInteraction module
      const NearbyInteraction = NativeModules.NearbyInteraction;
      if (NearbyInteraction && typeof NearbyInteraction.isSupported === 'function') {
        console.log('📡 Native UWB: iOS NearbyInteraction module found');
        return NearbyInteraction as NINativeModule;
      }
    } else if (Platform.OS === 'android') {
      // Try to get Android UWB module
      const AndroidUWB = NativeModules.AndroidUWB;
      if (AndroidUWB && typeof AndroidUWB.isSupported === 'function') {
        console.log('📡 Native UWB: Android UWB module found');
        return AndroidUWB as AndroidUWBNativeModule;
      }
    }
  } catch (error) {
    console.log('📡 Native UWB: Module not available', error);
  }
  
  return null;
}

// ============== Native UWB Bridge Class ==============

class NativeUWBBridge {
  private nativeModule: NINativeModule | AndroidUWBNativeModule | null = null;
  private isModuleAvailable: boolean = false;
  private currentSessionId: string | null = null;
  private pollingInterval: ReturnType<typeof setInterval> | null = null;
  private callbacks: NativeUWBCallbacks = {};

  constructor() {
    this.nativeModule = getNativeUWBModule();
    this.isModuleAvailable = this.nativeModule !== null;
  }

  /**
   * Check if native UWB module is available
   */
  hasNativeModule(): boolean {
    return this.isModuleAvailable;
  }

  /**
   * Check if UWB is supported on this device
   * Safe - won't crash if module not installed
   */
  async isSupported(): Promise<boolean> {
    if (!this.nativeModule) {
      return false;
    }

    try {
      return await this.nativeModule.isSupported();
    } catch (error) {
      console.warn('📡 Native UWB: isSupported check failed', error);
      return false;
    }
  }

  /**
   * Start a UWB ranging session
   * Safe - returns null if not available
   */
  async startSession(targetId: string, callbacks: NativeUWBCallbacks): Promise<string | null> {
    if (!this.nativeModule) {
      console.log('📡 Native UWB: No native module, cannot start session');
      return null;
    }

    this.callbacks = callbacks;

    try {
      if (Platform.OS === 'ios') {
        const iosModule = this.nativeModule as NINativeModule;
        this.currentSessionId = await iosModule.startSession(targetId);
      } else {
        const androidModule = this.nativeModule as AndroidUWBNativeModule;
        this.currentSessionId = await androidModule.startRanging(targetId);
      }

      // Start polling for updates
      this.startPolling();

      return this.currentSessionId;
    } catch (error: any) {
      console.error('📡 Native UWB: Failed to start session', error);
      if (this.callbacks.onSessionError) {
        this.callbacks.onSessionError(error.message || 'Failed to start UWB session');
      }
      return null;
    }
  }

  /**
   * Stop the current UWB session
   */
  async stopSession(): Promise<void> {
    this.stopPolling();

    if (!this.nativeModule || !this.currentSessionId) {
      return;
    }

    try {
      if (Platform.OS === 'ios') {
        await (this.nativeModule as NINativeModule).stopSession();
      } else {
        await (this.nativeModule as AndroidUWBNativeModule).stopRanging();
      }
    } catch (error) {
      console.warn('📡 Native UWB: Error stopping session', error);
    }

    this.currentSessionId = null;
    
    if (this.callbacks.onSessionEnded) {
      this.callbacks.onSessionEnded();
    }
  }

  /**
   * Poll for distance updates
   * (In a real implementation, this would use event emitters)
   */
  private startPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }

    this.pollingInterval = setInterval(async () => {
      await this.pollDistanceUpdate();
    }, 100); // 10 Hz update rate
  }

  private stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  private async pollDistanceUpdate(): Promise<void> {
    if (!this.nativeModule) return;

    try {
      let device: NativeUWBDevice | null = null;

      if (Platform.OS === 'ios') {
        const iosModule = this.nativeModule as NINativeModule;
        const distance = await iosModule.getDistance();
        const direction = await iosModule.getDirection();
        
        if (distance !== null) {
          device = {
            identifier: this.currentSessionId || 'unknown',
            distance,
            direction: direction?.azimuth ?? null,
            elevation: direction?.elevation ?? null,
          };
        }
      } else {
        const androidModule = this.nativeModule as AndroidUWBNativeModule;
        const result = await androidModule.getRangingResult();
        
        if (result !== null) {
          device = {
            identifier: this.currentSessionId || 'unknown',
            distance: result.distance,
            direction: result.azimuth,
            elevation: null,
          };
        }
      }

      if (device && this.callbacks.onDistanceUpdated) {
        this.callbacks.onDistanceUpdated(device);
      }
    } catch (error) {
      // Silently fail - device may have gone out of range
    }
  }
}

// ============== Singleton Export ==============

const nativeUWBBridge = new NativeUWBBridge();
export default nativeUWBBridge;

// Export individual functions for convenience
export const hasNativeUWB = () => nativeUWBBridge.hasNativeModule();
export const isNativeUWBSupported = () => nativeUWBBridge.isSupported();
