import { Wallet, HDNodeWallet } from 'ethers';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';

/**
 * Session Key Service for Account Abstraction
 * Manages temporary session keys for gasless micropayments
 *
 * Flow:
 * 1. User connects wallet → ONE signature only
 * 2. Backend generates session key pair
 * 3. Encrypts private key and stores in database
 * 4. Registers public key on SessionKeyRegistry contract
 * 5. Session key signs all future UserOperations (NO popups)
 */

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

// Generate or use encryption key
let ENCRYPTION_KEY = process.env.SESSION_KEY_ENCRYPTION_SECRET || '';

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
  // Auto-generate a secure key if not provided
  ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
  console.warn(
    'WARNING: Using auto-generated SESSION_KEY_ENCRYPTION_SECRET. Set this in .env for production!'
  );
  console.warn(`Generated key: ${ENCRYPTION_KEY}`);
}

interface SessionKeyConfig {
  maxCreditsPerPrompt: number; // Max credits per single prompt (e.g., 10)
  maxTotalSpend: number; // Total credits allowed before key expires (e.g., 1000)
  validDuration: number; // Duration in seconds (e.g., 7 days = 604800)
}

interface SessionKeyResult {
  publicKey: string;
  sessionKeyId: string;
  expiresAt: Date;
  maxCreditsPerPrompt: number;
  maxTotalSpend: number;
}

export class SessionKeyService {
  /**
   * Generate a new session key pair
   * @returns Wallet object with public/private key
   */
  static generateSessionKeyPair(): HDNodeWallet {
    return Wallet.createRandom();
  }

  /**
   * Encrypt session key private key for storage
   * @param privateKey - The private key to encrypt
   * @returns Encrypted private key with IV
   */
  static encryptPrivateKey(privateKey: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      ENCRYPTION_ALGORITHM,
      Buffer.from(ENCRYPTION_KEY, 'hex'),
      iv
    );

    let encrypted = cipher.update(privateKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Format: iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypt session key private key
   * @param encryptedData - The encrypted private key with IV
   * @returns Decrypted private key
   */
  static decryptPrivateKey(encryptedData: string): string {
    const [ivHex, authTagHex, encrypted] = encryptedData.split(':');

    const decipher = crypto.createDecipheriv(
      ENCRYPTION_ALGORITHM,
      Buffer.from(ENCRYPTION_KEY, 'hex'),
      Buffer.from(ivHex, 'hex')
    );

    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Create and store a new session key for a user
   * @param userId - User ID from database
   * @param smartAccountAddress - User's smart account address
   * @param config - Session key configuration (limits, expiry)
   * @returns Session key details
   */
  static async createSessionKey(
    userId: string,
    smartAccountAddress: string,
    config: SessionKeyConfig
  ): Promise<SessionKeyResult> {
    // Generate new key pair
    const sessionWallet = this.generateSessionKeyPair();

    // Encrypt private key
    const encryptedPrivateKey = this.encryptPrivateKey(sessionWallet.privateKey);

    // Calculate expiry
    const expiresAt = new Date(Date.now() + config.validDuration * 1000);

    // Store in database
    const sessionKey = await prisma.sessionKey.create({
      data: {
        userId,
        smartAccountAddress: smartAccountAddress.toLowerCase(), // Normalize to lowercase for consistent queries
        publicKey: sessionWallet.address.toLowerCase(),
        encryptedPrivateKey,
        maxCreditsPerPrompt: config.maxCreditsPerPrompt,
        maxTotalSpend: config.maxTotalSpend,
        expiresAt,
        active: true,
        registeredOnChain: false, // Will be set to true after on-chain registration
      },
    });

    return {
      publicKey: sessionKey.publicKey,
      sessionKeyId: sessionKey.id,
      expiresAt: sessionKey.expiresAt,
      maxCreditsPerPrompt: config.maxCreditsPerPrompt,
      maxTotalSpend: config.maxTotalSpend,
    };
  }

  /**
   * Get active session key for a smart account
   * @param smartAccountAddress - Smart account address
   * @returns Active session key or null
   */
  static async getActiveSessionKey(smartAccountAddress: string) {
    const sessionKey = await prisma.sessionKey.findFirst({
      where: {
        smartAccountAddress: smartAccountAddress.toLowerCase(),
        active: true,
        registeredOnChain: true,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return sessionKey;
  }

  /**
   * Get session key wallet (with decrypted private key)
   * @param sessionKeyId - Session key ID from database
   * @returns Wallet object ready to sign UserOperations
   */
  static async getSessionKeyWallet(sessionKeyId: string): Promise<Wallet | null> {
    const sessionKey = await prisma.sessionKey.findUnique({
      where: { id: sessionKeyId },
    });

    if (!sessionKey || !sessionKey.active) {
      return null;
    }

    // Check expiry
    if (sessionKey.expiresAt < new Date()) {
      // Mark as inactive
      await prisma.sessionKey.update({
        where: { id: sessionKeyId },
        data: { active: false },
      });
      return null;
    }

    // Decrypt private key
    const privateKey = this.decryptPrivateKey(sessionKey.encryptedPrivateKey);

    return new Wallet(privateKey);
  }

  /**
   * Get session key wallet by smart account address
   * @param smartAccountAddress - Smart account address
   * @returns Wallet object or null
   */
  static async getSessionKeyWalletByAddress(smartAccountAddress: string): Promise<Wallet | null> {
    const sessionKey = await this.getActiveSessionKey(smartAccountAddress);

    if (!sessionKey) {
      return null;
    }

    const privateKey = this.decryptPrivateKey(sessionKey.encryptedPrivateKey);

    return new Wallet(privateKey);
  }

  /**
   * Mark session key as registered on-chain
   * @param sessionKeyId - Session key ID
   * @param txHash - Transaction hash of registration
   */
  static async markAsRegistered(sessionKeyId: string, txHash: string) {
    await prisma.sessionKey.update({
      where: { id: sessionKeyId },
      data: {
        registeredOnChain: true,
        onChainTxHash: txHash,
      },
    });
  }

  /**
   * Revoke a session key (user-initiated or automatic on compromise)
   * @param sessionKeyId - Session key ID
   */
  static async revokeSessionKey(sessionKeyId: string) {
    await prisma.sessionKey.update({
      where: { id: sessionKeyId },
      data: {
        active: false,
        revokedAt: new Date(),
      },
    });
  }

  /**
   * Update total spent for session key (called after each micropayment)
   * @param sessionKeyId - Session key ID
   * @param creditsUsed - Credits used in this transaction
   */
  static async recordUsage(sessionKeyId: string, creditsUsed: number) {
    const sessionKey = await prisma.sessionKey.findUnique({
      where: { id: sessionKeyId },
    });

    if (!sessionKey) {
      throw new Error('Session key not found');
    }

    const newTotalSpent = Number(sessionKey.totalSpent) + creditsUsed;

    // Check if limit exceeded
    if (newTotalSpent > Number(sessionKey.maxTotalSpend)) {
      // Auto-revoke if limit exceeded
      await this.revokeSessionKey(sessionKeyId);
      throw new Error('Session key spending limit exceeded');
    }

    await prisma.sessionKey.update({
      where: { id: sessionKeyId },
      data: {
        totalSpent: newTotalSpent,
      },
    });
  }

  /**
   * Get all session keys for a user
   * @param userId - User ID
   * @returns Array of session keys
   */
  static async getUserSessionKeys(userId: string) {
    return prisma.sessionKey.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        publicKey: true,
        smartAccountAddress: true,
        maxCreditsPerPrompt: true,
        maxTotalSpend: true,
        totalSpent: true,
        expiresAt: true,
        active: true,
        registeredOnChain: true,
        createdAt: true,
        revokedAt: true,
      },
    });
  }

  /**
   * Cleanup expired session keys (run as cron job)
   */
  static async cleanupExpiredKeys() {
    const result = await prisma.sessionKey.updateMany({
      where: {
        active: true,
        expiresAt: {
          lt: new Date(),
        },
      },
      data: {
        active: false,
        revokedAt: new Date(),
      },
    });

    console.log(`[SessionKeyService] Deactivated ${result.count} expired session keys`);
    return result.count;
  }
}
