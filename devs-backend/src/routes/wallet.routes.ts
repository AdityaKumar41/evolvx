import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { WalletController } from '../controllers/wallet.controller';

const router: Router = Router();

/**
 * @route   POST /api/wallet/create-smart-account
 * @desc    Create a new smart account via RootManager (gasless, Web2-like)
 * @access  Private
 */
router.post(
  '/create-smart-account',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  asyncHandler(WalletController.createSmartAccount)
);

/**
 * @route   POST /api/wallet/execute-transaction
 * @desc    Execute a gasless transaction via bundler/paymaster
 * @access  Private
 */
router.post(
  '/execute-transaction',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  asyncHandler(WalletController.executeGaslessTransaction)
);

/**
 * @route   POST /api/wallet/register-smart-account
 * @desc    Register smart account address for the authenticated user
 * @access  Private
 */
router.post(
  '/register-smart-account',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  asyncHandler(WalletController.registerSmartAccount)
);

/**
 * @route   GET /api/wallet/smart-account-info
 * @desc    Get smart account information for the authenticated user
 * @access  Private
 */
router.get(
  '/smart-account-info',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  asyncHandler(WalletController.getSmartAccountInfo)
);

/**
 * @route   GET /api/wallet/credit-balance
 * @desc    Get current credit balance (DEPRECATED - returns 0)
 * @access  Private
 */
router.get(
  '/credit-balance',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  asyncHandler(WalletController.getCreditBalance)
);

/**
 * @route   POST /api/wallet/register-session-key
 * @desc    Register a new session key for temporary spending permissions
 * @access  Private
 */
router.post(
  '/register-session-key',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  asyncHandler(WalletController.registerSessionKey)
);

export default router;
