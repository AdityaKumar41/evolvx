/* eslint-disable @typescript-eslint/no-explicit-any */
import { ethers } from 'ethers';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { publishEvent, KAFKA_TOPICS } from '../lib/kafka';
import { PaymentMode } from '@prisma/client';

// Mock ABI for Aave/Compound integration
const YIELD_MANAGER_ABI = [
  'function depositToYield(address token, uint256 amount) external returns (uint256 shares)',
  'function withdrawFromYield(address token, uint256 shares) external returns (uint256 amount)',
  'function harvestYield(address token) external returns (uint256 earned)',
  'function getYieldBalance(address token) external view returns (uint256)',
  'function getAPY(address token) external view returns (uint256)',
  'function claimPlatformFees() external returns (uint256)',
];

export interface YieldStats {
  deposited: number;
  currentBalance: number;
  earned: number;
  apy: number;
  token: string;
  lastHarvestAt?: Date;
}

export class YieldService {
  private provider: ethers.JsonRpcProvider;
  private wallet?: ethers.Wallet;
  private yieldContract?: ethers.Contract;

  constructor() {
    this.provider = new ethers.JsonRpcProvider(process.env.BLOCKCHAIN_RPC_URL);

    if (process.env.RELAYER_PRIVATE_KEY) {
      this.wallet = new ethers.Wallet(process.env.RELAYER_PRIVATE_KEY, this.provider);
    }

    // Initialize yield manager contract (Aave/Compound wrapper)
    const yieldManagerAddress = process.env.YIELD_MANAGER_ADDRESS;
    if (yieldManagerAddress && this.wallet) {
      this.yieldContract = new ethers.Contract(yieldManagerAddress, YIELD_MANAGER_ABI, this.wallet);
    }
  }

  /**
   * Switch project from Escrow to Yield mode
   */
  async switchToYieldMode(projectId: string): Promise<void> {
    try {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
      });

      if (!project) {
        throw new Error('Project not found');
      }

      if (project.paymentMode === PaymentMode.YIELD) {
        throw new Error('Project already in yield mode');
      }

      // Get current escrow balance
      const escrowBalance = Number(project.totalTokenAmount);

      if (escrowBalance === 0) {
        throw new Error('No funds to migrate');
      }

      // Withdraw from escrow (mock - in production, call smart contract)
      logger.info(`Withdrawing ${escrowBalance} from escrow for project ${projectId}`);

      // Deposit to yield protocol
      if (this.yieldContract) {
        const tx = await this.yieldContract.depositToYield(
          project.tokenAddress || 'USDC',
          ethers.parseUnits(escrowBalance.toString(), 6) // Assuming 6 decimals
        );
        await tx.wait();
      }

      // Update project mode
      await prisma.project.update({
        where: { id: projectId },
        data: {
          paymentMode: PaymentMode.YIELD,
          // TODO: Add metadata field to Project schema to store yield mode data
          // metadata: {
          //   yieldMode: {
          //     activatedAt: new Date(),
          //     initialDeposit: escrowBalance,
          //   },
          // },
        },
      });

      await publishEvent(KAFKA_TOPICS.YIELD_HARVESTED, {
        projectId,
        action: 'switched_to_yield',
        amount: escrowBalance,
      });

      logger.info(`Project ${projectId} switched to yield mode`);
    } catch (error) {
      logger.error('Error switching to yield mode:', error);
      throw error;
    }
  }

  /**
   * Switch project from Yield to Escrow mode
   */
  async switchToEscrowMode(projectId: string): Promise<void> {
    try {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
      });

      if (!project) {
        throw new Error('Project not found');
      }

      if (project.paymentMode !== PaymentMode.YIELD) {
        throw new Error('Project not in yield mode');
      }

      // Get yield balance
      const yieldBalance = await this.getYieldBalance(projectId);

      // Withdraw from yield protocol
      if (this.yieldContract) {
        const tx = await this.yieldContract.withdrawFromYield(
          project.tokenAddress || 'USDC',
          ethers.parseUnits(yieldBalance.currentBalance.toString(), 6)
        );
        await tx.wait();
      }

      // Update project mode
      await prisma.project.update({
        where: { id: projectId },
        data: {
          paymentMode: PaymentMode.ESCROW,
          // TODO: Add metadata field to Project schema to store yield mode data
          // metadata: {
          //   yieldMode: {
          //     deactivatedAt: new Date(),
          //     finalBalance: yieldBalance.currentBalance,
          //     totalEarned: yieldBalance.earned,
          //   },
          // },
        },
      });

      await publishEvent(KAFKA_TOPICS.YIELD_HARVESTED, {
        projectId,
        action: 'switched_to_escrow',
        amount: yieldBalance.currentBalance,
        earned: yieldBalance.earned,
      });

      logger.info(`Project ${projectId} switched to escrow mode`);
    } catch (error) {
      logger.error('Error switching to escrow mode:', error);
      throw error;
    }
  }

  /**
   * Harvest yield for a project
   */
  async harvestYield(projectId: string): Promise<{
    harvested: number;
    platformFee: number;
    netEarned: number;
  }> {
    try {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
      });

      if (!project) {
        throw new Error('Project not found');
      }

      if (project.paymentMode !== PaymentMode.YIELD) {
        throw new Error('Project not in yield mode');
      }

      // Harvest yield from protocol
      let harvestedAmount = 0;
      if (this.yieldContract) {
        const tx = await this.yieldContract.harvestYield(project.tokenAddress || 'USDC');
        await tx.wait();

        // Parse harvested amount from event (simplified)
        harvestedAmount = 100; // Mock value
      }

      // Calculate platform fee (e.g., 10% of yield)
      const platformFeePercentage = Number(process.env.YIELD_PLATFORM_FEE || '10');
      const platformFee = (harvestedAmount * platformFeePercentage) / 100;
      const netEarned = harvestedAmount - platformFee;

      // Update project balance
      await prisma.project.update({
        where: { id: projectId },
        data: {
          totalTokenAmount: {
            increment: netEarned,
          },
          // TODO: Add metadata field to Project schema to store yield harvest data
          // metadata: {
          //   yieldMode: {
          //     lastHarvestAt: new Date(),
          //     totalHarvested: harvestedAmount,
          //     totalFeesCollected: platformFee,
          //   },
          // },
        },
      });

      // Record fee collection
      await prisma.fundingRecord.create({
        data: {
          projectId,
          amount: platformFee,
          token: project.tokenAddress || 'USDC',
          mode: PaymentMode.YIELD,
          depositTxHash: 'platform-fee-collection',
          oracleRate: 1.0,
          // metadata: {
          //   type: 'platform_fee',
          //   source: 'yield_harvest',
          // },
        },
      });

      await publishEvent(KAFKA_TOPICS.YIELD_HARVESTED, {
        projectId,
        harvested: harvestedAmount,
        platformFee,
        netEarned,
        timestamp: new Date(),
      });

      logger.info(`Harvested ${harvestedAmount} yield for project ${projectId}`);

      return {
        harvested: harvestedAmount,
        platformFee,
        netEarned,
      };
    } catch (error) {
      logger.error('Error harvesting yield:', error);
      throw error;
    }
  }

  /**
   * Get yield balance and stats for a project
   */
  async getYieldBalance(projectId: string): Promise<YieldStats> {
    try {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
      });

      if (!project) {
        throw new Error('Project not found');
      }

      let currentBalance = Number(project.totalTokenAmount);
      let apy = 0;

      // Get balance from yield protocol
      if (this.yieldContract && project.paymentMode === PaymentMode.YIELD) {
        const balance = await this.yieldContract.getYieldBalance(project.tokenAddress || 'USDC');
        currentBalance = Number(ethers.formatUnits(balance, 6));

        const apyBN = await this.yieldContract.getAPY(project.tokenAddress || 'USDC');
        apy = Number(ethers.formatUnits(apyBN, 2)); // Assuming APY is in basis points
      }

      // TODO: Add metadata field to Project schema
      // const yieldMetadata = (project.metadata as any)?.yieldMode || {};
      const initialDeposit = currentBalance; // yieldMetadata.initialDeposit || currentBalance
      const earned = 0; // currentBalance - initialDeposit

      return {
        deposited: initialDeposit,
        currentBalance,
        earned,
        apy,
        token: project.tokenAddress || 'USDC',
        lastHarvestAt: undefined, // yieldMetadata.lastHarvestAt
      };
    } catch (error) {
      logger.error('Error getting yield balance:', error);
      throw error;
    }
  }

  /**
   * Get current APY for a token
   */
  async getAPY(token: string): Promise<number> {
    try {
      if (!this.yieldContract) {
        return 0;
      }

      const apyBN = await this.yieldContract.getAPY(token);
      return Number(ethers.formatUnits(apyBN, 2));
    } catch (error) {
      logger.error('Error getting APY:', error);
      return 0;
    }
  }

  /**
   * Auto-harvest yield for all projects (scheduled task)
   */
  async autoHarvestAll(): Promise<void> {
    try {
      const yieldProjects = await prisma.project.findMany({
        where: {
          paymentMode: PaymentMode.YIELD,
          status: 'ACTIVE',
        },
      });

      logger.info(`Auto-harvesting yield for ${yieldProjects.length} projects`);

      for (const project of yieldProjects) {
        try {
          await this.harvestYield(project.id);
        } catch (error) {
          logger.error(`Failed to harvest yield for project ${project.id}:`, error);
        }
      }

      logger.info('Auto-harvest completed');
    } catch (error) {
      logger.error('Error in auto-harvest:', error);
      throw error;
    }
  }

  /**
   * Claim accumulated platform fees
   */
  async claimPlatformFees(): Promise<number> {
    try {
      if (!this.yieldContract) {
        throw new Error('Yield contract not initialized');
      }

      const tx = await this.yieldContract.claimPlatformFees();
      await tx.wait(); // Wait for transaction confirmation

      // Parse claimed amount from event
      const claimedAmount = 1000; // Mock value

      logger.info(`Claimed ${claimedAmount} in platform fees`);

      return claimedAmount;
    } catch (error) {
      logger.error('Error claiming platform fees:', error);
      throw error;
    }
  }
}

export const yieldService = new YieldService();
