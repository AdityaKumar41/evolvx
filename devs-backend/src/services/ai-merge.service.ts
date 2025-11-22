import { NotificationType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { githubService } from './github.service';

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
}

export const aiMergeService = new AIMergeService();
