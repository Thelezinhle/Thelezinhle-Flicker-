/**
 * Shared data store for in-memory data
 * This avoids circular imports between routes
 */

// Active deliveries - shared between delivery and ranging routes
export const activeDeliveries = new Map<string, any>();

// Location history for deliveries
export const locationHistory = new Map<string, any[]>();

// Customer beacons for ranging
export const customerBeacons = new Map<string, any>();

// Active ranging sessions
export const activeRangingSessions = new Map<string, any>();

// GPS History for smoothing - stores last N readings per entity
export interface GPSReading {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

export const gpsHistory = new Map<string, GPSReading[]>();

// Maximum readings to keep for smoothing
export const MAX_GPS_HISTORY = 5;

/**
 * Add GPS reading to history and get smoothed position
 * Uses weighted average (newer readings have more weight)
 */
export function addGPSReading(
  entityId: string, 
  lat: number, 
  lon: number, 
  accuracy: number
): { latitude: number; longitude: number; isStationary: boolean; smoothedAccuracy: number } {
  const now = Date.now();
  const history = gpsHistory.get(entityId) || [];
  
  // Add new reading
  history.push({ latitude: lat, longitude: lon, accuracy, timestamp: now });
  
  // Keep only last N readings
  while (history.length > MAX_GPS_HISTORY) {
    history.shift();
  }
  
  gpsHistory.set(entityId, history);
  
  // If only 1 reading, return it directly
  if (history.length === 1) {
    return { latitude: lat, longitude: lon, isStationary: false, smoothedAccuracy: accuracy };
  }
  
  // Calculate weighted average (exponential weights - newer = higher)
  let totalWeight = 0;
  let weightedLat = 0;
  let weightedLon = 0;
  let weightedAccuracy = 0;
  
  for (let i = 0; i < history.length; i++) {
    // Exponential weight: most recent has highest weight
    const weight = Math.pow(2, i);
    const reading = history[i];
    
    // Also weight by accuracy (lower accuracy = less trust)
    const accuracyWeight = 1 / Math.max(reading.accuracy, 1);
    const combinedWeight = weight * accuracyWeight;
    
    weightedLat += reading.latitude * combinedWeight;
    weightedLon += reading.longitude * combinedWeight;
    weightedAccuracy += reading.accuracy * combinedWeight;
    totalWeight += combinedWeight;
  }
  
  const smoothedLat = weightedLat / totalWeight;
  const smoothedLon = weightedLon / totalWeight;
  const smoothedAccuracy = weightedAccuracy / totalWeight;
  
  // Detect if stationary: check variance in recent readings
  // If all readings are within ~5m of each other, consider stationary
  const STATIONARY_THRESHOLD_METERS = 5;
  let maxDistance = 0;
  
  for (let i = 1; i < history.length; i++) {
    const dist = haversineDistance(
      history[0].latitude, history[0].longitude,
      history[i].latitude, history[i].longitude
    );
    maxDistance = Math.max(maxDistance, dist);
  }
  
  const isStationary = maxDistance < STATIONARY_THRESHOLD_METERS;
  
  return { latitude: smoothedLat, longitude: smoothedLon, isStationary, smoothedAccuracy };
}

/**
 * Simple Haversine distance calculation
 */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Clear GPS history for an entity (when session ends)
 */
export function clearGPSHistory(entityId: string): void {
  gpsHistory.delete(entityId);
}
