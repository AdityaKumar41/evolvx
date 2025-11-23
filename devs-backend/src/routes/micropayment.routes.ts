import { Router } from 'express';
import { calculateCost, getHistory } from '../controllers/micropayment.controller.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// All micropayment routes require authentication
router.use(authenticate as any); // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * @route   POST /api/micropayment/calculate-cost
 * @desc    Calculate cost for an AI prompt
 * @access  Private
 */
router.post('/calculate-cost', calculateCost as any); // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * @route   GET /api/micropayment/history
 * @desc    Get micropayment history (AI usage payments)
 * @access  Private
 */
router.get('/history', getHistory as any); // eslint-disable-line @typescript-eslint/no-explicit-any

export default router;
