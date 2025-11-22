import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { fundingService } from '../services/funding.service';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

export class FundingController {
  /**
   * Get funding quote for a project
   */
  async getFundingQuote(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { projectId } = req.params;
      const { tokenAddress } = req.body;

      const quote = await fundingService.calculateFundingQuote({
        projectId,
        tokenAddress,
      });

      res.json({
        success: true,
        quote,
      });
    } catch (error) {
      logger.error('Error getting funding quote:', error);
      next(error);
    }
  }

  /**
   * Confirm project funding after deposit
   */
  async confirmFunding(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { projectId } = req.params;
      const { depositTxHash, amount, token, mode } = req.body;

      if (!depositTxHash || !amount || !token || !mode) {
        throw new AppError('Missing required fields', 400);
      }

      const result = await fundingService.confirmFunding({
        projectId,
        depositTxHash,
        amount: parseFloat(amount),
        token,
        mode,
      });

      res.json({
        success: true,
        project: result.project,
        fundingRecord: result.fundingRecord,
      });
    } catch (error) {
      logger.error('Error confirming funding:', error);
      next(error);
    }
  }

  /**
   * Add additional funding to project
   */
  async addFunding(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { projectId } = req.params;
      const { depositTxHash, amount, token } = req.body;

      if (!depositTxHash || !amount || !token) {
        throw new AppError('Missing required fields', 400);
      }

      const fundingRecord = await fundingService.addFunding({
        projectId,
        depositTxHash,
        amount: parseFloat(amount),
        token,
      });

      res.json({
        success: true,
        fundingRecord,
      });
    } catch (error) {
      logger.error('Error adding funding:', error);
      next(error);
    }
  }

  /**
   * Get remaining funds for a project
   */
  async getRemainingFunds(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { projectId } = req.params;

      const remaining = await fundingService.getRemainingFunds(projectId);

      res.json({
        success: true,
        ...remaining,
      });
    } catch (error) {
      logger.error('Error getting remaining funds:', error);
      next(error);
    }
  }

  /**
   * Get funding history for a project
   */
  async getFundingHistory(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { projectId } = req.params;

      const history = await fundingService.getFundingHistory(projectId);

      res.json({
        success: true,
        history,
      });
    } catch (error) {
      logger.error('Error getting funding history:', error);
      next(error);
    }
  }
}

export const fundingController = new FundingController();
