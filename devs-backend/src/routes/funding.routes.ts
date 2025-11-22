import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { fundingController } from '../controllers/funding.controller';
import { authenticate } from '../middleware/auth';

const router: Router = Router();

// All routes require authentication
router.use(authenticate as any); // eslint-disable-line @typescript-eslint/no-explicit-any

// Get funding quote for a project
router.post('/:projectId/quote', asyncHandler(fundingController.getFundingQuote));

// Confirm project funding after deposit
router.post('/:projectId/confirm', asyncHandler(fundingController.confirmFunding));

// Add additional funding to project
router.post('/:projectId/add-funds', asyncHandler(fundingController.addFunding));

// Get remaining funds for a project
router.get('/:projectId/remaining', asyncHandler(fundingController.getRemainingFunds));

// Get funding history for a project
router.get('/:projectId/history', asyncHandler(fundingController.getFundingHistory));

export default router;
