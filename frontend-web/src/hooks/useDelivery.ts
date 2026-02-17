/**
 * useDelivery Hook - React hook for delivery operations
 * Easy-to-use interface for the DeliveryService
 */

import { useState, useCallback } from 'react';
import { 
  deliveryService, 
  DeliveryResponse, 
  VenueResponse,
  CreateOrderRequest,
  DeliveryStatus,
  LocationUpdate
} from '../services/DeliveryService';

interface UseDeliveryReturn {
  // State
  deliveries: DeliveryResponse[];
  activeDeliveries: DeliveryResponse[];
  currentDelivery: DeliveryResponse | null;
  venues: VenueResponse[];
  loading: boolean;
  error: string | null;

  // Delivery operations
  createOrder: (request: CreateOrderRequest) => Promise<DeliveryResponse | null>;
  getOrder: (deliveryId: string) => Promise<DeliveryResponse | null>;
  getUserDeliveries: () => Promise<DeliveryResponse[]>;
  getActiveDeliveries: () => Promise<DeliveryResponse[]>;
  getDeliveryHistory: () => Promise<DeliveryResponse[]>;
  updateStatus: (deliveryId: string, status: DeliveryStatus) => Promise<boolean>;
  updateLocation: (update: LocationUpdate) => Promise<boolean>;
  confirmDelivery: (deliveryId: string) => Promise<boolean>;

  // Verification
  verifyWithQR: (deliveryId: string, qrCode: string) => Promise<boolean>;
  generateQR: (deliveryId: string) => Promise<{ qr_code: string; expires_at: string } | null>;

  // Venue operations
  getVenues: () => Promise<VenueResponse[]>;
  getVenue: (venueId: string) => Promise<VenueResponse | null>;
  searchVenues: (query: string) => Promise<VenueResponse[]>;
  getNearbyVenues: (lat: number, lng: number, radiusKm?: number) => Promise<VenueResponse[]>;

  // Utilities
  clearError: () => void;
  setCurrentDelivery: (delivery: DeliveryResponse | null) => void;
}

export function useDelivery(): UseDeliveryReturn {
  const [deliveries, setDeliveries] = useState<DeliveryResponse[]>([]);
  const [activeDeliveries, setActiveDeliveries] = useState<DeliveryResponse[]>([]);
  const [currentDelivery, setCurrentDelivery] = useState<DeliveryResponse | null>(null);
  const [venues, setVenues] = useState<VenueResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  // ============== Delivery Operations ==============

  const createOrder = useCallback(async (request: CreateOrderRequest): Promise<DeliveryResponse | null> => {
    setLoading(true);
    setError(null);
    try {
      const result = await deliveryService.createOrder(request);
      if (result.success && result.data) {
        setDeliveries(prev => [result.data!, ...prev]);
        return result.data;
      } else {
        setError(result.error || 'Failed to create order');
        return null;
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const getOrder = useCallback(async (deliveryId: string): Promise<DeliveryResponse | null> => {
    setLoading(true);
    setError(null);
    try {
      const result = await deliveryService.getOrder(deliveryId);
      if (result.success && result.data) {
        setCurrentDelivery(result.data);
        return result.data;
      } else {
        setError(result.error || 'Delivery not found');
        return null;
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const getUserDeliveries = useCallback(async (): Promise<DeliveryResponse[]> => {
    setLoading(true);
    setError(null);
    try {
      const result = await deliveryService.getUserDeliveries();
      if (result.success && result.data) {
        setDeliveries(result.data);
        return result.data;
      } else {
        setError(result.error || 'Failed to fetch deliveries');
        return [];
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const getActiveDeliveries = useCallback(async (): Promise<DeliveryResponse[]> => {
    setLoading(true);
    setError(null);
    try {
      const result = await deliveryService.getActiveDeliveries();
      if (result.success && result.data) {
        setActiveDeliveries(result.data);
        return result.data;
      } else {
        setError(result.error || 'Failed to fetch active deliveries');
        return [];
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const getDeliveryHistory = useCallback(async (): Promise<DeliveryResponse[]> => {
    setLoading(true);
    setError(null);
    try {
      const result = await deliveryService.getDeliveryHistory();
      if (result.success) {
        return result.data || [];
      } else {
        setError(result.error || 'Failed to fetch history');
        return [];
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const updateStatus = useCallback(async (deliveryId: string, status: DeliveryStatus): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const result = await deliveryService.updateDeliveryStatus(deliveryId, status);
      if (result.success && result.data) {
        // Update local state
        setDeliveries(prev => 
          prev.map(d => d.id === deliveryId ? { ...d, status } : d)
        );
        setActiveDeliveries(prev => 
          prev.map(d => d.id === deliveryId ? { ...d, status } : d)
        );
        if (currentDelivery?.id === deliveryId) {
          setCurrentDelivery({ ...currentDelivery, status });
        }
        return true;
      } else {
        setError(result.error || 'Failed to update status');
        return false;
      }
    } finally {
      setLoading(false);
    }
  }, [currentDelivery]);

  const updateLocation = useCallback(async (update: LocationUpdate): Promise<boolean> => {
    try {
      const result = await deliveryService.updateLocation(update);
      return result.success;
    } catch {
      return false;
    }
  }, []);

  const confirmDelivery = useCallback(async (deliveryId: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const result = await deliveryService.confirmDelivery(deliveryId);
      if (result.success) {
        // Update local state
        setDeliveries(prev => 
          prev.map(d => d.id === deliveryId ? { ...d, status: 'delivered' as DeliveryStatus } : d)
        );
        setActiveDeliveries(prev => 
          prev.filter(d => d.id !== deliveryId)
        );
        return true;
      } else {
        setError(result.error || 'Failed to confirm delivery');
        return false;
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // ============== Verification Operations ==============

  const verifyWithQR = useCallback(async (deliveryId: string, qrCode: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const result = await deliveryService.verifyWithQRCode({
        delivery_id: deliveryId,
        qr_code: qrCode
      });
      if (result.success) {
        return true;
      } else {
        setError(result.error || 'QR verification failed');
        return false;
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const generateQR = useCallback(async (deliveryId: string): Promise<{ qr_code: string; expires_at: string } | null> => {
    setLoading(true);
    setError(null);
    try {
      const result = await deliveryService.generateVerificationQR(deliveryId);
      if (result.success && result.data) {
        return result.data;
      } else {
        setError(result.error || 'Failed to generate QR code');
        return null;
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // ============== Venue Operations ==============

  const getVenues = useCallback(async (): Promise<VenueResponse[]> => {
    setLoading(true);
    setError(null);
    try {
      const result = await deliveryService.getVenues();
      if (result.success && result.data) {
        setVenues(result.data);
        return result.data;
      } else {
        setError(result.error || 'Failed to fetch venues');
        return [];
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const getVenue = useCallback(async (venueId: string): Promise<VenueResponse | null> => {
    setLoading(true);
    setError(null);
    try {
      const result = await deliveryService.getVenue(venueId);
      if (result.success && result.data) {
        return result.data;
      } else {
        setError(result.error || 'Venue not found');
        return null;
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const searchVenues = useCallback(async (query: string): Promise<VenueResponse[]> => {
    setLoading(true);
    setError(null);
    try {
      const result = await deliveryService.searchVenues(query);
      if (result.success && result.data) {
        return result.data;
      } else {
        setError(result.error || 'Search failed');
        return [];
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const getNearbyVenues = useCallback(async (lat: number, lng: number, radiusKm: number = 5): Promise<VenueResponse[]> => {
    setLoading(true);
    setError(null);
    try {
      const result = await deliveryService.getNearbyVenues(lat, lng, radiusKm);
      if (result.success && result.data) {
        return result.data;
      } else {
        setError(result.error || 'Failed to fetch nearby venues');
        return [];
      }
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    // State
    deliveries,
    activeDeliveries,
    currentDelivery,
    venues,
    loading,
    error,

    // Delivery operations
    createOrder,
    getOrder,
    getUserDeliveries,
    getActiveDeliveries,
    getDeliveryHistory,
    updateStatus,
    updateLocation,
    confirmDelivery,

    // Verification
    verifyWithQR,
    generateQR,

    // Venue operations
    getVenues,
    getVenue,
    searchVenues,
    getNearbyVenues,

    // Utilities
    clearError,
    setCurrentDelivery,
  };
}

export default useDelivery;
