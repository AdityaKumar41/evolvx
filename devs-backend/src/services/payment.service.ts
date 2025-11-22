import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { notificationService } from './notification.service';
import { publishEvent, KAFKA_TOPICS } from '../lib/kafka';
import { ContributionStatus, PaymentMode } from '@prisma/client';

export interface PaymentRequest {
  contributionId: string;
  contributorAddress: string;
  proofHash?: string;
  gaslessSignature?: string;
}

export interface PaymentResult {
  contributionId: string;
  txHash: string;
  amount: number;
  token: string;
  status: ContributionStatus;
}

export class PaymentService {
  /**
   * Process payment for a verified contribution
   */
  async processPayment(request: PaymentRequest): Promise<PaymentResult> {
    try {
      // Get contribution details
      const contribution = await prisma.contribution.findUnique({
        where: { id: request.contributionId },
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
            include: {
              wallets: true,
            },
          },
        },
      });

      if (!contribution) {
        throw new Error('Contribution not found');
      }

      if (contribution.status !== 'VERIFIED') {
        throw new Error(
          `Contribution must be verified before payment. Current status: ${contribution.status}`
        );
      }

      if (!contribution.subMilestone) {
        throw new Error('SubMilestone not found in contribution');
      }
      const project = contribution.subMilestone.milestone.project;

      if (!project.onchainContractAddress) {
        throw new Error('Project contract address not set');
      }

      // Calculate payment amount (checkpoint amount)
      const paymentAmount = Number(contribution.subMilestone?.checkpointAmount || 0);

      // Determine payment mode
      const paymentMode = project.paymentMode || PaymentMode.ESCROW;

      let txHash: string;

      if (paymentMode === PaymentMode.ESCROW) {
        // Escrow mode: Direct payment from escrow contract
        txHash = await this.processEscrowPayment({
          contractAddress: project.onchainContractAddress,
          recipientAddress: request.contributorAddress,
          amount: paymentAmount,
          token: project.tokenAddress || 'USDC',
          proofHash: request.proofHash,
        });
      } else if (paymentMode === PaymentMode.YIELD) {
        // Yield mode: Payment comes from yield pool
        txHash = await this.processEscrowPayment({
          contractAddress: project.onchainContractAddress,
          recipientAddress: request.contributorAddress,
          amount: paymentAmount,
          token: project.tokenAddress || 'USDC',
          proofHash: request.proofHash,
        });
      } else {
        throw new Error(`Unsupported payment mode: ${paymentMode}`);
      }

      // Update contribution status
      await prisma.contribution.update({
        where: { id: request.contributionId },
        data: {
          status: ContributionStatus.PAID,
          paymentTxHash: txHash,
          amountPaid: paymentAmount,
          paidAt: new Date(),
        },
      });

      // Emit payment event to Kafka
      await publishEvent(KAFKA_TOPICS.PAYMENT_COMPLETED, {
        contributionId: request.contributionId,
        contributorId: contribution.contributorId,
        projectId: project.id,
        amount: paymentAmount,
        token: project.tokenAddress || 'USDC',
        txHash,
        mode: paymentMode,
      });

      // Send notification to contributor
      await notificationService.sendPaymentNotification(contribution.contributorId, {
        projectName: project.title,
        taskDescription: contribution.subMilestone?.description || 'Task',
        amount: paymentAmount,
        token: project.tokenAddress || 'USDC',
        txHash,
      });

      logger.info(`Payment processed for contribution ${request.contributionId}: tx ${txHash}`);

      return {
        contributionId: request.contributionId,
        txHash,
        amount: paymentAmount,
        token: project.tokenAddress || 'USDC',
        status: ContributionStatus.PAID,
      };
    } catch (error) {
      logger.error('Error processing payment:', error);
      throw error;
    }
  }

  /**
   * Process escrow payment (direct from contract)
   */
  private async processEscrowPayment(data: {
    contractAddress: string;
    recipientAddress: string;
    amount: number;
    token: string;
    proofHash?: string;
  }): Promise<string> {
    try {
      // In production, call smart contract's releasePayment function
      // For now, mock the transaction
      logger.info(
        `Processing escrow payment: ${data.amount} ${data.token} to ${data.recipientAddress}`
      );

      // Mock transaction hash
      const txHash = `0x${Math.random().toString(16).substring(2)}`;

      // Simulate blockchain delay
      await new Promise((resolve) => setTimeout(resolve, 1000));

      logger.info(`Escrow payment completed: ${txHash}`);
      return txHash;
    } catch (error) {
      logger.error('Error processing escrow payment:', error);
      throw error;
    }
  }

  /**
   * Process gasless payment (meta-transaction)
   */
  // Future feature: Gasless meta-transactions
  // @ts-expect-error - Future feature, currently unused but kept for future implementation
  private async processGaslessPayment(data: {
    contractAddress: string;
    recipientAddress: string;
    amount: number;
    token: string;
    signature: string;
  }): Promise<string> {
    try {
      // In production, submit meta-transaction via relayer
      logger.info(
        `Processing gasless payment: ${data.amount} ${data.token} to ${data.recipientAddress}`
      );

      // Mock transaction hash
      const txHash = `0x${Math.random().toString(16).substring(2)}`;

      // Simulate blockchain delay
      await new Promise((resolve) => setTimeout(resolve, 1000));

      logger.info(`Gasless payment completed: ${txHash}`);
      return txHash;
    } catch (error) {
      logger.error('Error processing gasless payment:', error);
      throw error;
    }
  }

  /**
   * Get payment history for a contributor
   */
  async getContributorPayments(contributorId: string) {
    try {
      const payments = await prisma.contribution.findMany({
        where: {
          contributorId,
          status: ContributionStatus.PAID,
        },
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
        },
        orderBy: {
          paidAt: 'desc',
        },
      });

      return payments.map((payment) => ({
        contributionId: payment.id,
        projectName: payment.subMilestone.milestone.project.title,
        subMilestoneName: payment.subMilestone.description,
        amount: Number(payment.amountPaid),
        token: payment.subMilestone.milestone.project.tokenAddress || 'USDC',
        txHash: payment.paymentTxHash,
        paidAt: payment.paidAt,
      }));
    } catch (error) {
      logger.error('Error getting contributor payments:', error);
      throw new Error('Failed to fetch payment history');
    }
  }

  /**
   * Get payment history for a project
   */
  async getProjectPayments(projectId: string) {
    try {
      const payments = await prisma.contribution.findMany({
        where: {
          subMilestone: {
            milestone: {
              projectId,
            },
          },
          status: ContributionStatus.PAID,
        },
        include: {
          contributor: true,
          subMilestone: {
            include: {
              milestone: true,
            },
          },
        },
        orderBy: {
          paidAt: 'desc',
        },
      });

      return payments.map((payment) => ({
        contributionId: payment.id,
        contributorName: payment.contributor.githubUsername,
        contributorEmail: payment.contributor.email,
        subMilestoneName: payment.subMilestone.description,
        milestoneName: payment.subMilestone.milestone.title,
        amount: Number(payment.amountPaid),
        txHash: payment.paymentTxHash,
        paidAt: payment.paidAt,
      }));
    } catch (error) {
      logger.error('Error getting project payments:', error);
      throw new Error('Failed to fetch project payments');
    }
  }

  /**
   * Retry failed payment
   */
  async retryPayment(contributionId: string): Promise<PaymentResult> {
    try {
      const contribution = await prisma.contribution.findUnique({
        where: { id: contributionId },
        include: {
          contributor: {
            include: {
              wallets: true,
            },
          },
        },
      });

      if (!contribution) {
        throw new Error('Contribution not found');
      }

      if (contribution.status === ContributionStatus.PAID) {
        throw new Error('Payment already completed');
      }

      const primaryWallet =
        contribution.contributor.wallets.find((w) => w.isPrimary) ||
        contribution.contributor.wallets[0];

      if (!primaryWallet?.walletAddress) {
        throw new Error('Contributor wallet address not set');
      }

      // Retry payment
      return await this.processPayment({
        contributionId,
        contributorAddress: primaryWallet.walletAddress,
      });
    } catch (error) {
      logger.error('Error retrying payment:', error);
      throw error;
    }
  }

  /**
   * Get total earnings for a contributor
   */
  async getContributorEarnings(contributorId: string) {
    try {
      const result = await prisma.contribution.aggregate({
        where: {
          contributorId,
          status: ContributionStatus.PAID,
        },
        _sum: {
          amountPaid: true,
        },
        _count: {
          id: true,
        },
      });

      return {
        totalEarnings: Number(result._sum.amountPaid || 0),
        paymentCount: result._count.id,
      };
    } catch (error) {
      logger.error('Error getting contributor earnings:', error);
      throw new Error('Failed to calculate earnings');
    }
  }

  /**
   * Get total spent for a project
   */
  async getProjectSpending(projectId: string) {
    try {
      const result = await prisma.contribution.aggregate({
        where: {
          subMilestone: {
            milestone: {
              projectId,
            },
          },
          status: ContributionStatus.PAID,
        },
        _sum: {
          amountPaid: true,
        },
        _count: {
          id: true,
        },
      });

      return {
        totalSpent: Number(result._sum.amountPaid || 0),
        paymentCount: result._count.id,
      };
    } catch (error) {
      logger.error('Error getting project spending:', error);
      throw new Error('Failed to calculate spending');
    }
  }
}

export const paymentService = new PaymentService();
