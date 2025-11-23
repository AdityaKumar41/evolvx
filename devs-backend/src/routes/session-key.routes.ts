import { Router } from 'express';
import { SessionKeyController } from '../controllers/session-key.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

/**
 * Session Key Routes
 * Manages Account Abstraction session keys for gasless micropayments
 */

/**
 * POST /api/session-keys/register
 * Register a new session key (called once when wallet connects)
 * Public endpoint - requires userId and smartAccountAddress in body
 */
router.post('/register', SessionKeyController.registerSessionKey);

/**
 * GET /api/session-keys/list
 * Get all session keys for current user
 * Requires authentication
 */
router.get('/list', authenticate as any, SessionKeyController.listSessionKeys);

/**
 * GET /api/session-keys/active
 * Get active session key for a smart account
 * Public endpoint - requires smartAccountAddress query param
 */
router.get('/active', SessionKeyController.getActiveSessionKey);

/**
 * POST /api/session-keys/revoke
 * Revoke a session key (both database and on-chain)
 * Requires authentication
 */
router.post('/revoke', authenticate as any, SessionKeyController.revokeSessionKey);

/**
 * POST /api/session-keys/cleanup
 * Cleanup expired session keys (admin/cron endpoint)
 * TODO: Add admin authentication
 */
router.post('/cleanup', SessionKeyController.cleanupExpiredKeys);

export default router;
