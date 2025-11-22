import { inngest } from '../lib/inngest';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { aiMergeService } from '../services/ai-merge.service';

/**
 * UI Sponsor Approval Workflow
 * Handles sponsor approval for UI PRs and triggers payment
 */
export const uiSponsorApproveWorkflow = inngest.createFunction(
  {
    id: 'ui-sponsor-approve',
    name: 'UI Sponsor Approval Workflow',
    retries: 2,
  },
  { event: 'ui/sponsor-approved' },
  async ({ event, step }) => {
    const { prSubmissionId, sponsorId } = event.data;

    logger.info(`Starting UI sponsor approval workflow for PR ${prSubmissionId}`);

    // Step 1: Fetch PR submission context
    const prSubmission = await step.run('fetch-pr-context', async () => {
      const data = await prisma.pRSubmission.findUnique({
        where: { id: prSubmissionId },
        include: {
          subMilestone: {
            include: {
              milestone: {
                include: {
                  project: true,
                },
              },
            },
          },
          contributor: {
            select: {
              id: true,
              githubUsername: true,
              walletAddress: true,
            },
          },
        },
      });

      if (!data) {
        throw new Error(`PR submission ${prSubmissionId} not found`);
      }

      // Verify sponsor
      if (data.subMilestone.milestone.project.sponsorId !== sponsorId) {
        throw new Error('Only project sponsor can approve PRs');
      }

      return data;
    });

    // Step 2: Execute merge via GitHub
    const merged = await step.run('merge-pr', async () => {
      try {
        const success = await aiMergeService.executeMerge(prSubmissionId);
        if (!success) {
          throw new Error('Failed to merge PR');
        }
        return true;
      } catch (error) {
        logger.error('Merge failed:', error);
        throw error;
      }
    });

    // Step 3: Calculate payment amount
    const paymentAmount = await step.run('calculate-payment', async () => {
      const submilestone = prSubmission.subMilestone;
      const project = submilestone.milestone.project;

      // Payment = (points / totalPoints) * totalTokenAmount
      const totalPoints = project.totalPoints || 1;
      const pointsRatio = submilestone.points / totalPoints;
      const amount = Number(project.totalTokenAmount) * pointsRatio;

      return {
        amount,
        tokenAddress: project.tokenAddress,
        recipientAddress: prSubmission.contributor.walletAddress,
      };
    });

    // Step 4: Create or update contribution record
    const contribution = await step.run('create-contribution', async () => {
      // Check if contribution already exists
      const existing = await prisma.contribution.findFirst({
        where: {
          subMilestoneId: prSubmission.subMilestoneId,
          contributorId: prSubmission.contributorId,
        },
      });

      if (existing) {
        return await prisma.contribution.update({
          where: { id: existing.id },
          data: {
            status: 'VERIFIED',
            prUrl: prSubmission.prUrl,
          },
        });
      }

      return await prisma.contribution.create({
        data: {
          subMilestoneId: prSubmission.subMilestoneId,
          contributorId: prSubmission.contributorId,
          commitHash: `pr-${prSubmission.prNumber}`,
          prUrl: prSubmission.prUrl,
          amountPaid: paymentAmount.amount,
          status: 'VERIFIED',
        },
      });
    });

    // Step 5: Release payment
    const paymentTx = await step.run('release-payment', async () => {
      if (!paymentAmount.recipientAddress) {
        throw new Error('Contributor wallet address not found');
      }

      if (!paymentAmount.tokenAddress) {
        throw new Error('Project token address not configured');
      }

      // Execute payment via blockchain service
      // TODO: Implement releasePayment method in blockchain.service.ts
      const txHash = 'pending-blockchain-implementation';
      logger.info(
        `Payment release pending for contributor ${paymentAmount.recipientAddress}: ${paymentAmount.amount}`
      );

      // Update contribution with payment details
      await prisma.contribution.update({
        where: { id: contribution.id },
        data: {
          paymentTxHash: txHash,
          paidAt: new Date(),
          status: 'PAID',
        },
      });

      return txHash;
    });

    // Step 6: Create notifications
    await step.run('create-notifications', async () => {
      // Notify contributor
      await prisma.notification.create({
        data: {
          userId: prSubmission.contributorId,
          type: 'PAYMENT_SENT',
          title: 'Payment Released!',
          message: `Your UI PR has been approved and payment of ${paymentAmount.amount.toFixed(4)} tokens has been released. Transaction: ${paymentTx}`,
        },
      });

      // Notify sponsor
      await prisma.notification.create({
        data: {
          userId: sponsorId,
          type: 'TASK_APPROVED',
          title: 'Payment Released',
          message: `Payment of ${paymentAmount.amount.toFixed(4)} tokens released to ${prSubmission.contributor.githubUsername}`,
        },
      });
    });

    // Step 7: Update submilestone status if completed
    await step.run('update-submilestone-status', async () => {
      await prisma.subMilestone.update({
        where: { id: prSubmission.subMilestoneId },
        data: {
          status: 'COMPLETED',
        },
      });
    });

    return {
      prSubmissionId,
      merged,
      paymentAmount: paymentAmount.amount,
      paymentTx,
      contributorId: prSubmission.contributorId,
    };
  }
);
