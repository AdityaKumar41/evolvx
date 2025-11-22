import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { paymentService } from '../services/payment.service';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

export class PaymentController {
  /**
   * Process payment for a verified contribution
   */
  async processPayment(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { contributionId, contributorAddress, proofHash, gaslessSignature } = req.body;

      if (!contributionId || !contributorAddress) {
        throw new AppError('Missing required fields', 400);
      }

      const result = await paymentService.processPayment({
        contributionId,
        contributorAddress,
        proofHash,
        gaslessSignature,
      });

      res.json({
        success: true,
        payment: result,
      });
    } catch (error) {
      logger.error('Error processing payment:', error);
      next(error);
    }
  }

  /**
   * Retry failed payment
   */
  async retryPayment(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { contributionId } = req.params;

      const result = await paymentService.retryPayment(contributionId);

      res.json({
        success: true,
        payment: result,
      });
    } catch (error) {
      logger.error('Error retrying payment:', error);
      next(error);
    }
  }

  /**
   * Get contributor earnings
   */
  async getContributorEarnings(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { contributorId } = req.params;

      const earnings = await paymentService.getContributorEarnings(contributorId);

      res.json({
        success: true,
        ...earnings,
      });
    } catch (error) {
      logger.error('Error getting contributor earnings:', error);
      next(error);
    }
  }

  /**
   * Get contributor payment history
   */
  async getContributorPayments(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { contributorId } = req.params;

      const payments = await paymentService.getContributorPayments(contributorId);

      res.json({
        success: true,
        payments,
      });
    } catch (error) {
      logger.error('Error getting contributor payments:', error);
      next(error);
    }
  }

  /**
   * Get project payments
   */
  async getProjectPayments(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { projectId } = req.params;

      const payments = await paymentService.getProjectPayments(projectId);

      res.json({
        success: true,
        payments,
      });
    } catch (error) {
      logger.error('Error getting project payments:', error);
      next(error);
    }
  }

  /**
   * Get project spending
   */
  async getProjectSpending(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { projectId } = req.params;

      const spending = await paymentService.getProjectSpending(projectId);

      res.json({
        success: true,
        ...spending,
      });
    } catch (error) {
      logger.error('Error getting project spending:', error);
      next(error);
    }
  }
}

export const paymentController = new PaymentController();
