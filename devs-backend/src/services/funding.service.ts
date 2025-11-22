import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { blockchainService } from './blockchain.service';
import { PaymentMode } from '@prisma/client';
import { notificationService } from './notification.service';
import { publishEvent, KAFKA_TOPICS } from '../lib/kafka';

export interface FundingQuoteRequest {
  projectId: string;
  tokenAddress?: string;
}

export interface FundingQuote {
  projectId: string;
  totalPoints: number;
  pointToUSDCRate: number;
  totalUSDC: number;
  tokenAddress: string;
  tokenSymbol: string;
  tokenPrice: number;
  requiredTokenAmount: number;
  contractAddress: string;
  timestamp: Date;
}

export class FundingService {
  // Configuration
  private readonly POINT_TO_USDC_RATE = 10; // 1 point = 10 USDC (configurable)

  /**
   * Calculate funding quote for a project
   */
  async calculateFundingQuote(request: FundingQuoteRequest): Promise<FundingQuote> {
    try {
      const project = await prisma.project.findUnique({
        where: { id: request.projectId },
        include: {
          milestones: {
            include: {
              subMilestones: true,
            },
          },
        },
      });

      if (!project) {
        throw new Error('Project not found');
      }

      // Calculate total points from submilestones
      let totalPoints = 0;
      for (const milestone of project.milestones) {
        for (const subMilestone of milestone.subMilestones) {
          totalPoints += subMilestone.points; // Use points field, not checkpointAmount
        }
      }

      if (totalPoints === 0) {
        throw new Error('Project has no sub-milestones with points assigned');
      }

      // Update project with calculated total points
      await prisma.project.update({
        where: { id: request.projectId },
        data: { totalPoints },
      });

      // Calculate USDC equivalent
      const totalUSDC = totalPoints * this.POINT_TO_USDC_RATE;

      // Get token price (mock for now, in production use oracle)
      const tokenAddress = request.tokenAddress || project.tokenAddress || 'USDC';
      const tokenPrice = await this.getTokenPrice(tokenAddress);
      const tokenSymbol = await this.getTokenSymbol(tokenAddress);

      // Calculate required token amount
      const requiredTokenAmount = totalUSDC / tokenPrice;

      // Get contract address
      const contractAddress = await this.getEscrowContractAddress();

      const quote: FundingQuote = {
        projectId: request.projectId,
        totalPoints,
        pointToUSDCRate: this.POINT_TO_USDC_RATE,
        totalUSDC,
        tokenAddress,
        tokenSymbol,
        tokenPrice,
        requiredTokenAmount,
        contractAddress,
        timestamp: new Date(),
      };

      logger.info(
        `Funding quote calculated for project ${request.projectId}: ${requiredTokenAmount} ${tokenSymbol}`
      );
      return quote;
    } catch (error) {
      logger.error('Error calculating funding quote:', error);
      throw error;
    }
  }

  /**
   * Confirm project funding after deposit
   */
  async confirmFunding(data: {
    projectId: string;
    depositTxHash: string;
    amount: number;
    token: string;
    mode: PaymentMode;
  }) {
    try {
      // Verify transaction on blockchain
      const txConfirmed = await blockchainService.verifyTransaction(data.depositTxHash);

      if (!txConfirmed) {
        throw new Error('Transaction not confirmed on blockchain');
      }

      // Get token price for oracle rate
      const tokenPrice = await this.getTokenPrice(data.token);

      // Update project and create funding record
      const [project, fundingRecord] = await prisma.$transaction([
        prisma.project.update({
          where: { id: data.projectId },
          data: {
            status: 'ACTIVE',
            totalTokenAmount: data.amount,
            onchainContractAddress: data.token,
            paymentMode: data.mode,
          },
        }),
        prisma.fundingRecord.create({
          data: {
            projectId: data.projectId,
            amount: data.amount,
            token: data.token,
            mode: data.mode,
            depositTxHash: data.depositTxHash,
            oracleRate: tokenPrice,
          },
        }),
      ]);

      // Emit Kafka event
      await publishEvent(KAFKA_TOPICS.PROJECT_FUNDED, {
        projectId: data.projectId,
        amount: data.amount,
        token: data.token,
        txHash: data.depositTxHash,
        mode: data.mode,
      });

      // Send notification to sponsor
      await notificationService.sendProjectFundedNotification(project.sponsorId, {
        projectName: project.title,
        amount: data.amount,
        token: data.token,
      });

      logger.info(`Project ${data.projectId} funded with tx ${data.depositTxHash}`);
      return { project, fundingRecord };
    } catch (error) {
      logger.error('Error confirming funding:', error);
      throw error;
    }
  }

  /**
   * Get remaining funds for a project
   */
  async getRemainingFunds(projectId: string) {
    try {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          milestones: {
            include: {
              subMilestones: {
                include: {
                  contributions: {
                    where: {
                      status: 'PAID',
                    },
                  },
                },
              },
            },
          },
          fundingRecords: true,
        },
      });

      if (!project) {
        throw new Error('Project not found');
      }

      // Calculate total deposited
      const totalDeposited = project.fundingRecords.reduce(
        (sum, record) => sum + Number(record.amount),
        0
      );

      // Calculate total paid out
      let totalPaid = 0;
      for (const milestone of project.milestones) {
        for (const subMilestone of milestone.subMilestones) {
          for (const contribution of subMilestone.contributions) {
            totalPaid += Number(contribution.amountPaid);
          }
        }
      }

      const remaining = totalDeposited - totalPaid;

      return {
        totalDeposited,
        totalPaid,
        remaining,
        currency: project.tokenAddress || 'USDC',
      };
    } catch (error) {
      logger.error('Error getting remaining funds:', error);
      throw error;
    }
  }

  /**
   * Get token price from oracle (mock implementation)
   */
  private async getTokenPrice(tokenAddress: string): Promise<number> {
    try {
      // In production, query Chainlink or other oracle
      // For now, return mock prices
      const mockPrices: Record<string, number> = {
        USDC: 1.0,
        USDT: 1.0,
        ETH: 3000,
        WETH: 3000,
        DAI: 1.0,
      };

      const symbol = await this.getTokenSymbol(tokenAddress);
      return mockPrices[symbol] || 1.0;
    } catch (error) {
      logger.error('Error getting token price:', error);
      return 1.0; // Default fallback
    }
  }

  /**
   * Get token symbol (mock implementation)
   */
  private async getTokenSymbol(tokenAddress: string): Promise<string> {
    // In production, query token contract
    if (tokenAddress === 'USDC' || !tokenAddress) return 'USDC';
    if (tokenAddress === 'USDT') return 'USDT';
    if (tokenAddress.toLowerCase().includes('eth')) return 'ETH';
    return 'USDC';
  }

  /**
   * Get escrow contract address
   */
  private async getEscrowContractAddress(): Promise<string> {
    // In production, return actual deployed contract address
    return '0x1234567890123456789012345678901234567890';
  }

  /**
   * Add additional funding to project
   */
  async addFunding(data: {
    projectId: string;
    depositTxHash: string;
    amount: number;
    token: string;
  }) {
    try {
      const tokenPrice = await this.getTokenPrice(data.token);

      const fundingRecord = await prisma.fundingRecord.create({
        data: {
          projectId: data.projectId,
          amount: data.amount,
          token: data.token,
          mode: PaymentMode.ESCROW,
          depositTxHash: data.depositTxHash,
          oracleRate: tokenPrice,
        },
      });

      // Update project total
      await prisma.project.update({
        where: { id: data.projectId },
        data: {
          totalTokenAmount: {
            increment: data.amount,
          },
        },
      });

      logger.info(`Additional funding added to project ${data.projectId}: ${data.amount}`);
      return fundingRecord;
    } catch (error) {
      logger.error('Error adding funding:', error);
      throw error;
    }
  }

  /**
   * Get project funding history
   */
  async getFundingHistory(projectId: string) {
    try {
      const fundingRecords = await prisma.fundingRecord.findMany({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
      });

      return fundingRecords;
    } catch (error) {
      logger.error('Error getting funding history:', error);
      throw new Error('Failed to fetch funding history');
    }
  }
}

export const fundingService = new FundingService();
