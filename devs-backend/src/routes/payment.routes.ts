import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { paymentController } from '../controllers/payment.controller';
import { authenticate } from '../middleware/auth';

const router: Router = Router();

// All routes require authentication
router.use(authenticate as any); // eslint-disable-line @typescript-eslint/no-explicit-any

// Process a payment
router.post('/process', asyncHandler(paymentController.processPayment));

// Retry failed payment
router.post('/:contributionId/retry', asyncHandler(paymentController.retryPayment));

// Get contributor earnings
router.get(
  '/contributor/:contributorId/earnings',
  asyncHandler(paymentController.getContributorEarnings)
);

// Get contributor payment history
router.get(
  '/contributor/:contributorId/history',
  asyncHandler(paymentController.getContributorPayments)
);

// Get project payment history
router.get('/project/:projectId/payments', asyncHandler(paymentController.getProjectPayments));

// Get project spending
router.get('/project/:projectId/spending', asyncHandler(paymentController.getProjectSpending));

export default router;
