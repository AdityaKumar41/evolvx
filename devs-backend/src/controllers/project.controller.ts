import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { publishEvent, KAFKA_TOPICS } from '../lib/kafka';
import { inngest } from '../lib/inngest';
import { logger } from '../utils/logger';

export class ProjectController {
  /**
   * Create a new project
   */
  static async createProject(req: AuthRequest, res: Response) {
    const { title, description, repositoryUrl, tokenAddress, orgId, prompt } = req.body;

    const project = await prisma.project.create({
      data: {
        title,
        description,
        repositoryUrl,
        tokenAddress,
        orgId,
        sponsorId: req.user!.id,
        status: 'DRAFT',
      },
      include: {
        sponsor: {
          select: {
            id: true,
            githubUsername: true,
            walletAddress: true,
          },
        },
      },
    });

    // Store AI generation prompt if provided
    if (prompt) {
      await prisma.aIGenerationLog.create({
        data: {
          projectId: project.id,
          prompt,
          status: 'PENDING',
        },
      });
    }

    res.status(201).json({ project });
  }

  /**
   * Get all projects (with filters)
   */
  static async getProjects(req: AuthRequest, res: Response) {
    const { status, sponsorId, search } = req.query;

    const projects = await prisma.project.findMany({
      where: {
        ...(status && { status: status as 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'CLOSED' }),
        ...(sponsorId && { sponsorId: sponsorId as string }),
        ...(search && {
          OR: [
            { title: { contains: search as string, mode: 'insensitive' } },
            {
              description: { contains: search as string, mode: 'insensitive' },
            },
          ],
        }),
      },
      include: {
        sponsor: {
          select: {
            id: true,
            githubUsername: true,
            avatarUrl: true,
          },
        },
        _count: {
          select: {
            milestones: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json({ projects });
  }

  /**
   * Get project by ID
   */
  static async getProjectById(req: AuthRequest, res: Response) {
    const { id } = req.params;

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        sponsor: {
          select: {
            id: true,
            githubUsername: true,
            avatarUrl: true,
            walletAddress: true,
          },
        },
        milestones: {
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
              },
            },
          },
        },
        fundings: true,
      },
    });

    if (!project) {
      throw new AppError('Project not found', 404);
    }

    res.json({ project });
  }

  /**
   * Trigger AI milestone generation
   */
  static async generateMilestones(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const { prompt, documents } = req.body;

    const project = await prisma.project.findUnique({
      where: { id },
    });

    if (!project) {
      throw new AppError('Project not found', 404);
    }

    if (project.sponsorId !== req.user!.id) {
      throw new AppError('Only the project sponsor can generate milestones', 403);
    }

    try {
      // Trigger Inngest workflow for AI generation
      await inngest.send({
        name: 'ai/generate.milestones',
        data: {
          projectId: id,
          prompt,
          documents,
          userId: req.user!.id,
        },
      });

      res.json({
        message: 'AI milestone generation started. This may take a few moments.',
        status: 'PROCESSING',
      });
    } catch (error) {
      logger.error('Failed to trigger AI generation:', error);

      // Fallback: Create a single milestone structure immediately
      const maxOrder = await prisma.milestone.count({ where: { projectId: id } });

      const milestone = await prisma.milestone.create({
        data: {
          projectId: id,
          title: 'AI Generated Milestone',
          description: prompt || 'Generated milestone based on your project requirements',
          order: maxOrder + 1,
          status: 'OPEN',
          subMilestones: {
            create: Array.from({ length: 10 }, (_, i) => ({
              description: `Sub-task ${i + 1}: Please update this description`,
              acceptanceCriteria: {},
              status: 'OPEN',
              checkpointAmount: '0',
              checkpointsCount: 1,
              estimateHours: 8,
            })),
          },
        },
        include: {
          subMilestones: true,
        },
      });

      res.json({
        message: 'Created milestone template. AI service is temporarily unavailable.',
        status: 'COMPLETED',
        milestone,
      });
    }
  }

  /**
   * Get AI-generated milestone preview (draft)
   */
  static async getMilestonePreview(req: AuthRequest, res: Response) {
    const { id } = req.params;

    const project = await prisma.project.findUnique({
      where: { id },
    });

    if (!project) {
      throw new AppError('Project not found', 404);
    }

    const milestones = await prisma.milestone.findMany({
      where: {
        projectId: id,
        status: 'OPEN',
      },
      include: {
        subMilestones: true,
      },
      orderBy: { order: 'asc' },
    });

    // Get AI generation log
    const aiLog = await prisma.aIGenerationLog.findFirst({
      where: { projectId: id },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      milestones,
      aiGenerationStatus: aiLog?.status || 'NOT_STARTED',
      totalPoints: milestones.reduce((sum, m) => sum + (m.points || 0), 0),
    });
  }

  /**
   * Approve AI-generated milestones (move from DRAFT to OPEN)
   */
  static async approveMilestones(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const { milestoneUpdates } = req.body; // Allow editing before approval

    const project = await prisma.project.findUnique({
      where: { id },
    });

    if (!project) {
      throw new AppError('Project not found', 404);
    }

    if (project.sponsorId !== req.user!.id) {
      throw new AppError('Only the project sponsor can approve milestones', 403);
    }

    // Update milestones if changes provided
    if (milestoneUpdates && Array.isArray(milestoneUpdates)) {
      for (const update of milestoneUpdates) {
        if (update.id) {
          await prisma.milestone.update({
            where: { id: update.id },
            data: {
              ...(update.title && { title: update.title }),
              ...(update.description && { description: update.description }),
              ...(update.points !== undefined && { points: update.points }),
            },
          });
        }

        // Update sub-milestones
        if (update.subMilestones) {
          for (const subUpdate of update.subMilestones) {
            if (subUpdate.id) {
              await prisma.subMilestone.update({
                where: { id: subUpdate.id },
                data: {
                  ...(subUpdate.description && {
                    description: subUpdate.description,
                  }),
                  ...(subUpdate.checkpointAmount !== undefined && {
                    checkpointAmount: subUpdate.checkpointAmount,
                  }),
                  ...(subUpdate.checkpointsCount !== undefined && {
                    checkpointsCount: subUpdate.checkpointsCount,
                  }),
                },
              });
            }
          }
        }
      }
    }

    // Move all OPEN milestones to CLAIMED (approve them)
    await prisma.milestone.updateMany({
      where: {
        projectId: id,
        status: 'OPEN',
      },
      data: {
        status: 'OPEN',
      },
    });

    await prisma.subMilestone.updateMany({
      where: {
        milestone: {
          projectId: id,
        },
        status: 'OPEN',
      },
      data: {
        status: 'OPEN',
      },
    });

    // Update project status
    await prisma.project.update({
      where: { id },
      data: {
        status: 'ACTIVE',
      },
    });

    await publishEvent(KAFKA_TOPICS.AI_MILESTONES_GENERATED, {
      projectId: id,
      approved: true,
      userId: req.user!.id,
    });

    res.json({
      message: 'Milestones approved successfully',
      status: 'APPROVED',
    });
  }

  /**
   * Get funding quote (calculate required token amount based on points)
   */
  static async getFundingQuote(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const { tokenAddress, mode } = req.body;

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        milestones: {
          include: {
            subMilestones: true,
          },
        },
      },
    });

    if (!project) {
      throw new AppError('Project not found', 404);
    }

    // Calculate total points
    let totalPoints = 0;
    for (const milestone of project.milestones) {
      for (const subMilestone of milestone.subMilestones) {
        totalPoints += Number(subMilestone.checkpointAmount) * subMilestone.checkpointsCount;
      }
    }

    // TODO: Get token price from oracle (Chainlink)
    // For now, assume 1:1 with USDC
    const tokenAmount = totalPoints.toString();

    // Get blockchain service for deposit instructions
    // Future: Implement blockchain verification
    // const depositData = await blockchainService.prepareDeposit(project.id, tokenAmount);

    res.json({
      projectId: id,
      totalPoints,
      tokenAmount,
      tokenAddress: tokenAddress || 'NATIVE',
      mode: mode || 'ESCROW',
      estimatedGas: '0.001', // ETH
      // depositInstructions: depositData,
    });
  }

  /**
   * Fund project (record on-chain deposit)
   */
  static async fundProject(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const { amount, token, mode, onchainTxHash } = req.body;

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      throw new AppError('Project not found', 404);
    }

    if (project.sponsorId !== req.user!.id) {
      throw new AppError('Only the project sponsor can fund this project', 403);
    }

    // Create funding record
    const funding = await prisma.projectFunding.create({
      data: {
        projectId: id,
        sponsorId: req.user!.id,
        token,
        amount,
        mode,
        onchainTxHash,
        remainingAmount: amount,
      },
    });

    // Update project payment mode and status
    await prisma.project.update({
      where: { id },
      data: {
        paymentMode: mode,
        status: 'ACTIVE',
      },
    });

    // Emit funding event
    await publishEvent(KAFKA_TOPICS.PROJECT_FUNDED, {
      projectId: id,
      fundingId: funding.id,
      amount,
      token,
      mode,
      txHash: onchainTxHash,
    });

    res.json({
      message: 'Project funded successfully',
      funding,
    });
  }
}
