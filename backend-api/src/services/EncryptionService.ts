import crypto from 'crypto';
import CryptoJS from 'crypto-js';

export class EncryptionService {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly KEY_LENGTH = 32; // 256 bits
  
  /**
   * Generate a key pair for ECDH key exchange
   */
  static generateKeyPair(): { publicKey: string; privateKey: string } {
    const ecdh = crypto.createECDH('prime256v1');
    ecdh.generateKeys();
    
    return {
      publicKey: ecdh.getPublicKey('base64'),
      privateKey: ecdh.getPrivateKey('base64')
    };
  }
  
  /**
   * Derive shared secret using ECDH
   */
  static deriveSharedSecret(privateKey: string, otherPublicKey: string): string {
    const ecdh = crypto.createECDH('prime256v1');
    ecdh.setPrivateKey(privateKey, 'base64');
    
    return ecdh.computeSecret(otherPublicKey, 'base64').toString('base64');
  }
  
  /**
   * Encrypt data with AES-GCM
   */
  static encryptData(data: string, key: string): { 
    encrypted: string; 
    iv: string; 
    tag: string 
  } {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.ALGORITHM, 
      Buffer.from(key, 'base64').slice(0, this.KEY_LENGTH), 
      iv);
    
    let encrypted = cipher.update(data, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    const tag = cipher.getAuthTag();
    
    return {
      encrypted,
      iv: iv.toString('base64'),
      tag: tag.toString('base64')
    };
  }
  
  /**
   * Decrypt data with AES-GCM
   */
  static decryptData(encrypted: string, key: string, iv: string, tag: string): string {
    const decipher = crypto.createDecipheriv(this.ALGORITHM,
      Buffer.from(key, 'base64').slice(0, this.KEY_LENGTH),
      Buffer.from(iv, 'base64'));
    
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
  
  /**
   * Generate Light-ID pattern for LED signaling
   */
  static generateLightID(pattern: string): { 
    frequency: number; 
    sequence: number[]; 
    duration: number 
  } {
    // Convert pattern to binary sequence
    const binarySequence = pattern.split('').map(char => 
      char === '1' ? 1 : 0
    );
    
    return {
      frequency: 2000, // Hz
      sequence: binarySequence,
      duration: binarySequence.length * 500 // milliseconds
    };
  }
  
  /**
   * Hash data for verification
   */
  static sha256(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }
}
