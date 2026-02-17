/**
 * DeliveryTracking routes - Real-time location tracking for deliveries
 * Handles order delivery tracking, location updates, and ETA calculations
 * Uses PostgreSQL database for persistence
 */

import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import {
  DeliveryService,
  LocationService,
  NFTService
} from '../services/DatabaseService';
import solanaService from '../services/SolanaService';

const router = Router();

// Haversine distance calculation (km)
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
}

// Calculate ETA in minutes based on speed
function calculateETA(distanceKm: number, speedKmh: number = 40): number {
  if (speedKmh <= 0) return 0;
  return Math.round((distanceKm / speedKmh) * 60);
}

/**
 * Create a new delivery order
 * POST /api/delivery/orders
 */
router.post(
  '/orders',
  [
    body('orderId').notEmpty().isString(),
    body('deliveryPersonId').isUUID().notEmpty(),
    body('customerId').isUUID().notEmpty(),
    body('startLocation.latitude').isFloat({ min: -90, max: 90 }),
    body('startLocation.longitude').isFloat({ min: -180, max: 180 }),
    body('endLocation.latitude').isFloat({ min: -90, max: 90 }),
    body('endLocation.longitude').isFloat({ min: -180, max: 180 })
  ],
  async (req: Request, res: Response): Promise<any> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const {
        orderId,
        deliveryPersonId,
        customerId,
        startLocation,
        endLocation,
        estimatedDistance
      } = req.body;

      // Check if order already exists
      const existingDelivery =
        await DeliveryService.findDeliveryByOrderId(orderId);
      if (existingDelivery) {
        return res.status(409).json({
          success: false,
          message: 'Delivery order already exists'
        });
      }

      // Create delivery
      const delivery = await DeliveryService.createDelivery({
        orderId,
        deliveryPersonId,
        customerId,
        startLocation,
        endLocation,
        estimatedETA: new Date(Date.now() + estimatedDistance * 60 * 1000)
      });

      // Create NFT record for blockchain later
      await NFTService.createNFTRecord({
        deliveryId: delivery.id,
        metadata: {
          orderId,
          createdAt: new Date().toISOString(),
          startLocation,
          endLocation
        }
      });

      return res.status(201).json({
        success: true,
        data: {
          deliveryId: delivery.id,
          orderId: delivery.orderId,
          status: delivery.status,
          createdAt: delivery.createdAt
        },
        message: 'Delivery order created successfully'
      });
    } catch (error) {
      console.error('Error creating delivery:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to create delivery order'
      });
    }
  }
);

/**
 * Update delivery location in real-time
 * POST /api/delivery/:deliveryId/location
 * Called frequently (every 5-10 seconds) by delivery app
 */
router.post(
  '/:deliveryId/location',
  [
    param('deliveryId').isUUID(),
    body('userId').isUUID(),
    body('latitude').isFloat({ min: -90, max: 90 }),
    body('longitude').isFloat({ min: -180, max: 180 }),
    body('accuracy').isInt({ min: 0 }).optional(),
    body('speed').isFloat({ min: 0 }).optional(),
    body('heading').isFloat({ min: 0, max: 360 }).optional()
  ],
  async (req: Request, res: Response): Promise<any> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { deliveryId } = req.params;
      const { userId, latitude, longitude, accuracy, speed, heading } =
        req.body;

      // Get delivery
      const delivery = await DeliveryService.findDeliveryById(deliveryId);
      if (!delivery) {
        return res.status(404).json({
          success: false,
          message: 'Delivery not found'
        });
      }

      // Verify authorization
      if (delivery.deliveryPersonId !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized to update this delivery'
        });
      }

      // Record location
      const locationRecord = await LocationService.recordLocation({
        deliveryId,
        userId,
        latitude,
        longitude,
        accuracy,
        speed,
        heading
      });

      // Calculate distances
      const distanceToEnd = calculateDistance(
        latitude,
        longitude,
        delivery.endLocation.latitude,
        delivery.endLocation.longitude
      );

      const distanceToStart = calculateDistance(
        latitude,
        longitude,
        delivery.startLocation.latitude,
        delivery.startLocation.longitude
      );

      // Update delivery status and distance
      let newStatus = delivery.status;
      if (
        delivery.status === 'pending' &&
        distanceToStart < 0.5
      ) {
        newStatus = 'in_transit';
        await DeliveryService.updateDeliveryStatus(deliveryId, 'in_transit');
      } else if (
        delivery.status === 'in_transit' &&
        distanceToEnd < 0.1
      ) {
        newStatus = 'arrived';
        await DeliveryService.updateDeliveryStatus(deliveryId, 'arrived');
      }

      // Update total distance
      const totalDistance = parseFloat(delivery.distanceMeters.toString()) + distanceToStart;
      await DeliveryService.updateDeliveryDistance(deliveryId, totalDistance);

      const eta = calculateETA(distanceToEnd, speed || 30);

      // 🔴 EMIT WEBSOCKET EVENT FOR REAL-TIME UPDATE
      const io = (req as any).io;
      if (io) {
        io.emit('delivery:location-updated', {
          deliveryId,
          orderId: delivery.orderId,
          latitude,
          longitude,
          status: newStatus,
          distanceToEnd: (distanceToEnd * 1000).toFixed(0) + 'm',
          eta: eta + ' min',
          speed,
          heading,
          timestamp: locationRecord.createdAt
        });

        // Also emit to specific delivery room
        io.to(`delivery:${delivery.orderId}`).emit('location-changed', {
          latitude,
          longitude,
          speed,
          heading,
          status: newStatus,
          distanceToEnd: (distanceToEnd * 1000).toFixed(0),
          eta,
          timestamp: new Date().toISOString()
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          deliveryId,
          status: newStatus,
          distanceToEnd: (distanceToEnd * 1000).toFixed(0) + 'm',
          estimatedETA: calculateETA(distanceToEnd, speed || 30) + ' min',
          lastUpdate: locationRecord.createdAt
        },
        message: 'Location updated successfully'
      });
    } catch (error) {
      console.error('Error updating location:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update location'
      });
    }
  }
);

/**
 * Get delivery status and details
 * GET /api/delivery/:deliveryId
 */
router.get(
  '/:deliveryId',
  param('deliveryId').isUUID(),
  async (req: Request, res: Response): Promise<any> => {
    try {
      const { deliveryId } = req.params;

      const delivery = await DeliveryService.findDeliveryById(deliveryId);
      if (!delivery) {
        return res.status(404).json({
          success: false,
          message: 'Delivery not found'
        });
      }

      // Get recent locations
      const recentLocations = await LocationService.getRecentLocations(
        deliveryId,
        10
      );

      return res.status(200).json({
        success: true,
        data: {
          ...delivery.toJSON(),
          recentLocations
        }
      });
    } catch (error) {
      console.error('Error fetching delivery:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch delivery'
      });
    }
  }
);

/**
 * Get location history for a delivery
 * GET /api/delivery/:deliveryId/history
 */
router.get(
  '/:deliveryId/history',
  param('deliveryId').isUUID(),
  async (req: Request, res: Response): Promise<any> => {
    try {
      const { deliveryId } = req.params;
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
      const offset = parseInt(req.query.offset as string) || 0;

      const locations = await DeliveryService.getDeliveryHistory(
        deliveryId,
        limit,
        offset
      );

      return res.status(200).json({
        success: true,
        data: locations,
        pagination: {
          limit,
          offset,
          total: locations.length
        }
      });
    } catch (error) {
      console.error('Error fetching location history:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch location history'
      });
    }
  }
);

/**
 * Complete delivery
 * POST /api/delivery/:deliveryId/complete
 */
router.post(
  '/:deliveryId/complete',
  [param('deliveryId').isUUID(), body('userId').isUUID()],
  async (req: Request, res: Response): Promise<any> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { deliveryId } = req.params;
      const { userId, latitude, longitude } = req.body;

      const delivery = await DeliveryService.findDeliveryById(deliveryId);
      if (!delivery) {
        return res.status(404).json({
          success: false,
          message: 'Delivery not found'
        });
      }

      if (delivery.deliveryPersonId !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized to complete this delivery'
        });
      }

      // Complete delivery
      const completedDelivery = await DeliveryService.updateDeliveryStatus(
        deliveryId,
        'completed'
      );

      // Mint Proof of Presence NFT on Solana blockchain
      let nftResult = null;
      if (solanaService.isInitialized()) {
        try {
          // Get last known location if not provided
          const lat = latitude || (delivery.endLocation as any)?.latitude || 0;
          const lng = longitude || (delivery.endLocation as any)?.longitude || 0;

          // Mint NFT on Solana
          nftResult = await solanaService.mintNFT({
            deliveryId,
            userId,
            latitude: lat,
            longitude: lng,
          });

          // Update NFT record in database
          const nftRecord = await NFTService.findNFTByDelivery(deliveryId);
          if (nftRecord) {
            await NFTService.updateNFTStatus(
              nftRecord.id,
              'minted',
              nftResult.txHash,
              nftResult.mint
            );
          }

          console.log(`🔗 NFT minted for delivery ${deliveryId}: ${nftResult.txHash}`);
        } catch (nftError) {
          console.error('NFT minting failed (delivery still completed):', nftError);
          // Don't fail the delivery completion if NFT minting fails
        }
      }

      return res.status(200).json({
        success: true,
        data: {
          ...completedDelivery,
          nft: nftResult
        },
        message: nftResult 
          ? 'Delivery completed and Proof of Presence NFT minted on Solana!'
          : 'Delivery completed successfully'
      });
    } catch (error) {
      console.error('Error completing delivery:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to complete delivery'
      });
    }
  }
);

/**
 * Get all deliveries for a delivery person
 * GET /api/delivery/person/:userId
 */
router.get(
  '/person/:userId',
  param('userId').isUUID(),
  async (req: Request, res: Response): Promise<any> => {
    try {
      const { userId } = req.params;

      const deliveries =
        await DeliveryService.findDeliveriesByDeliveryPerson(userId);

      return res.status(200).json({
        success: true,
        data: deliveries,
        total: deliveries.length
      });
    } catch (error) {
      console.error('Error fetching deliveries:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch deliveries'
      });
    }
  }
);

/**
 * Get all active deliveries (in_transit or arrived)
 * GET /api/delivery/active
 * Used by dashboard to show all active orders
 */
router.get(
  '/active',
  async (req: Request, res: Response): Promise<any> => {
    try {
      // Query all deliveries with status in_transit or arrived
      const { Delivery, User, LocationHistory } = require('../models/database');
      
      const activeDeliveries = await Delivery.findAll({
        where: {
          status: ['in_transit', 'arrived']
        },
        include: [
          {
            model: User,
            as: 'deliveryPerson',
            attributes: ['id', 'name', 'deviceId']
          },
          {
            model: User,
            as: 'customer',
            attributes: ['id', 'name', 'deviceId']
          },
          {
            model: LocationHistory,
            as: 'locations',
            limit: 5,
            order: [['createdAt', 'DESC']]
          }
        ],
        order: [['updatedAt', 'DESC']]
      });

      // Enrich with calculated fields
      const enrichedDeliveries = activeDeliveries.map((delivery: any) => {
        const recentLocation = delivery.locations && delivery.locations.length > 0 
          ? delivery.locations[0] 
          : null;

        const distanceToCustomer = recentLocation
          ? calculateDistance(
              recentLocation.latitude,
              recentLocation.longitude,
              delivery.endLocation.latitude,
              delivery.endLocation.longitude
            ) * 1000 // Convert to meters
          : 0;

        return {
          ...delivery.toJSON(),
          distanceToCustomer,
          eta: calculateETA(distanceToCustomer / 1000, 40), // Assume 40 km/h avg
          lastLocationUpdate: recentLocation?.createdAt || null
        };
      });

      return res.status(200).json({
        success: true,
        data: {
          deliveries: enrichedDeliveries,
          count: enrichedDeliveries.length,
          activeCount: enrichedDeliveries.length
        }
      });
    } catch (error) {
      console.error('Error fetching active deliveries:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch active deliveries'
      });
    }
  }
);

export default router;
