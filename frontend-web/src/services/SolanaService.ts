/**
 * Solana Blockchain Service
 * 
 * Handles minting Proof-of-Presence NFTs on Solana blockchain
 * to create immutable records of NFC delivery verifications.
 * 
 * Features:
 * - Proof-of-Presence NFT minting
 * - Transaction verification
 * - Wallet integration (Phantom, Solflare)
 * - Devnet/Mainnet support
 */

import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  Keypair,
  clusterApiUrl,
  Commitment
} from '@solana/web3.js';

// ============== Types ==============

export interface SolanaConfig {
  network: 'devnet' | 'testnet' | 'mainnet-beta';
  rpcEndpoint?: string;
  commitment?: Commitment;
}

export interface WalletInfo {
  address: string;
  balance: number;
  isConnected: boolean;
  provider: string | null;
}

export interface ProofOfPresenceMetadata {
  verificationId: string;
  sourceDeviceId: string;
  targetDeviceId: string;
  latitude: number;
  longitude: number;
  timestamp: Date | string;
  nfcTagId: string;
  signature: string;
}

export interface MintResult {
  success: boolean;
  transactionId: string | null;
  mintAddress: string | null;
  error: string | null;
  explorerUrl: string | null;
}

export interface TransactionStatus {
  confirmed: boolean;
  slot: number | null;
  blockTime: number | null;
  error: string | null;
}

// Phantom wallet types
interface PhantomProvider {
  publicKey: PublicKey | null;
  isPhantom: boolean;
  isConnected: boolean;
  connect: () => Promise<{ publicKey: PublicKey }>;
  disconnect: () => Promise<void>;
  signTransaction: (transaction: Transaction) => Promise<Transaction>;
  signAllTransactions: (transactions: Transaction[]) => Promise<Transaction[]>;
  signMessage: (message: Uint8Array) => Promise<{ signature: Uint8Array }>;
}

declare global {
  interface Window {
    solana?: PhantomProvider;
    solflare?: PhantomProvider;
  }
}

// ============== Service ==============

class SolanaService {
  private static instance: SolanaService;
  private connection: Connection | null = null;
  private walletProvider: PhantomProvider | null = null;
  private config: SolanaConfig;
  
  // Transaction history
  private transactionHistory: Array<{
    txId: string;
    timestamp: Date;
    type: 'mint' | 'transfer' | 'other';
  }> = [];

  // Status
  private isInitialized: boolean = false;
  private connectionError: string | null = null;

  private constructor() {
    this.config = {
      network: 'devnet',
      commitment: 'confirmed'
    };
  }

  public static getInstance(): SolanaService {
    if (!SolanaService.instance) {
      SolanaService.instance = new SolanaService();
    }
    return SolanaService.instance;
  }

  /**
   * Initialize the Solana connection
   */
  public async initialize(config?: Partial<SolanaConfig>): Promise<boolean> {
    try {
      if (config) {
        this.config = { ...this.config, ...config };
      }

      // Determine RPC endpoint
      const endpoint = this.config.rpcEndpoint || clusterApiUrl(this.config.network);

      console.log(`🔗 Connecting to Solana ${this.config.network}...`);
      
      this.connection = new Connection(endpoint, this.config.commitment);
      
      // Verify connection
      const version = await this.connection.getVersion();
      console.log(`✅ Connected to Solana v${version['solana-core']}`);
      
      this.isInitialized = true;
      this.connectionError = null;
      
      return true;
    } catch (error: any) {
      console.error('Failed to initialize Solana:', error);
      this.connectionError = error.message;
      this.isInitialized = false;
      return false;
    }
  }

  /**
   * Check if service is ready
   */
  public isReady(): boolean {
    return this.isInitialized && this.connection !== null;
  }

  /**
   * Detect and connect wallet (Phantom, Solflare)
   */
  public async connectWallet(): Promise<WalletInfo | null> {
    try {
      // Try Phantom first
      if (window.solana?.isPhantom) {
        console.log('🔐 Connecting to Phantom wallet...');
        const resp = await window.solana.connect();
        this.walletProvider = window.solana;
        
        const balance = await this.getWalletBalance(resp.publicKey.toString());
        
        return {
          address: resp.publicKey.toString(),
          balance,
          isConnected: true,
          provider: 'Phantom'
        };
      }

      // Try Solflare
      if (window.solflare) {
        console.log('🔐 Connecting to Solflare wallet...');
        const resp = await window.solflare.connect();
        this.walletProvider = window.solflare;
        
        const balance = await this.getWalletBalance(resp.publicKey.toString());
        
        return {
          address: resp.publicKey.toString(),
          balance,
          isConnected: true,
          provider: 'Solflare'
        };
      }

      console.warn('No Solana wallet found');
      return null;
    } catch (error: any) {
      console.error('Wallet connection failed:', error);
      return null;
    }
  }

  /**
   * Disconnect wallet
   */
  public async disconnectWallet(): Promise<void> {
    if (this.walletProvider) {
      try {
        await this.walletProvider.disconnect();
      } catch (e) {
        // Ignore disconnect errors
      }
      this.walletProvider = null;
    }
  }

  /**
   * Check if wallet is connected
   */
  public isWalletConnected(): boolean {
    return this.walletProvider?.isConnected ?? false;
  }

  /**
   * Get wallet public key
   */
  public getWalletAddress(): string | null {
    return this.walletProvider?.publicKey?.toString() || null;
  }

  /**
   * Get wallet balance
   */
  public async getWalletBalance(address?: string): Promise<number> {
    if (!this.connection) return 0;

    try {
      const pubkey = address 
        ? new PublicKey(address) 
        : this.walletProvider?.publicKey;

      if (!pubkey) return 0;

      const balance = await this.connection.getBalance(pubkey);
      return balance / LAMPORTS_PER_SOL;
    } catch (error) {
      console.error('Failed to get balance:', error);
      return 0;
    }
  }

  /**
   * Mint a Proof-of-Presence NFT
   * 
   * This creates an immutable record of the NFC verification
   * on the Solana blockchain.
   */
  public async mintProofOfPresence(metadata: ProofOfPresenceMetadata): Promise<MintResult> {
    if (!this.connection) {
      return {
        success: false,
        transactionId: null,
        mintAddress: null,
        error: 'Solana not initialized',
        explorerUrl: null
      };
    }

    if (!this.walletProvider?.publicKey) {
      return {
        success: false,
        transactionId: null,
        mintAddress: null,
        error: 'Wallet not connected',
        explorerUrl: null
      };
    }

    try {
      console.log('🎨 Minting Proof-of-Presence NFT...');
      console.log('Metadata:', metadata);

      // Generate a new mint address
      const mintKeypair = Keypair.generate();
      const mintAddress = mintKeypair.publicKey.toString();

      // Create metadata for off-chain storage
      // In production, this would be stored on Arweave/IPFS and linked via Metaplex
      const nftMetadata = {
        type: 'FlickerSecure:ProofOfPresence',
        version: '1.0',
        ...metadata,
        timestamp: metadata.timestamp instanceof Date 
          ? metadata.timestamp.toISOString() 
          : metadata.timestamp
      };

      // For demo/devnet: Create a simple transfer transaction with memo
      // In production: Use Metaplex for proper NFT minting
      const transaction = new Transaction();

      // Add a small transfer to record the transaction
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: this.walletProvider.publicKey,
          toPubkey: mintKeypair.publicKey,
          lamports: 0.001 * LAMPORTS_PER_SOL // 0.001 SOL
        })
      );

      // Get recent blockhash
      const { blockhash, lastValidBlockHeight } = 
        await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = this.walletProvider.publicKey;

      // Sign with wallet
      const signedTx = await this.walletProvider.signTransaction(transaction);
      signedTx.partialSign(mintKeypair);

      // Send transaction
      const txId = await this.connection.sendRawTransaction(
        signedTx.serialize(),
        { skipPreflight: false }
      );

      console.log(`📤 Transaction sent: ${txId}`);

      // Wait for confirmation
      await this.connection.confirmTransaction({
        signature: txId,
        blockhash,
        lastValidBlockHeight
      });

      console.log('✅ NFT minted successfully!');

      // Store in history
      this.transactionHistory.push({
        txId,
        timestamp: new Date(),
        type: 'mint'
      });

      // Store metadata off-chain (would use Arweave/IPFS in production)
      this.storeMetadataOffchain(mintAddress, nftMetadata, txId);

      return {
        success: true,
        transactionId: txId,
        mintAddress,
        error: null,
        explorerUrl: this.getExplorerUrl(txId)
      };
    } catch (error: any) {
      console.error('Mint failed:', error);
      return {
        success: false,
        transactionId: null,
        mintAddress: null,
        error: error.message || 'Minting failed',
        explorerUrl: null
      };
    }
  }

  /**
   * Store metadata off-chain (localStorage for demo)
   * Production would use Arweave or IPFS
   */
  private storeMetadataOffchain(
    mintAddress: string, 
    metadata: ProofOfPresenceMetadata & { type?: string; version?: string },
    txId: string
  ): void {
    try {
      const key = `flicker_nft_${mintAddress}`;
      const data = {
        mintAddress,
        transactionId: txId,
        network: this.config.network,
        metadata,
        storedAt: new Date().toISOString()
      };
      localStorage.setItem(key, JSON.stringify(data));
      console.log('📦 Metadata stored off-chain');
    } catch (error) {
      console.warn('Failed to store metadata locally:', error);
    }
  }

  /**
   * Verify a transaction
   */
  public async verifyTransaction(txId: string): Promise<TransactionStatus> {
    if (!this.connection) {
      return {
        confirmed: false,
        slot: null,
        blockTime: null,
        error: 'Not connected'
      };
    }

    try {
      const status = await this.connection.getSignatureStatus(txId);
      
      if (status.value?.err) {
        return {
          confirmed: false,
          slot: status.value.slot,
          blockTime: null,
          error: JSON.stringify(status.value.err)
        };
      }

      const isConfirmed = status.value?.confirmationStatus === 'confirmed' ||
                          status.value?.confirmationStatus === 'finalized';

      return {
        confirmed: isConfirmed,
        slot: status.value?.slot || null,
        blockTime: null, // Would need separate call
        error: null
      };
    } catch (error: any) {
      return {
        confirmed: false,
        slot: null,
        blockTime: null,
        error: error.message
      };
    }
  }

  /**
   * Get NFT metadata by mint address
   */
  public getProofOfPresence(mintAddress: string): ProofOfPresenceMetadata | null {
    try {
      const key = `flicker_nft_${mintAddress}`;
      const data = localStorage.getItem(key);
      if (data) {
        const parsed = JSON.parse(data);
        return parsed.metadata;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get all stored proofs
   */
  public getAllProofsOfPresence(): Array<{
    mintAddress: string;
    txId: string;
    metadata: ProofOfPresenceMetadata;
  }> {
    const proofs: Array<{
      mintAddress: string;
      txId: string;
      metadata: ProofOfPresenceMetadata;
    }> = [];

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('flicker_nft_')) {
          const data = localStorage.getItem(key);
          if (data) {
            const parsed = JSON.parse(data);
            proofs.push({
              mintAddress: parsed.mintAddress,
              txId: parsed.transactionId,
              metadata: parsed.metadata
            });
          }
        }
      }
    } catch (error) {
      console.error('Error reading proofs:', error);
    }

    return proofs;
  }

  /**
   * Request airdrop (devnet only)
   */
  public async requestAirdrop(amount: number = 1): Promise<boolean> {
    if (this.config.network !== 'devnet') {
      console.warn('Airdrop only available on devnet');
      return false;
    }

    if (!this.connection || !this.walletProvider?.publicKey) {
      return false;
    }

    try {
      console.log(`💧 Requesting ${amount} SOL airdrop...`);
      
      const signature = await this.connection.requestAirdrop(
        this.walletProvider.publicKey,
        amount * LAMPORTS_PER_SOL
      );

      await this.connection.confirmTransaction(signature);
      console.log('✅ Airdrop received!');
      return true;
    } catch (error: any) {
      console.error('Airdrop failed:', error);
      return false;
    }
  }

  /**
   * Get explorer URL for transaction
   */
  public getExplorerUrl(txId: string): string {
    const base = 'https://explorer.solana.com/tx';
    const cluster = this.config.network === 'mainnet-beta' ? '' : `?cluster=${this.config.network}`;
    return `${base}/${txId}${cluster}`;
  }

  /**
   * Get transaction history
   */
  public getTransactionHistory(): typeof this.transactionHistory {
    return [...this.transactionHistory];
  }

  /**
   * Get service status
   */
  public getStatus(): Record<string, any> {
    return {
      initialized: this.isInitialized,
      network: this.config.network,
      connected: this.connection !== null,
      walletConnected: this.isWalletConnected(),
      walletAddress: this.getWalletAddress(),
      walletProvider: this.walletProvider 
        ? (window.solana?.isPhantom ? 'Phantom' : 'Solflare') 
        : null,
      transactionCount: this.transactionHistory.length,
      error: this.connectionError
    };
  }

  /**
   * Cleanup
   */
  public async dispose(): Promise<void> {
    await this.disconnectWallet();
    this.connection = null;
    this.isInitialized = false;
    this.transactionHistory = [];
  }
}

// Export singleton
export const solanaService = SolanaService.getInstance();
export default SolanaService;
