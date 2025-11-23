import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { aiBillingService } from '../services/ai-billing.service';

const router: Router = Router();

// Get AI usage logs for a user
router.get(
  '/usage',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  asyncHandler(async (req, res) => {
    const userId = (req as any).user.id; // eslint-disable-line @typescript-eslint/no-explicit-any
    const { projectId, startDate, endDate } = req.query;

    const logs = await aiBillingService.getUsageLog(userId, {
      projectId: projectId as string | undefined,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
    });

    res.json({ logs });
  })
);

// Get usage summary
router.get(
  '/usage/summary',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  asyncHandler(async (req, res) => {
    const userId = (req as any).user.id; // eslint-disable-line @typescript-eslint/no-explicit-any
    const { projectId } = req.query;

    const summary = await aiBillingService.getUsageSummary(userId, projectId as string | undefined);

    res.json(summary);
  })
);

// ===== OLD CREDIT BALANCE ROUTES (DEPRECATED - Now using micropayments) =====
// Get credit balance
// router.get(
//   '/credits/balance',
//   authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
//   asyncHandler(async (req, res) => {
//     const userId = (req as any).user.id; // eslint-disable-line @typescript-eslint/no-explicit-any
//     const balance = await aiBillingService.getCreditBalance(userId);
//     res.json({ balance });
//   })
// );

// Add credits (admin/payment webhook)
// router.post(
//   '/credits/add',
//   authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
//   asyncHandler(async (req, res) => {
//     const userId = (req as any).user.id; // eslint-disable-line @typescript-eslint/no-explicit-any
//     const { amount } = req.body;
//     if (!amount || amount <= 0) {
//       throw new AppError('Valid amount is required', 400);
//     }
//     const newBalance = await aiBillingService.addCredit(userId, amount);
//     res.json({
//       message: 'Credits added successfully',
//       balance: newBalance,
//     });
//   })
// );

// Deduct credits (internal use)
// router.post(
//   '/credits/deduct',
//   authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
//   asyncHandler(async (req, res) => {
//     const userId = (req as any).user.id; // eslint-disable-line @typescript-eslint/no-explicit-any
//     const { amount } = req.body;
//     if (!amount || amount <= 0) {
//       throw new AppError('Valid amount is required', 400);
//     }
//     const newBalance = await aiBillingService.deductCredit(userId, amount);
//     res.json({
//       message: 'Credits deducted successfully',
//       balance: newBalance,
//     });
//   })
// );
// ===== END OF DEPRECATED CREDIT ROUTES =====

// Trigger micropayment
router.post(
  '/micropayment/trigger',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  asyncHandler(async (req, res) => {
    const userId = (req as any).user.id; // eslint-disable-line @typescript-eslint/no-explicit-any
    const { amount, projectId } = req.body;

    if (!amount || amount <= 0) {
      throw new AppError('Valid amount is required', 400);
    }

    await aiBillingService.triggerMicropayment(userId, projectId || null, amount);

    res.json({
      message: 'Micropayment notification sent',
      amount,
    });
  })
);

// Get AI model pricing
router.get(
  '/models/pricing',
  asyncHandler(async (_req, res) => {
    const pricing = {
      models: [
        {
          id: 'gpt-4',
          name: 'GPT-4',
          provider: 'OpenAI',
          inputCostPer1K: 0.03,
          outputCostPer1K: 0.06,
          available: true,
        },
        {
          id: 'gpt-4-turbo',
          name: 'GPT-4 Turbo',
          provider: 'OpenAI',
          inputCostPer1K: 0.01,
          outputCostPer1K: 0.03,
          available: true,
        },
        {
          id: 'claude-3-opus',
          name: 'Claude 3 Opus',
          provider: 'Anthropic',
          inputCostPer1K: 0.015,
          outputCostPer1K: 0.075,
          available: true,
        },
        {
          id: 'claude-3-sonnet',
          name: 'Claude 3 Sonnet',
          provider: 'Anthropic',
          inputCostPer1K: 0.003,
          outputCostPer1K: 0.015,
          available: true,
        },
        {
          id: 'openrouter-auto',
          name: 'OpenRouter (Auto)',
          provider: 'OpenRouter',
          inputCostPer1K: 0.0,
          outputCostPer1K: 0.0,
          available: true,
          note: 'Free tier available',
        },
        {
          id: 'llama-3-70b',
          name: 'LLaMA 3 70B',
          provider: 'Meta',
          inputCostPer1K: 0.0008,
          outputCostPer1K: 0.0008,
          available: false,
          note: 'Coming soon',
        },
      ],
    };

    res.json(pricing);
  })
);

export default router;
