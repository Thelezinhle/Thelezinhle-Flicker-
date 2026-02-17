/**
 * Blockchain Routes - Solana integration endpoints
 * Handles NFT minting, verification, and wallet operations
 * Now with REAL NFT support via SPL Token!
 */

import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import solanaService, { MintNFTRequest } from '../services/SolanaService';
import { NFTRecord } from '../models/database';

const router = Router();

// ==================== Status & Info ====================

/**
 * Get blockchain service status
 * GET /api/blockchain/status
 */
router.get('/status', async (req: Request, res: Response): Promise<any> => {
  try {
    const status = solanaService.getStatus();
    
    let balanceSol: number | null = null;
    if (status.initialized) {
      try {
        balanceSol = await solanaService.getBalance();
      } catch (e) {
        // Balance fetch failed, continue without it
      }
    }

    // Get count of minted NFTs
    let nftCount = 0;
    try {
      nftCount = await NFTRecord.count({ where: { status: 'minted' } });
    } catch (e) {
      // Ignore
    }

    return res.json({
      success: true,
      data: {
        ...status,
        balanceSol,
        totalNFTsMinted: nftCount,
        features: {
          realNFT: true,
          splToken: true,
          memoProof: true,
        }
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to get status',
    });
  }
});

/**
 * Get NFT by delivery ID
 * GET /api/blockchain/delivery/:deliveryId/nft
 */
router.get('/delivery/:deliveryId/nft', [
  param('deliveryId').isUUID().withMessage('Valid delivery ID required'),
], async (req: Request, res: Response): Promise<any> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const nftRecord = await NFTRecord.findOne({
      where: { deliveryId: req.params.deliveryId }
    });

    if (!nftRecord) {
      return res.status(404).json({
        success: false,
        error: 'No NFT found for this delivery'
      });
    }

    // Get on-chain details if transaction hash exists
    let onChainData = null;
    if (nftRecord.transactionHash && solanaService.isInitialized()) {
      try {
        onChainData = await solanaService.getNFT(nftRecord.transactionHash);
      } catch (e) {
        // Ignore fetch errors
      }
    }

    return res.json({
      success: true,
      data: {
        id: nftRecord.id,
        deliveryId: nftRecord.deliveryId,
        mint: nftRecord.nftMintAddress,
        transactionHash: nftRecord.transactionHash,
        status: nftRecord.status,
        metadata: nftRecord.metadata,
        createdAt: nftRecord.createdAt,
        onChain: onChainData,
        explorerUrl: nftRecord.transactionHash 
          ? `https://explorer.solana.com/tx/${nftRecord.transactionHash}?cluster=${solanaService.getNetwork()}`
          : null,
        mintExplorerUrl: nftRecord.nftMintAddress
          ? `https://explorer.solana.com/address/${nftRecord.nftMintAddress}?cluster=${solanaService.getNetwork()}`
          : null,
      }
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to get NFT'
    });
  }
});

/**
 * Get wallet balance
 * GET /api/blockchain/balance
 */
router.get('/balance', async (req: Request, res: Response): Promise<any> => {
  try {
    if (!solanaService.isInitialized()) {
      return res.status(503).json({
        success: false,
        error: 'Wallet not initialized',
      });
    }

    const balance = await solanaService.getBalance();

    return res.json({
      success: true,
      data: {
        wallet: solanaService.getWalletAddress(),
        balanceSol: balance,
        network: solanaService.getNetwork(),
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to get balance',
    });
  }
});

// ==================== NFT Operations ====================

/**
 * Mint a Proof of Presence NFT
 * POST /api/blockchain/mint-nft
 */
router.post('/mint-nft', [
  body('deliveryId').notEmpty().withMessage('Delivery ID required'),
  body('latitude').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude required'),
  body('longitude').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude required'),
], async (req: Request, res: Response): Promise<any> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    if (!solanaService.isInitialized()) {
      return res.status(503).json({
        success: false,
        error: 'Blockchain service not initialized - configure SOLANA_WALLET_KEY',
      });
    }

    // Get user ID from auth or request
    const userId = (req as any).user?.id || req.body.userId || 'anonymous';

    const mintRequest: MintNFTRequest = {
      deliveryId: req.body.deliveryId,
      userId: userId,
      latitude: parseFloat(req.body.latitude),
      longitude: parseFloat(req.body.longitude),
      nfcTagId: req.body.nfcTagId,
      deviceInfo: req.body.deviceInfo,
    };

    const nft = await solanaService.mintNFT(mintRequest);

    return res.status(201).json({
      success: true,
      message: 'Proof of Presence NFT minted successfully',
      data: nft,
    });
  } catch (error: any) {
    console.error('Mint NFT error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to mint NFT',
    });
  }
});

/**
 * Get NFT/transaction details
 * GET /api/blockchain/nft/:txSignature
 */
router.get('/nft/:txSignature', [
  param('txSignature').notEmpty().withMessage('Transaction signature required'),
], async (req: Request, res: Response): Promise<any> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const nft = await solanaService.getNFT(req.params.txSignature);

    if (!nft) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found',
      });
    }

    return res.json({
      success: true,
      data: nft,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to get NFT',
    });
  }
});

/**
 * Verify a transaction on-chain
 * POST /api/blockchain/verify
 */
router.post('/verify', [
  body('signature').notEmpty().withMessage('Transaction signature required'),
], async (req: Request, res: Response): Promise<any> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const verified = await solanaService.verifyNFT(req.body.signature);

    return res.json({
      success: true,
      data: {
        signature: req.body.signature,
        verified,
        network: solanaService.getNetwork(),
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to verify transaction',
    });
  }
});

// ==================== Wallet Operations ====================

/**
 * Generate a new wallet keypair (utility endpoint)
 * GET /api/blockchain/generate-wallet
 */
router.get('/generate-wallet', (req: Request, res: Response): any => {
  try {
    // Dynamic import to avoid loading if not needed
    const { generateWallet } = require('../services/SolanaService');
    
    // Use static method
    const SolanaService = require('../services/SolanaService').default;
    if (SolanaService.generateWallet) {
      const wallet = SolanaService.generateWallet();
      return res.json({
        success: true,
        data: wallet,
        warning: 'SAVE YOUR PRIVATE KEY SECURELY! It cannot be recovered.',
        nextSteps: [
          '1. Save the privateKey to your .env file as SOLANA_WALLET_KEY',
          '2. Request airdrop on devnet: POST /api/blockchain/airdrop',
          '3. Start minting NFTs: POST /api/blockchain/mint-nft',
        ],
      });
    }

    // Fallback: generate inline
    const { Keypair } = require('@solana/web3.js');
    const bs58 = require('bs58');
    const keypair = Keypair.generate();
    
    return res.json({
      success: true,
      data: {
        publicKey: keypair.publicKey.toBase58(),
        privateKey: bs58.encode(keypair.secretKey),
      },
      warning: 'SAVE YOUR PRIVATE KEY SECURELY! It cannot be recovered.',
      nextSteps: [
        '1. Save the privateKey to your .env file as SOLANA_WALLET_KEY',
        '2. Request airdrop on devnet: POST /api/blockchain/airdrop',
        '3. Start minting NFTs: POST /api/blockchain/mint-nft',
      ],
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate wallet',
    });
  }
});

/**
 * Request SOL airdrop from devnet faucet (testing only)
 * POST /api/blockchain/airdrop
 */
router.post('/airdrop', async (req: Request, res: Response): Promise<any> => {
  try {
    if (!solanaService.isInitialized()) {
      return res.status(503).json({
        success: false,
        error: 'Wallet not initialized',
      });
    }

    let amount = parseFloat(req.body.amount) || 1.0;
    if (amount > 2.0) amount = 2.0; // Devnet max

    const signature = await solanaService.requestAirdrop(amount);

    return res.json({
      success: true,
      data: {
        amountSol: amount,
        signature,
        explorer: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Airdrop failed',
    });
  }
});

/**
 * Get transaction history
 * GET /api/blockchain/transactions
 */
router.get('/transactions', async (req: Request, res: Response): Promise<any> => {
  try {
    if (!solanaService.isInitialized()) {
      return res.status(503).json({
        success: false,
        error: 'Wallet not initialized',
      });
    }

    const limit = parseInt(req.query.limit as string) || 20;
    const transactions = await solanaService.getTransactionHistory(limit);

    return res.json({
      success: true,
      data: {
        wallet: solanaService.getWalletAddress(),
        network: solanaService.getNetwork(),
        transactions,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to get transactions',
    });
  }
});

/**
 * List all minted NFTs from database
 * GET /api/blockchain/nfts
 */
router.get('/nfts', async (req: Request, res: Response): Promise<any> => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const status = req.query.status as string || undefined;

    const whereClause: any = {};
    if (status) {
      whereClause.status = status;
    }

    const nfts = await NFTRecord.findAll({
      where: whereClause,
      order: [['createdAt', 'DESC']],
      limit,
    });

    const cluster = solanaService.getNetwork();

    return res.json({
      success: true,
      data: {
        total: nfts.length,
        network: cluster,
        nfts: nfts.map((nft: any) => ({
          id: nft.id,
          deliveryId: nft.deliveryId,
          mint: nft.nftMintAddress,
          transactionHash: nft.transactionHash,
          status: nft.status,
          metadata: nft.metadata,
          createdAt: nft.createdAt,
          explorerUrl: nft.transactionHash 
            ? `https://explorer.solana.com/tx/${nft.transactionHash}?cluster=${cluster}`
            : null,
        })),
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to get NFTs',
    });
  }
});

export default router;
