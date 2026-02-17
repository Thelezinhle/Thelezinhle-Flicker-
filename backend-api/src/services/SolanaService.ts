/**
 * SolanaService - REAL Blockchain integration for FlickerSecure
 * Handles Proof of Presence NFT minting on Solana using SPL Token
 * Creates actual on-chain NFTs (not just memo-based proofs)
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
  clusterApiUrl,
  Cluster,
  SystemProgram,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  createInitializeMintInstruction,
  createMintToInstruction,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  getMinimumBalanceForRentExemptMint,
  MINT_SIZE,
  createSetAuthorityInstruction,
  AuthorityType,
} from '@solana/spl-token';
import * as crypto from 'crypto';
import bs58 from 'bs58';

// Memo Program ID (official Solana Memo program)
const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

// Token Metadata Program ID (Metaplex standard)
const TOKEN_METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

// ==================== Types ====================

export interface MintNFTRequest {
  deliveryId: string;
  userId: string;
  latitude: number;
  longitude: number;
  nfcTagId?: string;
  deviceInfo?: string;
  recipientPublicKey?: string; // Optional: mint to specific recipient
}

export interface NFTMetadata {
  name: string;
  symbol: string;
  deviceId: string;
  latitude: string;
  longitude: string;
  timestamp: string;
  nfcTagId?: string;
  verifyHash: string;
  uri?: string;
}

export interface NFTResponse {
  id: string;
  mint: string;
  tokenAccount: string;
  txHash: string;
  metadata: NFTMetadata;
  network: string;
  explorerUrl: string;
  mintExplorerUrl: string;
  timestamp: Date;
  status: string;
  isRealNFT: boolean; // true = SPL Token NFT, false = memo-only proof
}

export interface TransactionRecord {
  signature: string;
  blockTime: number | null;
  slot: number;
  fee: number;
  status: string;
}

export interface WalletInfo {
  publicKey: string;
  privateKey: string;
}

// ==================== Service ====================

class SolanaService {
  private connection: Connection;
  private wallet: Keypair | null = null;
  private network: Cluster | string;
  private initialized: boolean = false;

  constructor() {
    // Default to devnet
    this.network = process.env.SOLANA_NETWORK || 'devnet';
    
    const rpcUrl = process.env.SOLANA_RPC_URL || clusterApiUrl(this.network as Cluster);
    this.connection = new Connection(rpcUrl, 'confirmed');

    // Initialize wallet if key provided
    const walletKey = process.env.SOLANA_WALLET_KEY;
    if (walletKey) {
      try {
        const secretKey = bs58.decode(walletKey);
        this.wallet = Keypair.fromSecretKey(secretKey);
        this.initialized = true;
        console.log(`✅ Solana service initialized on ${this.network}`);
        console.log(`   Wallet: ${this.wallet.publicKey.toBase58()}`);
      } catch (error) {
        console.error('❌ Failed to parse wallet key:', error);
      }
    } else {
      console.warn('⚠️ No SOLANA_WALLET_KEY - blockchain service in read-only mode');
    }
  }

  /**
   * Initialize with explicit configuration
   */
  async initializeWithConfig(rpcUrl: string, walletKey: string, network: string): Promise<void> {
    this.network = network;
    this.connection = new Connection(rpcUrl, 'confirmed');

    if (walletKey) {
      const secretKey = bs58.decode(walletKey);
      this.wallet = Keypair.fromSecretKey(secretKey);
      this.initialized = true;
    }
  }

  /**
   * Check if service is ready
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get wallet public address
   */
  getWalletAddress(): string {
    return this.wallet?.publicKey.toBase58() || '';
  }

  /**
   * Get current network
   */
  getNetwork(): string {
    return this.network;
  }

  /**
   * Get wallet SOL balance
   */
  async getBalance(): Promise<number> {
    if (!this.wallet) {
      throw new Error('Wallet not initialized');
    }

    const balance = await this.connection.getBalance(this.wallet.publicKey);
    return balance / LAMPORTS_PER_SOL;
  }

  /**
   * Generate a new Solana wallet keypair
   */
  static generateWallet(): WalletInfo {
    const keypair = Keypair.generate();
    return {
      publicKey: keypair.publicKey.toBase58(),
      privateKey: bs58.encode(keypair.secretKey),
    };
  }

  /**
   * Request airdrop from devnet faucet (testing only)
   */
  async requestAirdrop(amountSOL: number = 1): Promise<string> {
    if (this.network !== 'devnet') {
      throw new Error('Airdrop only available on devnet');
    }

    if (!this.wallet) {
      throw new Error('Wallet not initialized');
    }

    // Devnet max is 2 SOL per request
    const amount = Math.min(amountSOL, 2);
    const lamports = amount * LAMPORTS_PER_SOL;

    console.log(`📥 Requesting airdrop of ${amount} SOL...`);
    
    const signature = await this.connection.requestAirdrop(
      this.wallet.publicKey,
      lamports
    );

    // Wait for confirmation
    await this.connection.confirmTransaction(signature, 'confirmed');
    
    console.log(`✅ Airdrop confirmed: ${signature}`);
    return signature;
  }

  /**
   * Mint a REAL Proof of Presence NFT on Solana
   * Creates an actual SPL Token NFT with:
   * - Unique mint account (decimals=0, supply=1)
   * - Associated token account for recipient
   * - On-chain metadata via Memo program
   * - Disabled mint authority (true 1/1 NFT)
   */
  async mintNFT(req: MintNFTRequest): Promise<NFTResponse> {
    if (!this.initialized || !this.wallet) {
      throw new Error('Blockchain service not initialized - wallet key required');
    }

    const timestamp = new Date();

    // Create metadata
    const metadata: NFTMetadata = {
      name: `FlickerSecure POP #${req.deliveryId.substring(0, 8)}`,
      symbol: 'FLKR-POP',
      deviceId: req.userId,
      latitude: req.latitude.toFixed(6),
      longitude: req.longitude.toFixed(6),
      timestamp: timestamp.toISOString(),
      nfcTagId: req.nfcTagId,
      verifyHash: '',
    };

    // Create verification hash
    const hashData = `${req.deliveryId}:${req.userId}:${metadata.latitude}:${metadata.longitude}:${metadata.timestamp}`;
    const hash = crypto.createHash('sha256').update(hashData).digest('hex');
    metadata.verifyHash = hash.substring(0, 16); // First 16 chars

    console.log(`🔗 Minting REAL NFT for delivery ${req.deliveryId}...`);

    try {
      // ========== STEP 1: Create NFT Mint Account ==========
      const mintKeypair = Keypair.generate();
      const lamportsForMint = await getMinimumBalanceForRentExemptMint(this.connection);
      
      // Recipient public key (defaults to our wallet)
      const recipientPubkey = req.recipientPublicKey 
        ? new PublicKey(req.recipientPublicKey)
        : this.wallet.publicKey;

      // Get associated token account address
      const associatedTokenAccount = await getAssociatedTokenAddress(
        mintKeypair.publicKey,
        recipientPubkey
      );

      // Create on-chain metadata JSON (stored in memo)
      const onChainMetadata = JSON.stringify({
        type: 'ProofOfPresence',
        version: '2.0',
        delivery: req.deliveryId,
        user: req.userId.substring(0, 8),
        lat: metadata.latitude,
        lng: metadata.longitude,
        time: Math.floor(timestamp.getTime() / 1000),
        hash: metadata.verifyHash,
        nfc: req.nfcTagId || null,
        mint: mintKeypair.publicKey.toBase58(),
      });

      // ========== STEP 2: Build Transaction ==========
      const transaction = new Transaction();

      // 2a. Create mint account
      transaction.add(
        SystemProgram.createAccount({
          fromPubkey: this.wallet.publicKey,
          newAccountPubkey: mintKeypair.publicKey,
          lamports: lamportsForMint,
          space: MINT_SIZE,
          programId: TOKEN_PROGRAM_ID,
        })
      );

      // 2b. Initialize mint (decimals=0 for NFT)
      transaction.add(
        createInitializeMintInstruction(
          mintKeypair.publicKey,
          0, // 0 decimals = NFT
          this.wallet.publicKey, // mint authority
          this.wallet.publicKey  // freeze authority
        )
      );

      // 2c. Create associated token account
      transaction.add(
        createAssociatedTokenAccountInstruction(
          this.wallet.publicKey,    // payer
          associatedTokenAccount,   // token account
          recipientPubkey,          // owner
          mintKeypair.publicKey     // mint
        )
      );

      // 2d. Mint exactly 1 token (NFT)
      transaction.add(
        createMintToInstruction(
          mintKeypair.publicKey,
          associatedTokenAccount,
          this.wallet.publicKey,
          1 // mint supply = 1
        )
      );

      // 2e. Disable mint authority (makes it a true 1/1 NFT)
      transaction.add(
        createSetAuthorityInstruction(
          mintKeypair.publicKey,
          this.wallet.publicKey,
          AuthorityType.MintTokens,
          null // Remove mint authority
        )
      );

      // 2f. Add metadata via Memo (on-chain proof)
      transaction.add(
        new TransactionInstruction({
          keys: [{ pubkey: this.wallet.publicKey, isSigner: true, isWritable: false }],
          programId: MEMO_PROGRAM_ID,
          data: Buffer.from(onChainMetadata, 'utf-8'),
        })
      );

      // ========== STEP 3: Send Transaction ==========
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.wallet, mintKeypair],
        { commitment: 'confirmed' }
      );

      console.log(`✅ REAL NFT minted!`);
      console.log(`   Mint: ${mintKeypair.publicKey.toBase58()}`);
      console.log(`   Token Account: ${associatedTokenAccount.toBase58()}`);
      console.log(`   Signature: ${signature}`);

      // Build explorer URLs
      const cluster = this.network === 'mainnet-beta' ? '' : `?cluster=${this.network}`;
      const explorerUrl = `https://explorer.solana.com/tx/${signature}${cluster}`;
      const mintExplorerUrl = `https://explorer.solana.com/address/${mintKeypair.publicKey.toBase58()}${cluster}`;

      return {
        id: req.deliveryId,
        mint: mintKeypair.publicKey.toBase58(),
        tokenAccount: associatedTokenAccount.toBase58(),
        txHash: signature,
        metadata,
        network: this.network,
        explorerUrl,
        mintExplorerUrl,
        timestamp,
        status: 'confirmed',
        isRealNFT: true,
      };

    } catch (error: any) {
      console.error('❌ Real NFT minting failed, falling back to memo-only:', error.message);
      
      // Fallback to memo-only proof if NFT minting fails
      return this.mintMemoProof(req, metadata, timestamp);
    }
  }

  /**
   * Fallback: Mint memo-only proof (no actual NFT, but on-chain record)
   */
  private async mintMemoProof(
    req: MintNFTRequest, 
    metadata: NFTMetadata, 
    timestamp: Date
  ): Promise<NFTResponse> {
    const memoData = JSON.stringify({
      type: 'ProofOfPresence',
      version: '1.0-memo',
      delivery: req.deliveryId,
      user: req.userId.substring(0, 8),
      lat: metadata.latitude,
      lng: metadata.longitude,
      time: Math.floor(timestamp.getTime() / 1000),
      hash: metadata.verifyHash,
    });

    const memoInstruction = new TransactionInstruction({
      keys: [{ pubkey: this.wallet!.publicKey, isSigner: true, isWritable: false }],
      programId: MEMO_PROGRAM_ID,
      data: Buffer.from(memoData, 'utf-8'),
    });

    const transaction = new Transaction().add(memoInstruction);
    
    const signature = await sendAndConfirmTransaction(
      this.connection,
      transaction,
      [this.wallet!],
      { commitment: 'confirmed' }
    );

    console.log(`✅ Memo proof created! Signature: ${signature}`);

    const cluster = this.network === 'mainnet-beta' ? '' : `?cluster=${this.network}`;

    return {
      id: req.deliveryId,
      mint: this.wallet!.publicKey.toBase58(),
      tokenAccount: '',
      txHash: signature,
      metadata,
      network: this.network,
      explorerUrl: `https://explorer.solana.com/tx/${signature}${cluster}`,
      mintExplorerUrl: '',
      timestamp,
      status: 'confirmed',
      isRealNFT: false,
    };
  }

  /**
   * Get transaction/NFT details from blockchain
   */
  async getNFT(txSignature: string): Promise<NFTResponse | null> {
    try {
      const tx = await this.connection.getTransaction(txSignature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });

      if (!tx) {
        return null;
      }

      const cluster = this.network === 'mainnet-beta' ? '' : `?cluster=${this.network}`;
      const explorerUrl = `https://explorer.solana.com/tx/${txSignature}${cluster}`;

      // Try to parse memo data from transaction
      let memoData: any = {};
      if (tx.meta?.logMessages) {
        const memoLog = tx.meta.logMessages.find(log => log.includes('Memo'));
        if (memoLog) {
          try {
            const jsonMatch = memoLog.match(/\{.*\}/);
            if (jsonMatch) {
              memoData = JSON.parse(jsonMatch[0]);
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }

      return {
        id: txSignature,
        mint: memoData.mint || '',
        tokenAccount: '',
        txHash: txSignature,
        metadata: {
          name: 'Proof of Presence',
          symbol: 'FLKR-POP',
          deviceId: memoData.user || '',
          latitude: memoData.lat || '',
          longitude: memoData.lng || '',
          timestamp: tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : '',
          verifyHash: memoData.hash || '',
        },
        network: this.network,
        explorerUrl,
        mintExplorerUrl: memoData.mint ? `https://explorer.solana.com/address/${memoData.mint}${cluster}` : '',
        timestamp: tx.blockTime ? new Date(tx.blockTime * 1000) : new Date(),
        status: tx.meta?.err ? 'failed' : 'confirmed',
        isRealNFT: !!memoData.mint,
      };
    } catch (error) {
      console.error('Error fetching NFT:', error);
      return null;
    }
  }

  /**
   * Verify a transaction exists on-chain
   */
  async verifyNFT(txSignature: string): Promise<boolean> {
    try {
      const status = await this.connection.getSignatureStatus(txSignature);
      
      if (!status || !status.value) {
        return false;
      }

      return (
        status.value.confirmationStatus === 'confirmed' ||
        status.value.confirmationStatus === 'finalized'
      );
    } catch (error) {
      console.error('Error verifying NFT:', error);
      return false;
    }
  }

  /**
   * Get recent transaction history for the wallet
   */
  async getTransactionHistory(limit: number = 20): Promise<TransactionRecord[]> {
    if (!this.wallet) {
      throw new Error('Wallet not initialized');
    }

    const signatures = await this.connection.getSignaturesForAddress(
      this.wallet.publicKey,
      { limit }
    );

    return signatures.map((sig) => ({
      signature: sig.signature,
      blockTime: sig.blockTime || null,
      slot: sig.slot,
      fee: 0, // Would need to fetch full tx for fee
      status: sig.err ? 'failed' : 'confirmed',
    }));
  }

  /**
   * Transfer SOL to another address
   */
  async transferSOL(toAddress: string, amountSOL: number): Promise<string> {
    if (!this.initialized || !this.wallet) {
      throw new Error('Wallet not initialized');
    }

    const { SystemProgram, Transaction: SolTransaction } = await import('@solana/web3.js');
    
    const recipient = new PublicKey(toAddress);
    const lamports = amountSOL * LAMPORTS_PER_SOL;

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: this.wallet.publicKey,
        toPubkey: recipient,
        lamports,
      })
    );

    const signature = await sendAndConfirmTransaction(
      this.connection,
      transaction,
      [this.wallet]
    );

    return signature;
  }

  /**
   * Get service status
   */
  getStatus(): {
    initialized: boolean;
    network: string;
    walletAddress: string;
  } {
    return {
      initialized: this.initialized,
      network: this.network,
      walletAddress: this.getWalletAddress(),
    };
  }
}

// Export singleton instance
export const solanaService = new SolanaService();
export default solanaService;
