import { Request, Response } from 'express';
import { SessionKeyService } from '../services/session-key.service';
import { AARegistryService } from '../services/aa-registry.service';

/**
 * Session Key Controller
 * Handles session key registration, listing, and revocation
 */

export class SessionKeyController {
  /**
   * POST /api/session-keys/register
   * Register a new session key for a user
   * Called ONCE when user first connects wallet
   */
  static async registerSessionKey(req: Request, res: Response) {
    try {
      const { userId, smartAccountAddress, config } = req.body;

      // Validate input
      if (!userId || !smartAccountAddress) {
        return res.status(400).json({
          error: 'userId and smartAccountAddress are required',
        });
      }

      // Default config: 10 credits per prompt, 1000 credits total, 7 days validity
      const sessionConfig = {
        maxCreditsPerPrompt: config?.maxCreditsPerPrompt || 10,
        maxTotalSpend: config?.maxTotalSpend || 1000,
        validDuration: config?.validDuration || 7 * 24 * 60 * 60, // 7 days in seconds
      };

      console.log('[SessionKeyController] Registering session key for user:', userId);
      console.log('[SessionKeyController] Smart account:', smartAccountAddress);
      console.log('[SessionKeyController] Config:', sessionConfig);

      // Create and register session key (database + on-chain)
      const result = await AARegistryService.registerWithDatabaseSync(
        userId,
        smartAccountAddress,
        sessionConfig
      );

      console.log('[SessionKeyController] Session key registered successfully');

      return res.status(201).json({
        success: true,
        sessionKey: {
          id: result.sessionKeyId,
          publicKey: result.publicKey,
          expiresAt: result.expiresAt,
          maxCreditsPerPrompt: result.maxCreditsPerPrompt,
          maxTotalSpend: result.maxTotalSpend,
          onChainTxHash: result.onChainTxHash,
        },
        message:
          'Session key registered successfully. You can now use AI features without wallet popups!',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[SessionKeyController] Error registering session key:', error);

      return res.status(500).json({
        error: 'Failed to register session key',
        details: errorMessage,
      });
    }
  }

  /**
   * GET /api/session-keys/list
   * Get all session keys for current user
   */
  static async listSessionKeys(req: Request, res: Response) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const userId = (req as any).user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const sessionKeys = await SessionKeyService.getUserSessionKeys(userId);

      return res.status(200).json({
        success: true,
        sessionKeys: sessionKeys.map((sk) => ({
          id: sk.id,
          publicKey: sk.publicKey,
          smartAccountAddress: sk.smartAccountAddress,
          maxCreditsPerPrompt: sk.maxCreditsPerPrompt,
          maxTotalSpend: sk.maxTotalSpend,
          totalSpent: sk.totalSpent,
          remainingCredits: Number(sk.maxTotalSpend) - Number(sk.totalSpent),
          expiresAt: sk.expiresAt,
          active: sk.active,
          registeredOnChain: sk.registeredOnChain,
          createdAt: sk.createdAt,
          revokedAt: sk.revokedAt,
        })),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[SessionKeyController] Error listing session keys:', error);

      return res.status(500).json({
        error: 'Failed to list session keys',
        details: errorMessage,
      });
    }
  }

  /**
   * GET /api/session-keys/active
   * Get active session key for user's smart account
   */
  static async getActiveSessionKey(req: Request, res: Response) {
    try {
      const { smartAccountAddress } = req.query;

      if (!smartAccountAddress || typeof smartAccountAddress !== 'string') {
        return res.status(400).json({
          error: 'smartAccountAddress is required',
        });
      }

      console.log('[SessionKeyController] Fetching active session key for:', smartAccountAddress);

      const sessionKey = await SessionKeyService.getActiveSessionKey(smartAccountAddress);

      if (!sessionKey) {
        console.log('[SessionKeyController] No active session key found for:', smartAccountAddress);
        // Return 200 with null sessionKey instead of 404 to avoid frontend errors
        return res.status(200).json({
          success: true,
          sessionKey: null,
          message: 'No active session key found',
        });
      }

      console.log('[SessionKeyController] Active session key found:', sessionKey.id);

      return res.status(200).json({
        success: true,
        sessionKey: {
          id: sessionKey.id,
          publicKey: sessionKey.publicKey,
          smartAccountAddress: sessionKey.smartAccountAddress,
          maxCreditsPerPrompt: sessionKey.maxCreditsPerPrompt,
          maxTotalSpend: sessionKey.maxTotalSpend,
          totalSpent: sessionKey.totalSpent,
          remainingCredits: Number(sessionKey.maxTotalSpend) - Number(sessionKey.totalSpent),
          expiresAt: sessionKey.expiresAt,
          active: sessionKey.active,
          onChainTxHash: sessionKey.onChainTxHash,
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[SessionKeyController] Error getting active session key:', error);

      return res.status(500).json({
        error: 'Failed to get active session key',
        details: errorMessage,
      });
    }
  }

  /**
   * POST /api/session-keys/revoke
   * Revoke a session key (both database and on-chain)
   */
  static async revokeSessionKey(req: Request, res: Response) {
    try {
      const { sessionKeyId, smartAccountAddress, sessionKeyAddress } = req.body;

      if (!sessionKeyId || !smartAccountAddress || !sessionKeyAddress) {
        return res.status(400).json({
          error: 'sessionKeyId, smartAccountAddress, and sessionKeyAddress are required',
        });
      }

      console.log('[SessionKeyController] Revoking session key:', sessionKeyId);

      // Revoke in database
      await SessionKeyService.revokeSessionKey(sessionKeyId);

      // Revoke on-chain
      const aaRegistry = new AARegistryService();
      const txHash = await aaRegistry.revokeSessionKey(smartAccountAddress, sessionKeyAddress);

      console.log('[SessionKeyController] Session key revoked successfully');
      console.log('[SessionKeyController] Revocation tx:', txHash);

      return res.status(200).json({
        success: true,
        message: 'Session key revoked successfully',
        revocationTxHash: txHash,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[SessionKeyController] Error revoking session key:', error);

      return res.status(500).json({
        error: 'Failed to revoke session key',
        details: errorMessage,
      });
    }
  }

  /**
   * POST /api/session-keys/cleanup
   * Clean up expired session keys (admin/cron endpoint)
   */
  static async cleanupExpiredKeys(_req: Request, res: Response) {
    try {
      const count = await SessionKeyService.cleanupExpiredKeys();

      return res.status(200).json({
        success: true,
        message: `Deactivated ${count} expired session keys`,
        count,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[SessionKeyController] Error cleaning up session keys:', error);

      return res.status(500).json({
        error: 'Failed to cleanup session keys',
        details: errorMessage,
      });
    }
  }
}
