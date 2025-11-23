import { NotificationType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { githubService } from './github.service';
import { MilestonePayoutService } from './milestone-payout.service';
import { MerkleTreeBuilderService } from './merkle-tree-builder.service';
import { ethers } from 'ethers';
import { logger } from '../utils/logger';

// Enum values as constants until Prisma regenerates properly
enum TaskType {
  BACKEND = 'BACKEND',
  FRONTEND = 'FRONTEND',
  UI = 'UI',
  FULLSTACK = 'FULLSTACK',
  DEVOPS = 'DEVOPS',
  TESTING = 'TESTING',
}

export interface MergeDecision {
  aiScore: number;
  coderabbitScore: number;
  combinedScore: number;
  canAutoMerge: boolean;
  requiresSponsorApproval: boolean;
  reason: string;
}

export interface PRAnalysisResult {
  aiScore: number;
  aiReviewFeedback: Record<string, unknown>;
  coderabbitScore: number;
  taskType: TaskType;
}

class AIMergeService {
  // Thresholds for auto-merge
  private readonly AI_THRESHOLD = 80;
  private readonly CODERABBIT_THRESHOLD = 70;
  private readonly COMBINED_THRESHOLD = 75;
  private readonly AI_WEIGHT = 0.6;
  private readonly CODERABBIT_WEIGHT = 0.4;

  /**
   * Combine AI and CodeRabbit scores into a weighted score
   */
  combineScores(aiScore: number, coderabbitScore: number): number {
    const combined = aiScore * this.AI_WEIGHT + coderabbitScore * this.CODERABBIT_WEIGHT;
    return Math.round(combined * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Decide if a PR can be auto-merged based on scores and task type
   */
  async decideMerge(
    _prSubmissionId: string,
    aiScore: number,
    coderabbitScore: number,
    taskType: TaskType
  ): Promise<MergeDecision> {
    const combinedScore = this.combineScores(aiScore, coderabbitScore);

    // UI tasks always require sponsor approval
    if (
      taskType === TaskType.UI ||
      taskType === TaskType.FRONTEND ||
      taskType === TaskType.FULLSTACK
    ) {
      return {
        aiScore,
        coderabbitScore,
        combinedScore,
        canAutoMerge: false,
        requiresSponsorApproval: true,
        reason: `UI/Frontend tasks require sponsor approval for visual review`,
      };
    }

    // Backend tasks can auto-merge if scores meet thresholds
    const meetsAIThreshold = aiScore >= this.AI_THRESHOLD;
    const meetsCoderabbitThreshold = coderabbitScore >= this.CODERABBIT_THRESHOLD;
    const meetsCombinedThreshold = combinedScore >= this.COMBINED_THRESHOLD;

    const canAutoMerge = meetsAIThreshold && meetsCoderabbitThreshold && meetsCombinedThreshold;

    let reason = '';
    if (canAutoMerge) {
      reason = `Passes all thresholds: AI=${aiScore}≥${this.AI_THRESHOLD}, CodeRabbit=${coderabbitScore}≥${this.CODERABBIT_THRESHOLD}, Combined=${combinedScore}≥${this.COMBINED_THRESHOLD}`;
    } else {
      const failures: string[] = [];
      if (!meetsAIThreshold) failures.push(`AI score ${aiScore} < ${this.AI_THRESHOLD}`);
      if (!meetsCoderabbitThreshold)
        failures.push(`CodeRabbit score ${coderabbitScore} < ${this.CODERABBIT_THRESHOLD}`);
      if (!meetsCombinedThreshold)
        failures.push(`Combined score ${combinedScore} < ${this.COMBINED_THRESHOLD}`);
      reason = `Requires sponsor review: ${failures.join(', ')}`;
    }

    return {
      aiScore,
      coderabbitScore,
      combinedScore,
      canAutoMerge,
      requiresSponsorApproval: !canAutoMerge,
      reason,
    };
  }

  /**
   * Update PR submission with merge decision
   */
  async updatePRSubmission(prSubmissionId: string, decision: MergeDecision): Promise<void> {
    await prisma.pRSubmission.update({
      where: { id: prSubmissionId },
      data: {
        aiReviewScore: decision.aiScore,
        status: decision.canAutoMerge ? 'AI_APPROVED' : 'SPONSOR_REVIEW',
      },
    });
  }

  /**
   * Execute auto-merge for a PR
   */
  async executeMerge(prSubmissionId: string): Promise<boolean> {
    const prSubmission = await prisma.pRSubmission.findUnique({
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
      },
    });

    if (!prSubmission) {
      throw new Error('PR submission not found');
    }

    // Verify PR can be auto-merged
    if (!prSubmission.aiReviewScore) {
      throw new Error('PR does not meet auto-merge criteria');
    }

    const project = prSubmission.subMilestone.milestone.project;
    if (!project.repositoryUrl || !prSubmission.prNumber) {
      throw new Error('Missing repository URL or PR number');
    }

    try {
      // Extract owner and repo from repositoryUrl
      const urlParts = project.repositoryUrl.replace('https://github.com/', '').split('/');
      const owner = urlParts[0];
      const repo = urlParts[1];

      // Execute merge via GitHub API
      const merged = await githubService.mergePR(
        owner,
        repo,
        prSubmission.prNumber,
        'squash' // or 'merge' / 'rebase' based on project settings
      );

      if (merged) {
        // Update PR submission
        await prisma.pRSubmission.update({
          where: { id: prSubmissionId },
          data: {
            status: 'MERGED',
            mergedAt: new Date(),
          },
        });

        // Create notification for contributor
        await prisma.notification.create({
          data: {
            userId: prSubmission.contributorId,
            type: 'VERIFICATION_SUCCESS',
            title: 'PR Auto-Merged',
            message: `Your PR #${prSubmission.prNumber} has been automatically merged!`,
            metadata: JSON.parse(
              JSON.stringify({
                prSubmissionId,
                type: 'PR_SUBMISSION',
              })
            ),
          },
        });

        // Trigger payout processing (async - don't block merge notification)
        const verifierKey = process.env.VERIFIER_PRIVATE_KEY;
        if (verifierKey) {
          this.processPayout(prSubmissionId, verifierKey).catch((error) => {
            logger.error(`Failed to process payout for PR ${prSubmissionId}:`, error);
          });
        } else {
          logger.warn(
            'VERIFIER_PRIVATE_KEY not set. Skipping automatic payout processing for PR:',
            prSubmissionId
          );
        }

        return true;
      } else {
        // Update to failed status
        await prisma.pRSubmission.update({
          where: { id: prSubmissionId },
          data: {},
        });
        return false;
      }
    } catch (error) {
      console.error('Error executing merge:', error);
      await prisma.pRSubmission.update({
        where: { id: prSubmissionId },
        data: {},
      });
      throw error;
    }
  }

  /**
   * Handle sponsor approval for UI tasks
   */
  async sponsorApprovePR(
    prSubmissionId: string,
    sponsorId: string,
    feedback?: string
  ): Promise<void> {
    const prSubmission = await prisma.pRSubmission.findUnique({
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
      },
    });

    if (!prSubmission) {
      throw new Error('PR submission not found');
    }

    // Verify sponsor is the project sponsor
    const project = prSubmission.subMilestone.milestone.project;
    if (project.sponsorId !== sponsorId) {
      throw new Error('Only project sponsor can approve PRs');
    }

    // Update PR submission
    await prisma.pRSubmission.update({
      where: { id: prSubmissionId },
      data: {
        status: 'APPROVED',
        sponsorFeedback: feedback,
      },
    });

    // Execute merge
    await this.executeMerge(prSubmissionId);
  }

  /**
   * Handle sponsor rejection for UI tasks
   */
  async sponsorRejectPR(
    prSubmissionId: string,
    sponsorId: string,
    feedback: string
  ): Promise<void> {
    const prSubmission = await prisma.pRSubmission.findUnique({
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
      },
    });

    if (!prSubmission) {
      throw new Error('PR submission not found');
    }

    // Verify sponsor is the project sponsor
    const project = prSubmission.subMilestone.milestone.project;
    if (project.sponsorId !== sponsorId) {
      throw new Error('Only project sponsor can reject PRs');
    }

    // Update PR submission
    await prisma.pRSubmission.update({
      where: { id: prSubmissionId },
      data: {
        status: 'REJECTED',
        sponsorFeedback: feedback,
      },
    });

    // Create notification for contributor
    await prisma.notification.create({
      data: {
        userId: prSubmission.contributorId,
        type: NotificationType.TASK_APPROVED,
        title: 'PR Rejected',
        message: `Your PR for "${prSubmission.subMilestone.description}" has been rejected.`,
        metadata: JSON.parse(
          JSON.stringify({
            prSubmissionId,
            prUrl: prSubmission.prUrl,
            feedback,
          })
        ),
      },
    });
  }

  /**
   * Process payout after PR is merged and approved
   * Generates Merkle proof and submits payout request to blockchain
   */
  async processPayout(prSubmissionId: string, verifierPrivateKey: string): Promise<void> {
    try {
      logger.info(`Processing payout for PR submission ${prSubmissionId}`);

      const prSubmission = await prisma.pRSubmission.findUnique({
        where: { id: prSubmissionId },
        include: {
          contributor: {
            select: {
              walletAddress: true,
              smartAccountAddress: true,
            },
          },
          subMilestone: {
            include: {
              milestone: {
                include: {
                  project: true,
                  subMilestones: true,
                },
              },
            },
          },
        },
      });

      if (!prSubmission) {
        throw new Error('PR submission not found');
      }

      if (prSubmission.status !== 'APPROVED' && prSubmission.status !== 'AI_APPROVED') {
        throw new Error('PR must be approved before payout');
      }

      const milestone = prSubmission.subMilestone.milestone;

      // Check if milestone is committed to blockchain
      if (!milestone.isCommittedOnChain || !milestone.merkleRoot) {
        throw new Error('Milestone not committed to blockchain. Cannot process payout.');
      }

      // Get all submilestones to rebuild Merkle tree
      const merkleLeaves = milestone.subMilestones.map((sub) => ({
        submilestoneId: sub.id,
        amount: BigInt(ethers.parseUnits(sub.checkpointAmount.toString(), 18).toString()),
      }));

      // Rebuild Merkle tree
      const merkleData = MerkleTreeBuilderService.buildMilestoneTree(merkleLeaves);

      // Find current submilestone in leaves
      const currentLeaf = merkleLeaves.find(
        (leaf) => leaf.submilestoneId === prSubmission.subMilestoneId
      );

      if (!currentLeaf) {
        throw new Error('Submilestone not found in Merkle tree');
      }

      // Generate proof for this submilestone
      const proof = MerkleTreeBuilderService.generateProof(merkleData.tree, currentLeaf);

      logger.info(`Generated Merkle proof for submilestone ${prSubmission.subMilestoneId}`);

      // Verify proof locally
      const isValid = MerkleTreeBuilderService.verifyProof(
        proof,
        milestone.merkleRoot,
        currentLeaf
      );

      if (!isValid) {
        throw new Error('Merkle proof verification failed locally');
      }

      // Get contributor wallet address
      const contributorAddress =
        prSubmission.contributor.smartAccountAddress || prSubmission.contributor.walletAddress;

      if (!contributorAddress) {
        throw new Error('Contributor wallet address not found');
      }

      // Submit payout request to blockchain
      const payoutService = new MilestonePayoutService();
      const txHash = await payoutService.requestPayout(
        {
          projectId: milestone.projectId,
          milestoneId: milestone.id,
          submilestoneId: prSubmission.subMilestoneId,
          contributor: contributorAddress,
          amount: currentLeaf.amount,
          merkleProof: proof,
        },
        verifierPrivateKey
      );

      logger.info(`Payout request submitted. TxHash: ${txHash}`);

      // Update contribution record
      await prisma.contribution.create({
        data: {
          contributorId: prSubmission.contributorId,
          subMilestoneId: prSubmission.subMilestoneId,
          description: `Completed: ${prSubmission.subMilestone.description}`,
          amountPaid: prSubmission.subMilestone.checkpointAmount.toString(),
          status: 'PENDING', // Will be marked PAID after on-chain confirmation
          transactionHash: txHash,
        },
      });

      // Update PR submission
      await prisma.pRSubmission.update({
        where: { id: prSubmissionId },
        data: {
          status: 'PAYOUT_PENDING',
        },
      });

      // Notify contributor
      await prisma.notification.create({
        data: {
          userId: prSubmission.contributorId,
          type: NotificationType.PAYMENT_RECEIVED,
          title: 'Payout Processing',
          message: `Your payout for "${prSubmission.subMilestone.description}" is being processed on-chain.`,
          metadata: JSON.parse(
            JSON.stringify({
              prSubmissionId,
              txHash,
              amount: currentLeaf.amount.toString(),
            })
          ),
        },
      });

      logger.info(`Payout processing completed for PR ${prSubmissionId}`);
    } catch (error) {
      logger.error(`Failed to process payout for PR ${prSubmissionId}:`, error);
      throw error;
    }
  }
}

export const aiMergeService = new AIMergeService();
