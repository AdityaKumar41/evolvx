import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

export class MilestoneController {
  /**
   * Get milestones for a project
   */
  static async getProjectMilestones(req: AuthRequest, res: Response) {
    const { projectId } = req.params;

    const milestones = await prisma.milestone.findMany({
      where: { projectId },
      include: {
        subMilestones: {
          include: {
            assignedUser: {
              select: {
                id: true,
                githubUsername: true,
                avatarUrl: true,
              },
            },
            contributions: {
              select: {
                id: true,
                status: true,
                amountPaid: true,
              },
            },
          },
        },
      },
      orderBy: { order: 'asc' },
    });

    res.json({ milestones });
  }

  /**
   * Claim a sub-milestone (contributor)
   */
  static async claimSubMilestone(req: AuthRequest, res: Response) {
    const { subMilestoneId } = req.params;
    const { repositoryUrl, branchName } = req.body;

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
      throw new AppError('Sub-milestone not found', 404);
    }

    if (subMilestone.status !== 'OPEN') {
      throw new AppError('Sub-milestone is not available for claiming', 400);
    }

    // Check if project is active
    if (subMilestone.milestone.project.status !== 'ACTIVE') {
      throw new AppError('Project is not active', 400);
    }

    const updated = await prisma.subMilestone.update({
      where: { id: subMilestoneId },
      data: {
        assignedTo: req.user!.id,
        status: 'CLAIMED',
        metadata: {
          repositoryUrl,
          branchName,
          claimedAt: new Date().toISOString(),
        },
      },
      include: {
        assignedUser: {
          select: {
            id: true,
            githubUsername: true,
            avatarUrl: true,
          },
        },
      },
    });

    res.json({
      message: 'Sub-milestone claimed successfully',
      subMilestone: updated,
    });
  }

  /**
   * Link PR to sub-milestone
   */
  static async linkPR(req: AuthRequest, res: Response) {
    const { subMilestoneId } = req.params;
    const { prUrl, prNumber, repositoryUrl } = req.body;

    const subMilestone = await prisma.subMilestone.findUnique({
      where: { id: subMilestoneId },
    });

    if (!subMilestone) {
      throw new AppError('Sub-milestone not found', 404);
    }

    if (subMilestone.assignedTo !== req.user!.id) {
      throw new AppError('You can only link PRs to your claimed tasks', 403);
    }

    // Create or update PR link
    const prLink = await prisma.prLink.upsert({
      where: { subMilestoneId },
      create: {
        subMilestoneId,
        prUrl,
        prNumber,
        repositoryUrl,
        userId: req.user!.id,
      },
      update: {
        prUrl,
        prNumber,
        repositoryUrl,
      },
    });

    // Update sub-milestone status
    await prisma.subMilestone.update({
      where: { id: subMilestoneId },
      data: {
        status: 'IN_PROGRESS',
      },
    });

    res.json({
      message: 'PR linked successfully',
      prLink,
    });
  }

  /**
   * Get sub-milestone details with progress
   */
  static async getSubMilestoneDetails(req: AuthRequest, res: Response) {
    const { subMilestoneId } = req.params;

    const subMilestone = await prisma.subMilestone.findUnique({
      where: { id: subMilestoneId },
      include: {
        milestone: {
          include: {
            project: {
              include: {
                sponsor: {
                  select: {
                    id: true,
                    githubUsername: true,
                    avatarUrl: true,
                  },
                },
              },
            },
          },
        },
        assignedUser: {
          select: {
            id: true,
            githubUsername: true,
            avatarUrl: true,
            walletAddress: true,
          },
        },
        contributions: {
          include: {
            proof: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    if (!subMilestone) {
      throw new AppError('Sub-milestone not found', 404);
    }

    // Get PR link if exists
    const prLink = await prisma.prLink.findUnique({
      where: { subMilestoneId },
    });

    // Calculate progress
    const totalCheckpoints = subMilestone.checkpointsCount;
    const completedCheckpoints = subMilestone.contributions.filter(
      (c) => c.status === 'PAID'
    ).length;
    const progress = (completedCheckpoints / totalCheckpoints) * 100;

    res.json({
      subMilestone,
      prLink,
      progress: {
        total: totalCheckpoints,
        completed: completedCheckpoints,
        percentage: progress,
      },
    });
  }

  /**
   * Update sub-milestone (sponsor only - for re-scoping)
   */
  static async updateSubMilestone(req: AuthRequest, res: Response) {
    const { subMilestoneId } = req.params;
    const { description, acceptanceCriteria, checkpointAmount, checkpointsCount } = req.body;

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
      throw new AppError('Sub-milestone not found', 404);
    }

    // Check if user is sponsor
    if (subMilestone.milestone.project.sponsorId !== req.user!.id) {
      throw new AppError('Only the project sponsor can update sub-milestones', 403);
    }

    const updated = await prisma.subMilestone.update({
      where: { id: subMilestoneId },
      data: {
        ...(description && { description }),
        ...(acceptanceCriteria && { acceptanceCriteria }),
        ...(checkpointAmount && { checkpointAmount }),
        ...(checkpointsCount && { checkpointsCount }),
        status: 'RESCOPED',
      },
    });

    res.json({
      message: 'Sub-milestone updated successfully',
      subMilestone: updated,
    });
  }
}
