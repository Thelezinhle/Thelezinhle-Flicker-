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
