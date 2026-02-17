/**
 * Delivery Service for Web
 * Handles delivery operations via API calls to backend
 * Converted from Go backend service
 */

import { API_BASE } from '../config';
const API_URL = API_BASE;

// ============== Types ==============

export interface CreateOrderRequest {
  recipient_id: string;
  venue_id: string;
  content: string;
}

export interface QRVerifyRequest {
  delivery_id: string;
  qr_code: string;  // Web alternative to NFC
}

export interface DeliveryResponse {
  id: string;
  order_id: string;
  driver_id: string;
  recipient_id: string;
  venue_id: string;
  content: string;
  status: DeliveryStatus;
  wrong_person: boolean;
  created_at?: string;
  updated_at?: string;
  // Location tracking fields
  latitude?: number;
  longitude?: number;
  distance_to_customer?: number;
  eta?: number;
}

export interface VenueResponse {
  id: string;
  name: string;
  category: string;
  latitude: number;
  longitude: number;
  radius: number;
  address: string;
  phone: string;
}

export interface CreateVenueRequest {
  name: string;
  category: string;
  latitude: number;
  longitude: number;
  radius: number;
  address: string;
  phone: string;
}

export type DeliveryStatus = 
  | 'pending' 
  | 'assigned' 
  | 'picked_up' 
  | 'in_transit' 
  | 'nearby' 
  | 'arrived' 
  | 'delivered' 
  | 'cancelled';

export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface LocationUpdate {
  delivery_id: string;
  latitude: number;
  longitude: number;
  speed?: number;
  heading?: number;
}

// ============== Delivery Service Class ==============

class DeliveryService {
  private static instance: DeliveryService;
  private authToken: string | null = null;

  private constructor() {
    // Load auth token from localStorage
    const user = localStorage.getItem('flickerSecureUser');
    if (user) {
      try {
        const parsed = JSON.parse(user);
        this.authToken = parsed.sessionToken;
      } catch (e) {
        console.error('Failed to parse user token');
      }
    }
    console.log('📦 DeliveryService initialized');
  }

  public static getInstance(): DeliveryService {
    if (!DeliveryService.instance) {
      DeliveryService.instance = new DeliveryService();
    }
    return DeliveryService.instance;
  }

  /**
   * Set authentication token
   */
  public setAuthToken(token: string): void {
    this.authToken = token;
  }

  /**
   * Get headers with auth token
   */
  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }
    return headers;
  }

  // ============== Order/Delivery Methods ==============

  /**
   * Create a new delivery order
   */
  async createOrder(request: CreateOrderRequest): Promise<APIResponse<DeliveryResponse>> {
    try {
      const response = await fetch(`${API_URL}/delivery/create`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(request),
      });

      const data = await response.json();
      
      if (!response.ok) {
        return { success: false, error: data.error || 'Failed to create order' };
      }

      console.log('✅ Order created:', data);
      return { success: true, data: data.data || data };
    } catch (error) {
      console.error('❌ Create order error:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  /**
   * Get a delivery by ID
   */
  async getOrder(deliveryId: string): Promise<APIResponse<DeliveryResponse>> {
    try {
      const response = await fetch(`${API_URL}/delivery/${deliveryId}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || 'Delivery not found' };
      }

      return { success: true, data: data.data || data };
    } catch (error) {
      console.error('❌ Get order error:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  /**
   * Get all deliveries for the current user (as recipient)
   */
  async getUserDeliveries(): Promise<APIResponse<DeliveryResponse[]>> {
    try {
      const response = await fetch(`${API_URL}/delivery/my-deliveries`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || 'Failed to fetch deliveries' };
      }

      return { success: true, data: data.data?.deliveries || data.deliveries || [] };
    } catch (error) {
      console.error('❌ Get user deliveries error:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  /**
   * Get all active deliveries (for tracking)
   */
  async getActiveDeliveries(): Promise<APIResponse<DeliveryResponse[]>> {
    try {
      const response = await fetch(`${API_URL}/delivery/active`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || 'Failed to fetch active deliveries' };
      }

      return { success: true, data: data.data?.deliveries || data.deliveries || [] };
    } catch (error) {
      console.error('❌ Get active deliveries error:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  /**
   * Get delivery history
   */
  async getDeliveryHistory(): Promise<APIResponse<DeliveryResponse[]>> {
    try {
      const response = await fetch(`${API_URL}/delivery/history`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || 'Failed to fetch history' };
      }

      return { success: true, data: data.data?.deliveries || data.deliveries || [] };
    } catch (error) {
      console.error('❌ Get delivery history error:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  /**
   * Update delivery status
   */
  async updateDeliveryStatus(
    deliveryId: string, 
    status: DeliveryStatus
  ): Promise<APIResponse<DeliveryResponse>> {
    try {
      const response = await fetch(`${API_URL}/delivery/${deliveryId}/status`, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify({ status }),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || 'Failed to update status' };
      }

      console.log('✅ Status updated:', status);
      return { success: true, data: data.data || data };
    } catch (error) {
      console.error('❌ Update status error:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  /**
   * Update delivery location (for drivers)
   */
  async updateLocation(locationUpdate: LocationUpdate): Promise<APIResponse<void>> {
    try {
      const response = await fetch(`${API_URL}/delivery/${locationUpdate.delivery_id}/location`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          latitude: locationUpdate.latitude,
          longitude: locationUpdate.longitude,
          speed: locationUpdate.speed,
          heading: locationUpdate.heading,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || 'Failed to update location' };
      }

      return { success: true };
    } catch (error) {
      console.error('❌ Update location error:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  // ============== Verification Methods ==============

  /**
   * Verify delivery using QR code (web alternative to NFC)
   */
  async verifyWithQRCode(request: QRVerifyRequest): Promise<APIResponse<DeliveryResponse>> {
    try {
      const response = await fetch(`${API_URL}/delivery/verify-qr`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(request),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || 'Verification failed' };
      }

      console.log('✅ Delivery verified via QR');
      return { success: true, data: data.data || data };
    } catch (error) {
      console.error('❌ QR verify error:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  /**
   * Generate QR code for delivery verification
   */
  async generateVerificationQR(deliveryId: string): Promise<APIResponse<{ qr_code: string; expires_at: string }>> {
    try {
      const response = await fetch(`${API_URL}/delivery/${deliveryId}/generate-qr`, {
        method: 'POST',
        headers: this.getHeaders(),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || 'Failed to generate QR' };
      }

      return { success: true, data: data.data || data };
    } catch (error) {
      console.error('❌ Generate QR error:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  /**
   * Confirm delivery handoff (mark as delivered)
   */
  async confirmDelivery(deliveryId: string): Promise<APIResponse<DeliveryResponse>> {
    try {
      const response = await fetch(`${API_URL}/delivery/${deliveryId}/confirm`, {
        method: 'POST',
        headers: this.getHeaders(),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || 'Failed to confirm delivery' };
      }

      console.log('✅ Delivery confirmed');
      return { success: true, data: data.data || data };
    } catch (error) {
      console.error('❌ Confirm delivery error:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  /**
   * Report wrong person received delivery
   */
  async reportWrongPerson(deliveryId: string, reason: string): Promise<APIResponse<void>> {
    try {
      const response = await fetch(`${API_URL}/delivery/${deliveryId}/wrong-person`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ reason }),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || 'Failed to report' };
      }

      return { success: true };
    } catch (error) {
      console.error('❌ Report wrong person error:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  // ============== Venue Methods ==============

  /**
   * Create a new venue
   */
  async createVenue(venue: CreateVenueRequest): Promise<APIResponse<VenueResponse>> {
    try {
      const response = await fetch(`${API_URL}/venues`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(venue),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || 'Failed to create venue' };
      }

      console.log('✅ Venue created:', data);
      return { success: true, data: data.data || data };
    } catch (error) {
      console.error('❌ Create venue error:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  /**
   * Get a venue by ID
   */
  async getVenue(venueId: string): Promise<APIResponse<VenueResponse>> {
    try {
      const response = await fetch(`${API_URL}/venues/${venueId}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || 'Venue not found' };
      }

      return { success: true, data: data.data || data };
    } catch (error) {
      console.error('❌ Get venue error:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  /**
   * Get all venues
   */
  async getVenues(): Promise<APIResponse<VenueResponse[]>> {
    try {
      const response = await fetch(`${API_URL}/venues`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || 'Failed to fetch venues' };
      }

      return { success: true, data: data.data?.venues || data.venues || [] };
    } catch (error) {
      console.error('❌ Get venues error:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  /**
   * Search venues by name or category
   */
  async searchVenues(query: string): Promise<APIResponse<VenueResponse[]>> {
    try {
      const response = await fetch(`${API_URL}/venues/search?q=${encodeURIComponent(query)}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || 'Search failed' };
      }

      return { success: true, data: data.data?.venues || data.venues || [] };
    } catch (error) {
      console.error('❌ Search venues error:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  /**
   * Get nearby venues based on coordinates
   */
  async getNearbyVenues(
    latitude: number, 
    longitude: number, 
    radiusKm: number = 5
  ): Promise<APIResponse<VenueResponse[]>> {
    try {
      const response = await fetch(
        `${API_URL}/venues/nearby?lat=${latitude}&lng=${longitude}&radius=${radiusKm}`,
        {
          method: 'GET',
          headers: this.getHeaders(),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || 'Failed to fetch nearby venues' };
      }

      return { success: true, data: data.data?.venues || data.venues || [] };
    } catch (error) {
      console.error('❌ Get nearby venues error:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  }
}

// Export singleton instance
export const deliveryService = DeliveryService.getInstance();
export default DeliveryService;
