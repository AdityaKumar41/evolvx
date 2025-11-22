import { inngest } from '../lib/inngest';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { aiBillingService } from '../services/ai-billing.service';

/**
 * AI Billing Workflow
 * Processes AI usage and handles credit deduction or micropayments
 */
export const aiBillingWorkflow = inngest.createFunction(
  {
    id: 'ai-billing',
    name: 'AI Usage Billing Workflow',
    retries: 1,
  },
  { event: 'ai/usage-recorded' },
  async ({ event, step }) => {
    const { userId, projectId, workflow, prSubmissionId } = event.data;

    logger.info(`Processing AI billing for user ${userId}, workflow: ${workflow}`);

    // Step 1: Get latest usage log
    const usageLog = await step.run('fetch-usage-log', async () => {
      const logs = await prisma.aIUsageLog.findMany({
        where: {
          userId,
          projectId: projectId || undefined,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 1,
      });

      if (logs.length === 0) {
        logger.warn(`No usage log found for user ${userId}`);
        return null;
      }

      return logs[0];
    });

    if (!usageLog) {
      logger.info('No usage log to process');
      return { processed: false };
    }

    // Step 2: Get user's billing mode
    const billingInfo = await step.run('get-billing-mode', async () => {
      let billingMode = 'CREDIT'; // default

      if (projectId) {
        const project = await prisma.project.findUnique({
          where: { id: projectId },
          select: { billingMode: true },
        });
        if (project) {
          billingMode = project.billingMode || 'CREDIT';
        }
      }

      return { billingMode };
    });

    // Step 3: Check credit balance
    const creditBalance = await step.run('check-credit-balance', async () => {
      return await aiBillingService.getCreditBalance(userId);
    });

    const cost = Number(usageLog.cost);

    // Step 4: Process billing based on mode and balance
    if (billingInfo.billingMode === 'CREDIT') {
      // Credit mode - try to deduct from credits
      if (creditBalance >= cost) {
        await step.run('deduct-credits', async () => {
          await aiBillingService.deductCredit(userId, cost);
          logger.info(`Deducted ${cost} credits from user ${userId}`);
        });
      } else {
        // Insufficient credits - trigger micropayment
        await step.run('trigger-micropayment', async () => {
          await aiBillingService.triggerMicropayment(userId, projectId, cost);
          logger.info(`Triggered micropayment of $${cost} for user ${userId}`);
        });

        // Notify user
        await step.run('notify-payment-required', async () => {
          await prisma.notification.create({
            data: {
              userId,
              type: 'PAYMENT_SENT', // Reusing type
              title: 'AI Usage Payment Required',
              message: `Your AI credit balance is insufficient. Please add $${cost.toFixed(4)} in credits or complete the micropayment.`,
            },
          });
        });
      }
    } else if (billingInfo.billingMode === 'MICROPAYMENT') {
      // Micropayment mode - always trigger micropayment
      await step.run('trigger-micropayment', async () => {
        await aiBillingService.triggerMicropayment(userId, projectId, cost);
        logger.info(`Triggered micropayment of $${cost} for user ${userId}`);
      });
    } else {
      // Hybrid mode - use credits first, then micropayment
      if (creditBalance >= cost) {
        await step.run('deduct-credits', async () => {
          await aiBillingService.deductCredit(userId, cost);
          logger.info(`Deducted ${cost} credits from user ${userId}`);
        });
      } else if (creditBalance > 0) {
        // Partial credit, partial micropayment
        await step.run('partial-credit-payment', async () => {
          // Deduct available credits
          await aiBillingService.deductCredit(userId, creditBalance);

          // Trigger micropayment for remaining
          const remaining = cost - creditBalance;
          await aiBillingService.triggerMicropayment(userId, projectId, remaining);

          logger.info(
            `Deducted ${creditBalance} credits and triggered micropayment of $${remaining} for user ${userId}`
          );
        });
      } else {
        // No credits - full micropayment
        await step.run('trigger-micropayment', async () => {
          await aiBillingService.triggerMicropayment(userId, projectId, cost);
          logger.info(`Triggered micropayment of $${cost} for user ${userId}`);
        });
      }
    }

    // Step 5: Send billing complete event
    await step.run('emit-billing-complete', async () => {
      await inngest.send({
        name: 'ai/billing-complete',
        data: {
          userId,
          projectId,
          workflow,
          cost,
          prSubmissionId,
          billedAt: new Date().toISOString(),
        },
      });
    });

    return {
      userId,
      workflow,
      cost,
      billingMode: billingInfo.billingMode,
      creditBalance: creditBalance - (creditBalance >= cost ? cost : creditBalance),
      processed: true,
    };
  }
);
