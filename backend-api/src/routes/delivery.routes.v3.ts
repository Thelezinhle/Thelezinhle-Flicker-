/**
 * Delivery Routes v3 - Web-focused delivery API
 * Uses the new DeliveryService that mirrors Go backend
 * Includes QR code verification (web alternative to NFC)
 * Now with REAL Solana blockchain NFT minting!
 */

import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { deliveryService } from '../services/DeliveryService';
import solanaService from '../services/SolanaService';
import { NFTRecord } from '../models/database';

const router = Router();

// ============== Delivery Order Routes ==============

/**
 * Create a new delivery order
 * POST /api/delivery/create
 */
router.post('/create', [
  body('recipient_id').isUUID().withMessage('Valid recipient_id required'),
  body('venue_id').optional().isUUID(),
  body('content').notEmpty().withMessage('Content is required')
], async (req: Request, res: Response): Promise<any> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    // Get driver ID from auth token or request
    const driverId = (req as any).user?.id || req.body.driver_id;
    
    if (!driverId) {
      return res.status(401).json({ 
        success: false, 
        error: 'Driver ID required' 
      });
    }

    const delivery = await deliveryService.createOrder(driverId, {
      recipient_id: req.body.recipient_id,
      venue_id: req.body.venue_id,
      content: req.body.content
    });

    return res.status(201).json({
      success: true,
      data: delivery,
      message: 'Delivery created successfully'
    });
  } catch (error: any) {
    console.error('Create delivery error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to create delivery'
    });
  }
});

/**
 * Get a single delivery by ID
 * GET /api/delivery/:id
 */
router.get('/:id', [
  param('id').isUUID().withMessage('Valid delivery ID required')
], async (req: Request, res: Response): Promise<any> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const delivery = await deliveryService.getOrder(req.params.id);
    
    if (!delivery) {
      return res.status(404).json({
        success: false,
        error: 'Delivery not found'
      });
    }

    return res.json({ success: true, data: delivery });
  } catch (error: any) {
    console.error('Get delivery error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to get delivery'
    });
  }
});

/**
 * Get user's deliveries (as recipient)
 * GET /api/delivery/my-deliveries
 */
router.get('/user/my-deliveries', async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).user?.id || req.query.user_id as string;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User ID required'
      });
    }

    const deliveries = await deliveryService.getUserDeliveries(userId);

    return res.json({
      success: true,
      data: { deliveries }
    });
  } catch (error: any) {
    console.error('Get user deliveries error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to get deliveries'
    });
  }
});

/**
 * Get active deliveries (for tracking)
 * GET /api/delivery/active
 */
router.get('/status/active', async (req: Request, res: Response): Promise<any> => {
  try {
    const deliveries = await deliveryService.getActiveDeliveries();

    return res.json({
      success: true,
      data: { deliveries }
    });
  } catch (error: any) {
    console.error('Get active deliveries error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to get active deliveries'
    });
  }
});

/**
 * Get delivery history
 * GET /api/delivery/history
 */
router.get('/status/history', async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).user?.id || req.query.user_id as string;
    const deliveries = await deliveryService.getDeliveryHistory(userId);

    return res.json({
      success: true,
      data: { deliveries }
    });
  } catch (error: any) {
    console.error('Get delivery history error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to get delivery history'
    });
  }
});

/**
 * Update delivery status
 * PUT /api/delivery/:id/status
 */
router.put('/:id/status', [
  param('id').isUUID(),
  body('status').isIn(['pending', 'assigned', 'picked_up', 'in_transit', 'nearby', 'arrived', 'delivered', 'cancelled'])
], async (req: Request, res: Response): Promise<any> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const delivery = await deliveryService.updateStatus(req.params.id, req.body.status);
    
    if (!delivery) {
      return res.status(404).json({
        success: false,
        error: 'Delivery not found'
      });
    }

    return res.json({
      success: true,
      data: delivery,
      message: 'Status updated successfully'
    });
  } catch (error: any) {
    console.error('Update status error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to update status'
    });
  }
});

/**
 * Update delivery location
 * POST /api/delivery/:id/location
 */
router.post('/:id/location', [
  param('id').isUUID(),
  body('latitude').isFloat({ min: -90, max: 90 }),
  body('longitude').isFloat({ min: -180, max: 180 }),
  body('speed').optional().isFloat({ min: 0 }),
  body('heading').optional().isFloat({ min: 0, max: 360 })
], async (req: Request, res: Response): Promise<any> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const delivery = await deliveryService.updateLocation(req.params.id, {
      latitude: req.body.latitude,
      longitude: req.body.longitude,
      speed: req.body.speed,
      heading: req.body.heading
    });

    if (!delivery) {
      return res.status(404).json({
        success: false,
        error: 'Delivery not found'
      });
    }

    return res.json({
      success: true,
      data: delivery
    });
  } catch (error: any) {
    console.error('Update location error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to update location'
    });
  }
});

// ============== Verification Routes ==============

/**
 * Verify delivery with QR code (web alternative to NFC)
 * Mints Proof of Presence NFT on successful verification
 * POST /api/delivery/verify-qr
 */
router.post('/verify-qr', [
  body('delivery_id').isUUID().withMessage('Valid delivery_id required'),
  body('qr_code').notEmpty().withMessage('QR code required'),
  body('latitude').optional().isFloat({ min: -90, max: 90 }),
  body('longitude').optional().isFloat({ min: -180, max: 180 }),
], async (req: Request, res: Response): Promise<any> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const deliveryId = req.body.delivery_id;

    // Get delivery before verification
    const deliveryBefore = await deliveryService.getOrder(deliveryId);
    if (!deliveryBefore) {
      return res.status(404).json({
        success: false,
        error: 'Delivery not found'
      });
    }

    // Verify with QR code (marks as delivered)
    const delivery = await deliveryService.qrVerify({
      delivery_id: deliveryId,
      qr_data: req.body.qr_code
    });

    // Mint NFT on blockchain
    let nftResult = null;
    if (solanaService.isInitialized()) {
      try {
        const lat = req.body.latitude || deliveryBefore.latitude || 0;
        const lng = req.body.longitude || deliveryBefore.longitude || 0;

        nftResult = await solanaService.mintNFT({
          deliveryId: deliveryId,
          userId: deliveryBefore.driver_id,
          latitude: lat,
          longitude: lng,
        });

        // Save to database
        await NFTRecord.create({
          deliveryId: deliveryId,
          transactionHash: nftResult.txHash,
          nftMintAddress: nftResult.mint,
          status: 'minted',
          metadata: {
            ...nftResult.metadata,
            verificationMethod: 'qr_code',
            explorerUrl: nftResult.explorerUrl,
            isRealNFT: nftResult.isRealNFT,
          }
        });

        console.log(`✅ QR verification + NFT minting complete for ${deliveryId}`);
      } catch (nftError: any) {
        console.error('NFT minting failed after QR verification:', nftError.message);
      }
    }

    return res.json({
      success: true,
      data: {
        ...delivery,
        blockchain: nftResult ? {
          minted: true,
          isRealNFT: nftResult.isRealNFT,
          mint: nftResult.mint,
          transactionHash: nftResult.txHash,
          explorerUrl: nftResult.explorerUrl,
          network: nftResult.network,
        } : null
      },
      message: nftResult 
        ? 'Delivery verified! Proof of Presence NFT minted on Solana'
        : 'Delivery verified successfully'
    });
  } catch (error: any) {
    console.error('QR verify error:', error);
    return res.status(400).json({
      success: false,
      error: error.message || 'QR verification failed'
    });
  }
});

/**
 * Generate QR code for delivery verification
 * POST /api/delivery/:id/generate-qr
 */
router.post('/:id/generate-qr', [
  param('id').isUUID()
], async (req: Request, res: Response): Promise<any> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const qrData = await deliveryService.generateQRCode(req.params.id);

    return res.json({
      success: true,
      data: qrData
    });
  } catch (error: any) {
    console.error('Generate QR error:', error);
    return res.status(400).json({
      success: false,
      error: error.message || 'Failed to generate QR code'
    });
  }
});

/**
 * Verify delivery with NFC (kept for mobile apps)
 * Mints Proof of Presence NFT on successful verification
 * POST /api/delivery/verify-nfc
 */
router.post('/verify-nfc', [
  body('delivery_id').isUUID().withMessage('Valid delivery_id required'),
  body('nfc_tag').notEmpty().withMessage('NFC tag required'),
  body('latitude').optional().isFloat({ min: -90, max: 90 }),
  body('longitude').optional().isFloat({ min: -180, max: 180 }),
], async (req: Request, res: Response): Promise<any> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const deliveryId = req.body.delivery_id;

    // Get delivery before verification
    const deliveryBefore = await deliveryService.getOrder(deliveryId);
    if (!deliveryBefore) {
      return res.status(404).json({
        success: false,
        error: 'Delivery not found'
      });
    }

    // Verify with NFC tag (marks as delivered)
    const delivery = await deliveryService.nfcVerify({
      delivery_id: deliveryId,
      nfc_tag: req.body.nfc_tag
    });

    // Mint NFT on blockchain
    let nftResult = null;
    if (solanaService.isInitialized()) {
      try {
        const lat = req.body.latitude || deliveryBefore.latitude || 0;
        const lng = req.body.longitude || deliveryBefore.longitude || 0;

        nftResult = await solanaService.mintNFT({
          deliveryId: deliveryId,
          userId: deliveryBefore.driver_id,
          latitude: lat,
          longitude: lng,
          nfcTagId: req.body.nfc_tag,
        });

        // Save to database
        await NFTRecord.create({
          deliveryId: deliveryId,
          transactionHash: nftResult.txHash,
          nftMintAddress: nftResult.mint,
          status: 'minted',
          metadata: {
            ...nftResult.metadata,
            verificationMethod: 'nfc',
            nfcTagId: req.body.nfc_tag,
            explorerUrl: nftResult.explorerUrl,
            isRealNFT: nftResult.isRealNFT,
          }
        });

        console.log(`✅ NFC verification + NFT minting complete for ${deliveryId}`);
      } catch (nftError: any) {
        console.error('NFT minting failed after NFC verification:', nftError.message);
      }
    }

    return res.json({
      success: true,
      data: {
        ...delivery,
        blockchain: nftResult ? {
          minted: true,
          isRealNFT: nftResult.isRealNFT,
          mint: nftResult.mint,
          transactionHash: nftResult.txHash,
          explorerUrl: nftResult.explorerUrl,
          network: nftResult.network,
        } : null
      },
      message: nftResult 
        ? 'Delivery verified via NFC! Proof of Presence NFT minted on Solana'
        : 'Delivery verified via NFC'
    });
  } catch (error: any) {
    console.error('NFC verify error:', error);
    return res.status(400).json({
      success: false,
      error: error.message || 'NFC verification failed'
    });
  }
});

/**
 * Confirm delivery handoff with blockchain NFT minting
 * POST /api/delivery/:id/confirm
 * This endpoint:
 * 1. Marks delivery as completed
 * 2. Mints a REAL Proof of Presence NFT on Solana
 * 3. Records the NFT in the database
 */
router.post('/:id/confirm', [
  param('id').isUUID(),
  body('latitude').optional().isFloat({ min: -90, max: 90 }),
  body('longitude').optional().isFloat({ min: -180, max: 180 }),
], async (req: Request, res: Response): Promise<any> => {
  try {
    const deliveryId = req.params.id;
    
    // 1. Get delivery details first
    const deliveryBefore = await deliveryService.getOrder(deliveryId);
    if (!deliveryBefore) {
      return res.status(404).json({
        success: false,
        error: 'Delivery not found'
      });
    }

    // 2. Mark delivery as completed
    const delivery = await deliveryService.confirmDelivery(deliveryId);

    // 3. Mint NFT on Solana blockchain
    let nftResult = null;
    let nftError = null;
    
    if (solanaService.isInitialized()) {
      try {
        const lat = req.body.latitude || deliveryBefore.latitude || 0;
        const lng = req.body.longitude || deliveryBefore.longitude || 0;

        console.log(`🔗 Minting Proof of Presence NFT for delivery ${deliveryId}...`);
        
        nftResult = await solanaService.mintNFT({
          deliveryId: deliveryId,
          userId: deliveryBefore.driver_id,
          latitude: lat,
          longitude: lng,
        });

        // 4. Save NFT record to database
        try {
          await NFTRecord.create({
            deliveryId: deliveryId,
            transactionHash: nftResult.txHash,
            nftMintAddress: nftResult.mint,
            status: 'minted',
            metadata: {
              ...nftResult.metadata,
              explorerUrl: nftResult.explorerUrl,
              mintExplorerUrl: nftResult.mintExplorerUrl,
              isRealNFT: nftResult.isRealNFT,
            }
          });
        } catch (dbError) {
          console.error('Failed to save NFT to database (NFT still minted):', dbError);
        }

        console.log(`✅ NFT minted successfully!`);
        console.log(`   Mint Address: ${nftResult.mint}`);
        console.log(`   Explorer: ${nftResult.explorerUrl}`);
        
      } catch (error: any) {
        console.error('NFT minting failed:', error.message);
        nftError = error.message;
      }
    } else {
      nftError = 'Blockchain service not initialized - delivery confirmed without NFT';
      console.warn('⚠️ ' + nftError);
    }

    return res.json({
      success: true,
      data: {
        ...delivery,
        blockchain: nftResult ? {
          minted: true,
          isRealNFT: nftResult.isRealNFT,
          mint: nftResult.mint,
          tokenAccount: nftResult.tokenAccount,
          transactionHash: nftResult.txHash,
          explorerUrl: nftResult.explorerUrl,
          mintExplorerUrl: nftResult.mintExplorerUrl,
          network: nftResult.network,
          verifyHash: nftResult.metadata.verifyHash,
        } : {
          minted: false,
          error: nftError
        }
      },
      message: nftResult 
        ? `Delivery confirmed! Proof of Presence NFT minted on Solana ${solanaService.getNetwork()}`
        : 'Delivery confirmed (blockchain minting skipped)'
    });
  } catch (error: any) {
    console.error('Confirm delivery error:', error);
    return res.status(400).json({
      success: false,
      error: error.message || 'Failed to confirm delivery'
    });
  }
});

/**
 * Report wrong person received delivery
 * POST /api/delivery/:id/wrong-person
 */
router.post('/:id/wrong-person', [
  param('id').isUUID(),
  body('reason').notEmpty().withMessage('Reason required')
], async (req: Request, res: Response): Promise<any> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const delivery = await deliveryService.reportWrongPerson(
      req.params.id, 
      req.body.reason
    );

    return res.json({
      success: true,
      data: delivery,
      message: 'Report submitted'
    });
  } catch (error: any) {
    console.error('Report wrong person error:', error);
    return res.status(400).json({
      success: false,
      error: error.message || 'Failed to submit report'
    });
  }
});

// ============== Venue Routes ==============

/**
 * Create a new venue
 * POST /api/delivery/venues
 */
router.post('/venues', [
  body('name').notEmpty().withMessage('Name required'),
  body('category').notEmpty().withMessage('Category required'),
  body('latitude').isFloat({ min: -90, max: 90 }),
  body('longitude').isFloat({ min: -180, max: 180 }),
  body('radius').isFloat({ min: 0 }).optional(),
  body('address').optional().isString(),
  body('phone').optional().isString()
], async (req: Request, res: Response): Promise<any> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const venue = await deliveryService.createVenue({
      name: req.body.name,
      category: req.body.category,
      latitude: req.body.latitude,
      longitude: req.body.longitude,
      radius: req.body.radius || 50,
      address: req.body.address,
      phone: req.body.phone
    });

    return res.status(201).json({
      success: true,
      data: venue,
      message: 'Venue created successfully'
    });
  } catch (error: any) {
    console.error('Create venue error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to create venue'
    });
  }
});

/**
 * Get all venues
 * GET /api/delivery/venues
 */
router.get('/venues', async (req: Request, res: Response): Promise<any> => {
  try {
    const venues = await deliveryService.getVenues();

    return res.json({
      success: true,
      data: { venues }
    });
  } catch (error: any) {
    console.error('Get venues error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to get venues'
    });
  }
});

/**
 * Search venues
 * GET /api/delivery/venues/search?q=query
 */
router.get('/venues/search', [
  query('q').notEmpty().withMessage('Search query required')
], async (req: Request, res: Response): Promise<any> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const venues = await deliveryService.searchVenues(req.query.q as string);

    return res.json({
      success: true,
      data: { venues }
    });
  } catch (error: any) {
    console.error('Search venues error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Search failed'
    });
  }
});

/**
 * Get nearby venues
 * GET /api/delivery/venues/nearby?lat=x&lng=y&radius=5
 */
router.get('/venues/nearby', [
  query('lat').isFloat({ min: -90, max: 90 }),
  query('lng').isFloat({ min: -180, max: 180 }),
  query('radius').optional().isFloat({ min: 0 })
], async (req: Request, res: Response): Promise<any> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const venues = await deliveryService.getNearbyVenues(
      parseFloat(req.query.lat as string),
      parseFloat(req.query.lng as string),
      parseFloat(req.query.radius as string) || 5
    );

    return res.json({
      success: true,
      data: { venues }
    });
  } catch (error: any) {
    console.error('Get nearby venues error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to get nearby venues'
    });
  }
});

/**
 * Get venue by ID
 * GET /api/delivery/venues/:id
 */
router.get('/venues/:id', [
  param('id').isUUID()
], async (req: Request, res: Response): Promise<any> => {
  try {
    const venue = await deliveryService.getVenue(req.params.id);
    
    if (!venue) {
      return res.status(404).json({
        success: false,
        error: 'Venue not found'
      });
    }

    return res.json({
      success: true,
      data: venue
    });
  } catch (error: any) {
    console.error('Get venue error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to get venue'
    });
  }
});

export default router;
