import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { calculatePromptCost, getMicropaymentHistory } from '../services/micropayment.service.js';

/**
 * Calculate cost for an AI prompt
 */
export const calculateCost = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { promptText, estimatedTokens } = req.body;

    if (!promptText) {
      res.status(400).json({ error: 'Prompt text is required' });
      return;
    }

    const costCalculation = calculatePromptCost(promptText, estimatedTokens);

    res.json({
      success: true,
      cost: costCalculation,
    });
  } catch (error) {
    console.error('Error calculating cost:', error);
    res.status(500).json({ error: 'Failed to calculate cost' });
  }
};

/**
 * Get micropayment history
 */
export const getHistory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;

    const micropayments = await getMicropaymentHistory(userId, limit);

    res.json({
      success: true,
      micropayments,
    });
  } catch (error) {
    console.error('Error getting history:', error);
    res.status(500).json({ error: 'Failed to get history' });
  }
};
