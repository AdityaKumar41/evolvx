import { inngest } from '../lib/inngest';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
// import { aiBillingService } from '../services/ai-billing.service'; // Deprecated - now using micropayments

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

    // Step 2: Get user's billing mode (now always micropayment)
    const billingInfo = await step.run('get-billing-mode', async () => {
      // All billing is now pay-per-use via micropayments
      return { billingMode: 'MICROPAYMENT' };
    });

    // Step 3: Process micropayment (NO credit balance check)
    // Micropayments are handled in real-time via AA UserOperations

    const cost = Number(usageLog.cost);

    // Step 4: Log micropayment (payment already processed via UserOperation)
    await step.run('log-micropayment', async () => {
      logger.info(`Micropayment of ${cost} credits processed for user ${userId} via AA UserOp`);
    });

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
      processed: true,
    };
  }
);
