import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { publishEvent, KAFKA_TOPICS } from '../lib/kafka';
import { inngest } from '../lib/inngest';
import { logger } from '../utils/logger';
import { escrowService } from '../services/escrow.service';

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
    const currentUser = req.user;

    // Build where clause based on user role
    const where: any = {
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
    };

    // Contributors should only see ACTIVE projects (not DRAFT)
    // unless they are viewing their own sponsored projects
    if (currentUser?.role === 'CONTRIBUTOR') {
      // If viewing own sponsored projects, show all
      if (sponsorId && sponsorId === currentUser.id) {
        // Allow viewing own projects regardless of status
      } else {
        // Only show ACTIVE projects for browsing
        where.status = 'ACTIVE';
      }
    }

    const projects = await prisma.project.findMany({
      where,
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

    // If user is logged in, add access information for each project
    let projectsWithAccess = projects;
    if (currentUser) {
      const projectIds = projects.map((p) => p.id);

      // Get all join requests for this user
      const joinRequests = await prisma.joinRequest.findMany({
        where: {
          userId: currentUser.id,
          projectId: { in: projectIds },
        },
        select: {
          projectId: true,
          status: true,
        },
      });

      // Create a map of projectId -> joinRequest status
      const joinRequestMap = new Map(joinRequests.map((jr) => [jr.projectId, jr.status]));

      projectsWithAccess = projects.map((project) => {
        const isOwner = project.sponsorId === currentUser.id;
        const joinRequestStatus = joinRequestMap.get(project.id);

        // Determine if user has access
        let hasAccess = isOwner;
        if (project.repoType === 'PUBLIC') {
          hasAccess = true;
        } else if (project.repoType === 'PRIVATE_REQUEST') {
          hasAccess = isOwner || joinRequestStatus === 'ACCEPTED';
        } else if (project.repoType === 'PRIVATE_INVITE' || project.repoType === 'PRIVATE') {
          hasAccess = isOwner;
        }

        return {
          ...project,
          hasAccess,
          joinRequestStatus: joinRequestStatus || null,
        };
      });
    }

    res.json({ projects: projectsWithAccess });
  }

  /**
   * Get project by ID
   */
  static async getProjectById(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const currentUser = req.user;

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

    // Add access information if user is logged in
    let projectWithAccess: any = project;
    if (currentUser) {
      const isOwner = project.sponsorId === currentUser.id;

      // Check for join request
      const joinRequest = await prisma.joinRequest.findUnique({
        where: {
          projectId_userId: {
            projectId: id,
            userId: currentUser.id,
          },
        },
        select: {
          status: true,
        },
      });

      // Determine if user has access
      let hasAccess = isOwner;
      if (project.repoType === 'PUBLIC') {
        hasAccess = true;
      } else if (project.repoType === 'PRIVATE_REQUEST') {
        hasAccess = isOwner || joinRequest?.status === 'ACCEPTED';
      } else if (project.repoType === 'PRIVATE_INVITE' || project.repoType === 'PRIVATE') {
        hasAccess = isOwner;
      }

      projectWithAccess = {
        ...project,
        hasAccess,
        joinRequestStatus: joinRequest?.status || null,
      };
    }

    res.json({ project: projectWithAccess });
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

  /**
   * Submit project to onchain (Merkle tree generation + milestone registration)
   */
  static async submitProjectOnchain(req: AuthRequest, res: Response) {
    const { id } = req.params;

    // Get project with milestones
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

    // Only sponsor can submit project onchain
    if (project.sponsorId !== req.user!.id) {
      throw new AppError('Only the project sponsor can submit the project onchain', 403);
    }

    // Only DRAFT projects can be submitted
    if (project.status !== 'DRAFT') {
      throw new AppError('Only DRAFT projects can be submitted onchain', 400);
    }

    // Check if there are milestones
    if (project.milestones.length === 0) {
      throw new AppError('Project must have at least one milestone before submitting onchain', 400);
    }

    try {
      // Submit to onchain (generates Merkle tree and stores root)
      const result = await escrowService.submitProjectOnchain(id);

      logger.info(
        `Project ${id} submitted onchain. Merkle root: ${result.merkleRoot}, Project hash: ${result.projectHash}`
      );

      res.json({
        success: true,
        message: 'Project submitted to onchain successfully',
        merkleRoot: result.merkleRoot,
        projectHash: result.projectHash,
        txHash: result.txHash,
      });
    } catch (error) {
      logger.error('Error submitting project onchain:', error);
      throw new AppError(
        'Failed to submit project onchain: ' +
          (error instanceof Error ? error.message : 'Unknown error'),
        500
      );
    }
  }

  /**
   * Deposit funds to escrow for project
   */
  static async depositToEscrow(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const { amount, tokenAddress } = req.body;

    if (!amount || parseFloat(amount) <= 0) {
      throw new AppError('Invalid deposit amount', 400);
    }

    const project = await prisma.project.findUnique({
      where: { id },
    });

    if (!project) {
      throw new AppError('Project not found', 404);
    }

    // Only sponsor can deposit to escrow
    if (project.sponsorId !== req.user!.id) {
      throw new AppError('Only the project sponsor can deposit to escrow', 403);
    }

    // Project must be submitted onchain first
    if (!project.onchainContractAddress) {
      throw new AppError('Project must be submitted onchain before depositing to escrow', 400);
    }

    try {
      const result = await escrowService.depositToEscrow(id, amount, tokenAddress);

      logger.info(`Deposited ${amount} to escrow for project ${id}`);

      res.json({
        success: true,
        message: 'Funds deposited to escrow successfully. Project is now ACTIVE.',
        txHash: result.txHash,
        escrowPoolId: result.escrowPoolId,
        totalDeposited: result.totalDeposited,
      });
    } catch (error) {
      logger.error('Error depositing to escrow:', error);
      throw new AppError(
        'Failed to deposit to escrow: ' +
          (error instanceof Error ? error.message : 'Unknown error'),
        500
      );
    }
  }

  /**
   * Get escrow balance for project
   */
  static async getEscrowBalance(req: AuthRequest, res: Response) {
    const { id } = req.params;

    try {
      const balance = await escrowService.getEscrowBalance(id);

      res.json({
        success: true,
        balance,
      });
    } catch (error) {
      logger.error('Error getting escrow balance:', error);
      throw error;
    }
  }
}
