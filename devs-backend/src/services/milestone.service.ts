import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { MilestoneStatus } from '@prisma/client';
import { publishEvent, KAFKA_TOPICS } from '../lib/kafka';
import { MerkleTreeBuilderService } from './merkle-tree-builder.service';
import { MerkleCommitService } from './merkle-commit.service';
import { ethers } from 'ethers';

export interface CreateMilestoneData {
  projectId: string;
  title: string;
  description?: string;
  points: number;
  order: number;
  createdByAI?: boolean;
}

export interface CreateSubMilestoneData {
  title?: string;
  milestoneId: string;
  description: string;
  acceptanceCriteria: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  checkpointAmount: number;
  checkpointsCount?: number;
  verificationRules?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  estimateHours?: number;
  createdByAI?: boolean;
}

export class MilestoneService {
  /**
   * Create a milestone
   */
  async createMilestone(data: CreateMilestoneData) {
    try {
      const milestone = await prisma.milestone.create({
        data: {
          projectId: data.projectId,
          title: data.title,
          description: data.description,
          points: data.points,
          order: data.order,
          status: MilestoneStatus.OPEN,
          createdByAI: data.createdByAI || false,
        },
      });

      logger.info(`Milestone created: ${milestone.id} for project ${data.projectId}`);
      return milestone;
    } catch (error) {
      logger.error('Error creating milestone:', error);
      throw new Error('Failed to create milestone');
    }
  }

  /**
   * Get milestone by ID
   */
  async getMilestoneById(milestoneId: string) {
    try {
      const milestone = await prisma.milestone.findUnique({
        where: { id: milestoneId },
        include: {
          project: {
            select: {
              id: true,
              title: true,
              sponsorId: true,
            },
          },
          subMilestones: {
            include: {
              assignedUser: {
                select: {
                  id: true,
                  githubUsername: true,
                  avatarUrl: true,
                },
              },
              prLink: true,
            },
            orderBy: {
              createdAt: 'asc',
            },
          },
        },
      });

      if (!milestone) {
        throw new Error('Milestone not found');
      }

      return milestone;
    } catch (error) {
      logger.error('Error fetching milestone:', error);
      throw error;
    }
  }

  /**
   * Get milestones for a project
   */
  async getProjectMilestones(projectId: string) {
    try {
      const milestones = await prisma.milestone.findMany({
        where: { projectId },
        include: {
          subMilestones: {
            select: {
              id: true,
              description: true,
              checkpointAmount: true,
              status: true,
              assignedTo: true,
            },
          },
          _count: {
            select: {
              subMilestones: true,
            },
          },
        },
        orderBy: {
          order: 'asc',
        },
      });

      return milestones;
    } catch (error) {
      logger.error('Error fetching project milestones:', error);
      throw new Error('Failed to fetch milestones');
    }
  }

  /**
   * Update milestone
   */
  async updateMilestone(
    milestoneId: string,
    data: {
      title?: string;
      description?: string;
      points?: number;
      order?: number;
      status?: MilestoneStatus;
    }
  ) {
    try {
      const milestone = await prisma.milestone.update({
        where: { id: milestoneId },
        data,
      });

      logger.info(`Milestone ${milestoneId} updated`);
      return milestone;
    } catch (error) {
      logger.error('Error updating milestone:', error);
      throw new Error('Failed to update milestone');
    }
  }

  /**
   * Delete milestone (only if no sub-milestones are claimed)
   */
  async deleteMilestone(milestoneId: string) {
    try {
      const milestone = await prisma.milestone.findUnique({
        where: { id: milestoneId },
        include: {
          subMilestones: true,
        },
      });

      if (!milestone) {
        throw new Error('Milestone not found');
      }

      // Check if any sub-milestones are claimed or in progress
      const hasClaimed = milestone.subMilestones.some((sub) => sub.status !== MilestoneStatus.OPEN);

      if (hasClaimed) {
        throw new Error('Cannot delete milestone with claimed sub-milestones');
      }

      await prisma.milestone.delete({
        where: { id: milestoneId },
      });

      logger.info(`Milestone ${milestoneId} deleted`);
      return { success: true };
    } catch (error) {
      logger.error('Error deleting milestone:', error);
      throw error;
    }
  }

  /**
   * Create sub-milestone (task)
   */
  async createSubMilestone(data: CreateSubMilestoneData) {
    try {
      const subMilestone = await prisma.subMilestone.create({
        data: {
          milestoneId: data.milestoneId,
          description: data.description,
          acceptanceCriteria: data.acceptanceCriteria,
          checkpointAmount: data.checkpointAmount,
          checkpointsCount: data.checkpointsCount || 1,
          verificationRules: data.verificationRules,
          estimateHours: data.estimateHours,
          status: MilestoneStatus.OPEN,
          createdByAI: data.createdByAI || false,
        },
      });

      logger.info(`Sub-milestone created: ${subMilestone.id}`);
      return subMilestone;
    } catch (error) {
      logger.error('Error creating sub-milestone:', error);
      throw new Error('Failed to create sub-milestone');
    }
  }

  /**
   * Get sub-milestone by ID
   */
  async getSubMilestoneById(subMilestoneId: string) {
    try {
      const subMilestone = await prisma.subMilestone.findUnique({
        where: { id: subMilestoneId },
        include: {
          milestone: {
            include: {
              project: {
                select: {
                  id: true,
                  title: true,
                  sponsorId: true,
                  repoType: true,
                  repositoryUrl: true,
                },
              },
            },
          },
          assignedUser: {
            select: {
              id: true,
              githubUsername: true,
              email: true,
              avatarUrl: true,
            },
          },
          prLink: true,
          contributions: {
            include: {
              proof: true,
            },
          },
        },
      });

      if (!subMilestone) {
        throw new Error('Sub-milestone not found');
      }

      return subMilestone;
    } catch (error) {
      logger.error('Error fetching sub-milestone:', error);
      throw error;
    }
  }

  /**
   * Claim a sub-milestone (task)
   */
  async claimSubMilestone(subMilestoneId: string, userId: string) {
    try {
      // COOLDOWN CHECK: Max 3 active tasks per contributor
      const activeTasks = await prisma.contribution.count({
        where: {
          contributorId: userId,
          status: 'IN_PROGRESS',
        },
      });

      if (activeTasks >= 3) {
        throw new Error(
          'You can only work on 3 tasks simultaneously. Complete existing tasks first.'
        );
      }

      const subMilestone = await prisma.subMilestone.findUnique({
        where: { id: subMilestoneId },
        include: {
          milestone: {
            include: {
              project: {
                select: {
                  id: true,
                  title: true,
                  status: true,
                  repoType: true,
                  sponsorId: true,
                  totalTokenAmount: true,
                  totalPoints: true,
                },
              },
            },
          },
        },
      });

      if (!subMilestone) {
        throw new Error('Sub-milestone not found');
      }

      if (subMilestone.status !== MilestoneStatus.OPEN) {
        throw new Error('Sub-milestone is not available for claiming');
      }

      if (subMilestone.milestone.project.status !== 'ACTIVE') {
        throw new Error('Project is not active yet');
      }

      // Check if project has sufficient funds for this task
      const project = subMilestone.milestone.project;
      const totalFunded = Number(project.totalTokenAmount);

      // Calculate already paid/claimed amount
      const paidContributions = await prisma.contribution.aggregate({
        where: {
          subMilestone: {
            milestone: {
              projectId: project.id,
            },
          },
          status: {
            in: ['PAID', 'VERIFIED'],
          },
        },
        _sum: {
          amountPaid: true,
        },
      });

      const alreadyPaid = Number(paidContributions._sum.amountPaid || 0);

      // Calculate this task's payment (points ratio of total funded)
      const totalPoints = project.totalPoints || 1;
      const taskPayment = (subMilestone.points / totalPoints) * totalFunded;

      const remainingFunds = totalFunded - alreadyPaid;

      if (remainingFunds < taskPayment) {
        throw new Error(
          `Insufficient project funds. Required: ${taskPayment.toFixed(4)}, Available: ${remainingFunds.toFixed(4)}. Please ask sponsor to add more funds.`
        );
      }

      // Check if user already has too many claimed tasks
      const userClaimedCount = await prisma.subMilestone.count({
        where: {
          assignedTo: userId,
          status: {
            in: [MilestoneStatus.CLAIMED, MilestoneStatus.IN_PROGRESS],
          },
        },
      });

      if (userClaimedCount >= 3) {
        throw new Error('You have reached the maximum number of claimed tasks (3)');
      }

      // Update sub-milestone
      const updated = await prisma.subMilestone.update({
        where: { id: subMilestoneId },
        data: {
          assignedTo: userId,
          status: MilestoneStatus.CLAIMED,
        },
        include: {
          milestone: {
            include: {
              project: true,
            },
          },
          assignedUser: true,
        },
      });

      // Emit Kafka event
      await publishEvent(KAFKA_TOPICS.TASK_CLAIMED, {
        subMilestoneId,
        userId,
        projectId: updated.milestone.project.id,
        projectName: updated.milestone.project.title,
        taskDescription: updated.description,
      });

      logger.info(`Sub-milestone ${subMilestoneId} claimed by user ${userId}`);
      return updated;
    } catch (error) {
      logger.error('Error claiming sub-milestone:', error);
      throw error;
    }
  }

  /**
   * Link PR to sub-milestone
   */
  async linkPRToSubMilestone(
    subMilestoneId: string,
    userId: string,
    data: {
      prUrl: string;
      prNumber: number;
      repositoryUrl: string;
    }
  ) {
    try {
      const subMilestone = await prisma.subMilestone.findUnique({
        where: { id: subMilestoneId },
        include: {
          milestone: {
            include: {
              project: true,
            },
          },
        },
      });

      if (!subMilestone) {
        throw new Error('Sub-milestone not found');
      }

      if (subMilestone.assignedTo !== userId) {
        throw new Error('You are not assigned to this task');
      }

      if (
        subMilestone.status !== MilestoneStatus.CLAIMED &&
        subMilestone.status !== MilestoneStatus.IN_PROGRESS
      ) {
        throw new Error('Task must be claimed or in progress to link PR');
      }

      // Create PR link
      const prLink = await prisma.prLink.create({
        data: {
          subMilestoneId,
          userId,
          prUrl: data.prUrl,
          prNumber: data.prNumber,
          repositoryUrl: data.repositoryUrl,
        },
      });

      // Update sub-milestone status
      await prisma.subMilestone.update({
        where: { id: subMilestoneId },
        data: {
          status: MilestoneStatus.IN_PROGRESS,
        },
      });

      // Emit Kafka event to start verification
      await publishEvent(KAFKA_TOPICS.PR_LINKED, {
        subMilestoneId,
        userId,
        prUrl: data.prUrl,
        prNumber: data.prNumber,
        repositoryUrl: data.repositoryUrl,
        projectId: subMilestone.milestone.project.id,
      });

      logger.info(`PR linked to sub-milestone ${subMilestoneId}: ${data.prUrl}`);
      return prLink;
    } catch (error) {
      logger.error('Error linking PR to sub-milestone:', error);
      throw error;
    }
  }

  /**
   * Get available tasks for contributors
   */
  async getAvailableTasks(filters?: { projectId?: string; limit?: number; offset?: number }) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const where: any = {
        status: MilestoneStatus.OPEN,
        milestone: {
          project: {
            status: 'ACTIVE',
            repoType: 'PUBLIC', // Only show public repos in general listing
          },
        },
      };

      if (filters?.projectId) {
        where.milestone = {
          ...where.milestone,
          projectId: filters.projectId,
        };
      }

      const tasks = await prisma.subMilestone.findMany({
        where,
        include: {
          milestone: {
            include: {
              project: {
                select: {
                  id: true,
                  title: true,
                  description: true,
                  repositoryUrl: true,
                  tokenAddress: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: filters?.limit || 50,
        skip: filters?.offset || 0,
      });

      return tasks;
    } catch (error) {
      logger.error('Error fetching available tasks:', error);
      throw new Error('Failed to fetch available tasks');
    }
  }

  /**
   * Get user's claimed tasks
   */
  async getUserClaimedTasks(userId: string) {
    try {
      const tasks = await prisma.subMilestone.findMany({
        where: {
          assignedTo: userId,
          status: {
            in: [MilestoneStatus.CLAIMED, MilestoneStatus.IN_PROGRESS],
          },
        },
        include: {
          milestone: {
            include: {
              project: {
                select: {
                  id: true,
                  title: true,
                  repositoryUrl: true,
                  tokenAddress: true,
                },
              },
            },
          },
          prLink: true,
        },
        orderBy: {
          updatedAt: 'desc',
        },
      });

      return tasks;
    } catch (error) {
      logger.error('Error fetching user claimed tasks:', error);
      throw new Error('Failed to fetch claimed tasks');
    }
  }

  /**
   * Unclaim a sub-milestone (before PR is linked)
   */
  async unclaimSubMilestone(subMilestoneId: string, userId: string) {
    try {
      const subMilestone = await prisma.subMilestone.findUnique({
        where: { id: subMilestoneId },
        include: {
          prLink: true,
        },
      });

      if (!subMilestone) {
        throw new Error('Sub-milestone not found');
      }

      if (subMilestone.assignedTo !== userId) {
        throw new Error('You are not assigned to this task');
      }

      if (subMilestone.prLink) {
        throw new Error('Cannot unclaim task after PR is linked');
      }

      const updated = await prisma.subMilestone.update({
        where: { id: subMilestoneId },
        data: {
          assignedTo: null,
          status: MilestoneStatus.OPEN,
        },
      });

      logger.info(`Sub-milestone ${subMilestoneId} unclaimed by user ${userId}`);
      return updated;
    } catch (error) {
      logger.error('Error unclaiming sub-milestone:', error);
      throw error;
    }
  }

  /**
   * Commit milestone to blockchain via Merkle tree
   * This should be called after all submilestones are created
   */
  async commitMilestoneToBlockchain(
    milestoneId: string,
    sponsorPrivateKey: string,
    metadataUri?: string
  ) {
    try {
      // Get milestone with submilestones
      const milestone = await prisma.milestone.findUnique({
        where: { id: milestoneId },
        include: {
          subMilestones: true,
          project: true,
        },
      });

      if (!milestone) {
        throw new Error('Milestone not found');
      }

      if (milestone.isCommittedOnChain) {
        throw new Error('Milestone already committed to blockchain');
      }

      if (!milestone.subMilestones || milestone.subMilestones.length === 0) {
        throw new Error('Cannot commit milestone without submilestones');
      }

      logger.info(
        `Committing milestone ${milestoneId} with ${milestone.subMilestones.length} submilestones to blockchain`
      );

      // Build Merkle tree from submilestones
      const merkleLeaves = milestone.subMilestones.map((sub) => ({
        submilestoneId: sub.id,
        amount: BigInt(ethers.parseUnits(sub.checkpointAmount.toString(), 18).toString()),
      }));

      const merkleData = MerkleTreeBuilderService.buildMilestoneTree(merkleLeaves);

      logger.info(`Merkle root generated: ${merkleData.rootHash}`);

      // Calculate total amount
      const totalAmount = merkleLeaves.reduce((sum, leaf) => sum + leaf.amount, BigInt(0));

      // Commit to blockchain
      const merkleCommitService = new MerkleCommitService();
      const txHash = await merkleCommitService.commitMilestone(
        {
          projectId: milestone.projectId,
          milestoneId: milestone.id,
          rootHash: merkleData.rootHash,
          totalAmount,
          submilestoneCount: milestone.subMilestones.length,
          metadataUri: metadataUri || '',
        },
        sponsorPrivateKey
      );

      logger.info(`Milestone committed to blockchain. TxHash: ${txHash}`);

      // Update database
      const updated = await prisma.milestone.update({
        where: { id: milestoneId },
        data: {
          merkleRoot: merkleData.rootHash,
          merkleCommitTxHash: txHash,
          isCommittedOnChain: true,
          metadataUri,
        },
      });

      // Publish event
      await publishEvent(KAFKA_TOPICS.MILESTONE_COMMITTED, {
        milestoneId,
        projectId: milestone.projectId,
        merkleRoot: merkleData.rootHash,
        txHash,
        submilestoneCount: milestone.subMilestones.length,
        totalAmount: totalAmount.toString(),
      });

      return {
        milestone: updated,
        merkleRoot: merkleData.rootHash,
        txHash,
      };
    } catch (error) {
      logger.error('Error committing milestone to blockchain:', error);
      throw error;
    }
  }
}

export const milestoneService = new MilestoneService();
