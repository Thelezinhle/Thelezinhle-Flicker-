/**
 * useGPS Hook - React hook for GPS location tracking
 * Easy-to-use interface for the GPSService
 */

import { useState, useEffect, useCallback } from 'react';
import { gpsService, Position, GPSError } from '../services/GPSService';

interface UseGPSOptions {
  autoStart?: boolean;  // Start tracking automatically on mount
  onPositionUpdate?: (position: Position) => void;
  onError?: (error: GPSError) => void;
}

interface UseGPSReturn {
  position: Position | null;
  isTracking: boolean;
  isSupported: boolean;
  error: GPSError | null;
  permissionStatus: 'granted' | 'denied' | 'prompt' | 'unknown';
  startTracking: () => Promise<boolean>;
  stopTracking: () => void;
  getCurrentPosition: () => Promise<Position | null>;
  calculateDistanceTo: (lat: number, lng: number) => number | null;
  formatDistance: (meters: number) => string;
  formatETA: (seconds: number) => string;
}

export function useGPS(options: UseGPSOptions = {}): UseGPSReturn {
  const { autoStart = false, onPositionUpdate, onError } = options;

  const [position, setPosition] = useState<Position | null>(gpsService.getCachedPosition());
  const [isTracking, setIsTracking] = useState(gpsService.isCurrentlyTracking());
  const [error, setError] = useState<GPSError | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<'granted' | 'denied' | 'prompt' | 'unknown'>('unknown');

  const isSupported = gpsService.isSupported();

  // Check permission on mount
  useEffect(() => {
    const checkPermission = async () => {
      const status = await gpsService.checkPermission();
      setPermissionStatus(status);
    };
    checkPermission();
  }, []);

  // Subscribe to position updates
  useEffect(() => {
    const unsubscribePosition = gpsService.onPositionUpdate((pos) => {
      setPosition(pos);
      setError(null);
      onPositionUpdate?.(pos);
    });

    const unsubscribeError = gpsService.onError((err) => {
      setError(err);
      onError?.(err);
    });

    return () => {
      unsubscribePosition();
      unsubscribeError();
    };
  }, [onPositionUpdate, onError]);

  // Auto-start tracking if enabled
  useEffect(() => {
    if (autoStart && isSupported) {
      gpsService.startTracking().then((started) => {
        setIsTracking(started);
      });
    }

    // Cleanup on unmount - don't stop tracking, other components might use it
    return () => {};
  }, [autoStart, isSupported]);

  const startTracking = useCallback(async (): Promise<boolean> => {
    const started = await gpsService.startTracking();
    setIsTracking(started);
    if (started) {
      const status = await gpsService.checkPermission();
      setPermissionStatus(status);
    }
    return started;
  }, []);

  const stopTracking = useCallback(() => {
    gpsService.stopTracking();
    setIsTracking(false);
  }, []);

  const getCurrentPosition = useCallback(async (): Promise<Position | null> => {
    const pos = await gpsService.getCurrentPosition();
    if (pos) {
      setPosition(pos);
      setError(null);
    }
    return pos;
  }, []);

  const calculateDistanceTo = useCallback((lat: number, lng: number): number | null => {
    if (!position) return null;
    return gpsService.calculateDistance(position.latitude, position.longitude, lat, lng);
  }, [position]);

  const formatDistance = useCallback((meters: number): string => {
    return gpsService.formatDistance(meters);
  }, []);

  const formatETA = useCallback((seconds: number): string => {
    return gpsService.formatETA(seconds);
  }, []);

  return {
    position,
    isTracking,
    isSupported,
    error,
    permissionStatus,
    startTracking,
    stopTracking,
    getCurrentPosition,
    calculateDistanceTo,
    formatDistance,
    formatETA,
  };
}

export default useGPS;
