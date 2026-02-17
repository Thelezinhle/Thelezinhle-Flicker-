/**
 * DeliveryService - Backend service for delivery operations
 * Mirrors the Go DeliveryService functionality
 * Handles orders, venues, and QR/NFC verification
 */

import { Delivery, Venue } from '../models';
import crypto from 'crypto';

// ============== Request Types ==============

export interface CreateOrderRequest {
  recipient_id: string;
  venue_id?: string;
  content: string;
  pickup_location?: { latitude: number; longitude: number };
  dropoff_location?: { latitude: number; longitude: number };
}

export interface NFCVerifyRequest {
  delivery_id: string;
  nfc_tag: string;
}

export interface QRVerifyRequest {
  delivery_id: string;
  qr_data: string;
}

export interface CreateVenueRequest {
  name: string;
  category: string;
  latitude: number;
  longitude: number;
  radius: number;
  address?: string;
  phone?: string;
}

export interface LocationUpdateRequest {
  latitude: number;
  longitude: number;
  speed?: number;
  heading?: number;
}

// ============== Response Types ==============

export interface DeliveryResponse {
  id: string;
  order_id: string;
  driver_id: string;
  recipient_id: string;
  venue_id: string | null;
  content: string;
  status: string;
  wrong_person: boolean;
  latitude?: number;
  longitude?: number;
  end_latitude?: number;
  end_longitude?: number;
  distance_meters?: number;
  created_at?: Date;
  updated_at?: Date;
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

export interface QRCodeResponse {
  qr_code: string;
  expires_at: string;
}

// ============== Service Class ==============

class DeliveryService {
  private static instance: DeliveryService;

  private constructor() {
    console.log('📦 DeliveryService initialized');
  }

  public static getInstance(): DeliveryService {
    if (!DeliveryService.instance) {
      DeliveryService.instance = new DeliveryService();
    }
    return DeliveryService.instance;
  }

  // ============== Order Methods ==============

  /**
   * Create a new delivery order
   */
  async createOrder(driverId: string, req: CreateOrderRequest): Promise<DeliveryResponse> {
    const delivery = await Delivery.create({
      driverId: driverId,
      recipientId: req.recipient_id,
      venueId: req.venue_id || null,
      content: req.content,
      latitude: req.pickup_location?.latitude || null,
      longitude: req.pickup_location?.longitude || null,
      status: 'pending',
    });

    return this.toDeliveryResponse(delivery);
  }

  /**
   * Get a delivery by ID
   */
  async getOrder(deliveryId: string): Promise<DeliveryResponse | null> {
    const delivery = await Delivery.findByPk(deliveryId);
    
    if (!delivery) {
      return null;
    }

    return this.toDeliveryResponse(delivery);
  }

  /**
   * Get all deliveries for a user (as recipient)
   */
  async getUserDeliveries(userId: string): Promise<DeliveryResponse[]> {
    const deliveries = await Delivery.findAll({
      where: { recipientId: userId },
      order: [['createdAt', 'DESC']]
    });

    return deliveries.map(d => this.toDeliveryResponse(d));
  }

  /**
   * Get all deliveries for a driver
   */
  async getDriverDeliveries(driverId: string): Promise<DeliveryResponse[]> {
    const deliveries = await Delivery.findAll({
      where: { driverId: driverId },
      order: [['createdAt', 'DESC']]
    });

    return deliveries.map(d => this.toDeliveryResponse(d));
  }

  /**
   * Get active deliveries (not delivered or cancelled)
   */
  async getActiveDeliveries(): Promise<DeliveryResponse[]> {
    const { Op } = require('sequelize');
    
    const deliveries = await Delivery.findAll({
      where: {
        status: {
          [Op.notIn]: ['delivered', 'cancelled']
        }
      },
      order: [['createdAt', 'DESC']]
    });

    return deliveries.map(d => this.toDeliveryResponse(d));
  }

  /**
   * Get delivery history (delivered or cancelled)
   */
  async getDeliveryHistory(userId?: string): Promise<DeliveryResponse[]> {
    const { Op } = require('sequelize');
    
    const whereClause: any = {
      status: {
        [Op.in]: ['delivered', 'cancelled']
      }
    };

    if (userId) {
      whereClause[Op.or] = [
        { recipientId: userId },
        { driverId: userId }
      ];
    }

    const deliveries = await Delivery.findAll({
      where: whereClause,
      order: [['updatedAt', 'DESC']],
      limit: 50
    });

    return deliveries.map(d => this.toDeliveryResponse(d));
  }

  /**
   * Update delivery status
   */
  async updateStatus(deliveryId: string, status: string): Promise<DeliveryResponse | null> {
    const delivery = await Delivery.findByPk(deliveryId);
    
    if (!delivery) {
      return null;
    }

    await delivery.update({ status });
    return this.toDeliveryResponse(delivery);
  }

  /**
   * Update delivery location
   */
  async updateLocation(deliveryId: string, req: LocationUpdateRequest): Promise<DeliveryResponse | null> {
    const delivery = await Delivery.findByPk(deliveryId);
    
    if (!delivery) {
      return null;
    }

    await delivery.update({
      latitude: req.latitude,
      longitude: req.longitude
    });

    return this.toDeliveryResponse(delivery);
  }

  // ============== Verification Methods ==============

  /**
   * NFC verification - marks delivery as completed
   */
  async nfcVerify(req: NFCVerifyRequest): Promise<DeliveryResponse | null> {
    const delivery = await Delivery.findByPk(req.delivery_id);
    
    if (!delivery) {
      throw new Error('Delivery not found');
    }

    // TODO: In production, verify NFC tag authenticity
    // For now, mark as delivered
    await delivery.update({ status: 'delivered' });

    return this.toDeliveryResponse(delivery);
  }

  /**
   * QR code verification - marks delivery as completed (web alternative to NFC)
   */
  async qrVerify(req: QRVerifyRequest): Promise<DeliveryResponse | null> {
    const delivery = await Delivery.findByPk(req.delivery_id);
    
    if (!delivery) {
      throw new Error('Delivery not found');
    }

    // Verify QR code matches and hasn't expired
    if (delivery.qrCode !== req.qr_data) {
      throw new Error('Invalid QR code');
    }

    if (delivery.qrExpiresAt && new Date() > delivery.qrExpiresAt) {
      throw new Error('QR code has expired');
    }

    // Mark as delivered
    await delivery.update({ 
      status: 'delivered',
      qrCode: null,
      qrExpiresAt: null
    });

    return this.toDeliveryResponse(delivery);
  }

  /**
   * Generate QR code for delivery verification
   */
  async generateQRCode(deliveryId: string): Promise<QRCodeResponse | null> {
    const delivery = await Delivery.findByPk(deliveryId);
    
    if (!delivery) {
      throw new Error('Delivery not found');
    }

    // Generate unique QR code
    const qrCode = `FLKR-${deliveryId.substring(0, 8)}-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
    
    // Set expiration to 15 minutes from now
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await delivery.update({
      qrCode: qrCode,
      qrExpiresAt: expiresAt
    });

    return {
      qr_code: qrCode,
      expires_at: expiresAt.toISOString()
    };
  }

  /**
   * Confirm delivery handoff
   */
  async confirmDelivery(deliveryId: string): Promise<DeliveryResponse | null> {
    const delivery = await Delivery.findByPk(deliveryId);
    
    if (!delivery) {
      throw new Error('Delivery not found');
    }

    await delivery.update({ status: 'delivered' });
    return this.toDeliveryResponse(delivery);
  }

  /**
   * Report wrong person received delivery
   */
  async reportWrongPerson(deliveryId: string, reason: string): Promise<DeliveryResponse | null> {
    const delivery = await Delivery.findByPk(deliveryId);
    
    if (!delivery) {
      throw new Error('Delivery not found');
    }

    await delivery.update({ 
      wrongPerson: true,
      status: 'cancelled'
    });

    // TODO: Log the reason and notify relevant parties
    console.log(`Wrong person reported for delivery ${deliveryId}: ${reason}`);

    return this.toDeliveryResponse(delivery);
  }

  // ============== Venue Methods ==============

  /**
   * Create a new venue
   */
  async createVenue(req: CreateVenueRequest): Promise<VenueResponse> {
    const venue = await Venue.create({
      name: req.name,
      category: req.category,
      latitude: req.latitude,
      longitude: req.longitude,
      radius: req.radius,
      address: req.address || '',
      phone: req.phone || ''
    });

    return this.toVenueResponse(venue);
  }

  /**
   * Get venue by ID
   */
  async getVenue(venueId: string): Promise<VenueResponse | null> {
    const venue = await Venue.findByPk(venueId);
    
    if (!venue) {
      return null;
    }

    return this.toVenueResponse(venue);
  }

  /**
   * Get all venues
   */
  async getVenues(): Promise<VenueResponse[]> {
    const venues = await Venue.findAll({
      order: [['name', 'ASC']]
    });

    return venues.map(v => this.toVenueResponse(v));
  }

  /**
   * Search venues by name or category
   */
  async searchVenues(query: string): Promise<VenueResponse[]> {
    const { Op } = require('sequelize');
    
    const venues = await Venue.findAll({
      where: {
        [Op.or]: [
          { name: { [Op.iLike]: `%${query}%` } },
          { category: { [Op.iLike]: `%${query}%` } }
        ]
      },
      order: [['name', 'ASC']]
    });

    return venues.map(v => this.toVenueResponse(v));
  }

  /**
   * Get nearby venues
   */
  async getNearbyVenues(latitude: number, longitude: number, radiusKm: number = 5): Promise<VenueResponse[]> {
    // Simple distance calculation using Haversine approximation
    // For production, use PostGIS or a proper geospatial query
    const venues = await Venue.findAll();
    
    const nearbyVenues = venues.filter(v => {
      const distance = this.calculateDistance(
        latitude, 
        longitude, 
        Number(v.latitude), 
        Number(v.longitude)
      );
      return distance <= radiusKm * 1000; // Convert km to meters
    });

    return nearbyVenues.map(v => this.toVenueResponse(v));
  }

  // ============== Helper Methods ==============

  private toDeliveryResponse(delivery: Delivery): DeliveryResponse {
    return {
      id: delivery.id,
      order_id: delivery.orderId,
      driver_id: delivery.driverId,
      recipient_id: delivery.recipientId,
      venue_id: delivery.venueId || null,
      content: delivery.content || '',
      status: delivery.status,
      wrong_person: delivery.wrongPerson || false,
      latitude: delivery.latitude ? Number(delivery.latitude) : undefined,
      longitude: delivery.longitude ? Number(delivery.longitude) : undefined,
      created_at: (delivery as any).createdAt,
      updated_at: (delivery as any).updatedAt
    };
  }

  private toVenueResponse(venue: Venue): VenueResponse {
    return {
      id: venue.id,
      name: venue.name,
      category: venue.category,
      latitude: Number(venue.latitude),
      longitude: Number(venue.longitude),
      radius: Number(venue.radius),
      address: venue.address || '',
      phone: venue.phone || ''
    };
  }

  /**
   * Calculate distance between two coordinates (Haversine formula)
   */
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
  }
}

// Export singleton instance
export const deliveryService = DeliveryService.getInstance();
export default DeliveryService;
