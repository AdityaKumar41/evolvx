import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { prisma } from '../lib/prisma';
import { publishEvent, KAFKA_TOPICS } from '../lib/kafka';
import { inngest } from '../lib/inngest';
import { z } from 'zod';

const router: Router = Router();

// Validation schemas
const createProjectSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().optional(),
  repositoryUrl: z.string().url().optional(),
  tokenNetwork: z.enum(['base', 'polygon', 'arbitrum']).optional(),
  tokenAddress: z.string().optional(),
  orgId: z.string().uuid(),
  repoType: z
    .enum(['PUBLIC', 'PRIVATE', 'PRIVATE_INVITE', 'PRIVATE_REQUEST', 'OPEN_EVENT'])
    .optional(),
});

const fundProjectSchema = z.object({
  amount: z.string(),
  token: z.string(),
  mode: z.enum(['ESCROW', 'YIELD']),
  onchainTxHash: z.string(),
});

// Create project - allow any authenticated user (they must have SPONSOR role from onboarding)
router.post(
  '/',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  asyncHandler(async (req, res) => {
    // Check if user has SPONSOR role
    if (req.user!.role !== 'SPONSOR' && req.user!.role !== 'ADMIN') {
      throw new AppError(
        'Only sponsors can create projects. Please update your role in settings.',
        403
      );
    }
    const body = createProjectSchema.parse(req.body);

    const project = await prisma.project.create({
      data: {
        ...body,
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

    // Trigger repository analysis if repositoryUrl is provided
    if (project.repositoryUrl) {
      try {
        // Trigger Inngest workflow
        await inngest.send({
          name: 'repo/analysis.requested',
          data: {
            projectId: project.id,
            repositoryUrl: project.repositoryUrl,
            userId: req.user!.id,
          },
        });

        // Also publish Kafka event for other consumers
        await publishEvent(KAFKA_TOPICS.REPO_ANALYSIS_REQUESTED, {
          projectId: project.id,
          repositoryUrl: project.repositoryUrl,
          userId: req.user!.id,
          timestamp: new Date().toISOString(),
        });

        // Update project to indicate analysis is queued
        await prisma.project.update({
          where: { id: project.id },
          data: { repoAnalysisStatus: 'QUEUED' },
        });
      } catch (error) {
        // Don't fail project creation if analysis trigger fails
        console.error('Failed to trigger repository analysis:', error);
      }
    }

    res.status(201).json({
      project,
      message: project.repositoryUrl
        ? 'Project created successfully. Repository analysis started in background.'
        : 'Project created successfully.',
    });
  })
);

// Get all projects (with optional filters)
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { status, sponsorId } = req.query;

    const projects = await prisma.project.findMany({
      where: {
        ...(status && { status: status as any }), // eslint-disable-line @typescript-eslint/no-explicit-any
        ...(sponsorId && { sponsorId: sponsorId as string }),
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
  })
);

// Get project by ID
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
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
  })
);

// Fund project
router.post(
  '/:id/fund',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  authorize('SPONSOR', 'ADMIN') as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const body = fundProjectSchema.parse(req.body);

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      throw new AppError('Project not found', 404);
    }

    if (project.sponsorId !== req.user!.id) {
      throw new AppError('Only the project sponsor can fund this project', 403);
    }

    const funding = await prisma.projectFunding.create({
      data: {
        projectId: id,
        sponsorId: req.user!.id,
        token: body.token,
        amount: body.amount,
        mode: body.mode,
        onchainTxHash: body.onchainTxHash,
        remainingAmount: body.amount,
      },
    });

    // Update project status to ACTIVE
    await prisma.project.update({
      where: { id },
      data: { status: 'ACTIVE', paymentMode: body.mode },
    });

    // Publish event
    await publishEvent(KAFKA_TOPICS.PROJECT_FUNDED, {
      projectId: id,
      fundingId: funding.id,
      amount: body.amount,
      mode: body.mode,
      timestamp: new Date().toISOString(),
    });

    res.json({ funding, message: 'Project funded successfully' });
  })
);

// Trigger AI milestone generation
router.post(
  '/:id/ai/generate',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  authorize('SPONSOR', 'ADMIN') as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { prompt, documentUrl } = req.body;

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      throw new AppError('Project not found', 404);
    }

    if (project.sponsorId !== req.user!.id) {
      throw new AppError('Only the project sponsor can generate milestones', 403);
    }

    // Publish event for Inngest to handle
    await publishEvent(KAFKA_TOPICS.AI_MILESTONES_GENERATED, {
      projectId: id,
      prompt,
      documentUrl,
      requestedBy: req.user!.id,
      timestamp: new Date().toISOString(),
    });

    res.json({
      message: 'AI milestone generation started',
      projectId: id,
    });
  })
);

// Submit join request for a private project
router.post(
  '/:id/join',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { message } = req.body;

    const project = await prisma.project.findUnique({
      where: { id },
    });

    if (!project) {
      throw new AppError('Project not found', 404);
    }

    // Only allow join requests for PRIVATE_REQUEST type projects
    if (project.repoType !== 'PRIVATE_REQUEST') {
      throw new AppError('Join requests are only allowed for PRIVATE_REQUEST projects', 400);
    }

    // Check if user already has a pending or accepted request
    const existingRequest = await prisma.joinRequest.findUnique({
      where: {
        projectId_userId: {
          projectId: id,
          userId: req.user!.id,
        },
      },
    });

    if (existingRequest) {
      if (existingRequest.status === 'ACCEPTED') {
        throw new AppError('You already have access to this project', 400);
      }
      if (existingRequest.status === 'PENDING') {
        throw new AppError('You already have a pending join request', 400);
      }
    }

    const joinRequest = await prisma.joinRequest.create({
      data: {
        projectId: id,
        userId: req.user!.id,
        message,
        status: 'PENDING',
      },
      include: {
        user: {
          select: {
            id: true,
            githubUsername: true,
            avatarUrl: true,
          },
        },
      },
    });

    // Publish event for notifications
    await publishEvent(KAFKA_TOPICS.PROJECT_UPDATED, {
      projectId: id,
      type: 'join_request_submitted',
      joinRequestId: joinRequest.id,
      userId: req.user!.id,
      timestamp: new Date().toISOString(),
    });

    res.status(201).json({ joinRequest });
  })
);

// Get join requests for a project (sponsor only)
router.get(
  '/:id/join-requests',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status } = req.query;

    const project = await prisma.project.findUnique({
      where: { id },
    });

    if (!project) {
      throw new AppError('Project not found', 404);
    }

    // Only sponsor can view join requests
    if (project.sponsorId !== req.user!.id) {
      throw new AppError('Only the project sponsor can view join requests', 403);
    }

    const joinRequests = await prisma.joinRequest.findMany({
      where: {
        projectId: id,
        ...(status && { status: status as any }), // eslint-disable-line @typescript-eslint/no-explicit-any
      },
      include: {
        user: {
          select: {
            id: true,
            githubUsername: true,
            avatarUrl: true,
            bio: true,
            skills: true,
          },
        },
        reviewer: {
          select: {
            id: true,
            githubUsername: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json({ joinRequests });
  })
);

// Approve join request
router.put(
  '/join-requests/:requestId/approve',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  asyncHandler(async (req, res) => {
    const { requestId } = req.params;

    const joinRequest = await prisma.joinRequest.findUnique({
      where: { id: requestId },
      include: { project: true },
    });

    if (!joinRequest) {
      throw new AppError('Join request not found', 404);
    }

    // Only sponsor can approve
    if (joinRequest.project.sponsorId !== req.user!.id) {
      throw new AppError('Only the project sponsor can approve join requests', 403);
    }

    if (joinRequest.status !== 'PENDING') {
      throw new AppError('Join request is not pending', 400);
    }

    const updatedRequest = await prisma.joinRequest.update({
      where: { id: requestId },
      data: {
        status: 'ACCEPTED',
        reviewedBy: req.user!.id,
        reviewedAt: new Date(),
      },
      include: {
        user: {
          select: {
            id: true,
            githubUsername: true,
            avatarUrl: true,
          },
        },
      },
    });

    // Publish event for notifications and GitHub access grant
    await publishEvent(KAFKA_TOPICS.PROJECT_UPDATED, {
      projectId: joinRequest.projectId,
      type: 'join_request_approved',
      joinRequestId: requestId,
      userId: joinRequest.userId,
      timestamp: new Date().toISOString(),
    });

    res.json({ joinRequest: updatedRequest });
  })
);

// Decline join request
router.put(
  '/join-requests/:requestId/decline',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  asyncHandler(async (req, res) => {
    const { requestId } = req.params;

    const joinRequest = await prisma.joinRequest.findUnique({
      where: { id: requestId },
      include: { project: true },
    });

    if (!joinRequest) {
      throw new AppError('Join request not found', 404);
    }

    // Only sponsor can decline
    if (joinRequest.project.sponsorId !== req.user!.id) {
      throw new AppError('Only the project sponsor can decline join requests', 403);
    }

    if (joinRequest.status !== 'PENDING') {
      throw new AppError('Join request is not pending', 400);
    }

    const updatedRequest = await prisma.joinRequest.update({
      where: { id: requestId },
      data: {
        status: 'DECLINED',
        reviewedBy: req.user!.id,
        reviewedAt: new Date(),
      },
      include: {
        user: {
          select: {
            id: true,
            githubUsername: true,
            avatarUrl: true,
          },
        },
      },
    });

    // Publish event for notifications
    await publishEvent(KAFKA_TOPICS.PROJECT_UPDATED, {
      projectId: joinRequest.projectId,
      type: 'join_request_declined',
      joinRequestId: requestId,
      userId: joinRequest.userId,
      timestamp: new Date().toISOString(),
    });

    res.json({ joinRequest: updatedRequest });
  })
);

// Update AI model selection for a project
router.put(
  '/:id/ai-model',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { aiModel } = req.body;

    if (!aiModel) {
      throw new AppError('AI model is required', 400);
    }

    // Verify project exists and user is sponsor
    const project = await prisma.project.findUnique({
      where: { id },
    });

    if (!project) {
      throw new AppError('Project not found', 404);
    }

    if (project.sponsorId !== req.user!.id) {
      throw new AppError('Only project sponsor can update AI model', 403);
    }

    // Validate model
    const validModels = [
      'gpt-4',
      'gpt-4-turbo',
      'claude-3-opus',
      'claude-3-sonnet',
      'openrouter-auto',
    ];

    if (!validModels.includes(aiModel)) {
      throw new AppError(`Invalid AI model. Valid options: ${validModels.join(', ')}`, 400);
    }

    // Update project
    const updatedProject = await prisma.project.update({
      where: { id },
      data: { aiModel },
    });

    res.json({
      message: 'AI model updated successfully',
      project: updatedProject,
    });
  })
);

// Get available AI models for a project
router.get(
  '/:id/ai-models',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id },
      select: { aiModel: true },
    });

    if (!project) {
      throw new AppError('Project not found', 404);
    }

    const models = [
      {
        id: 'gpt-4',
        name: 'GPT-4',
        provider: 'OpenAI',
        inputCostPer1K: 0.03,
        outputCostPer1K: 0.06,
        available: true,
        recommended: false,
      },
      {
        id: 'gpt-4-turbo',
        name: 'GPT-4 Turbo',
        provider: 'OpenAI',
        inputCostPer1K: 0.01,
        outputCostPer1K: 0.03,
        available: true,
        recommended: true,
      },
      {
        id: 'claude-3-opus',
        name: 'Claude 3 Opus',
        provider: 'Anthropic',
        inputCostPer1K: 0.015,
        outputCostPer1K: 0.075,
        available: true,
        recommended: false,
      },
      {
        id: 'claude-3-sonnet',
        name: 'Claude 3 Sonnet',
        provider: 'Anthropic',
        inputCostPer1K: 0.003,
        outputCostPer1K: 0.015,
        available: true,
        recommended: true,
      },
      {
        id: 'openrouter-auto',
        name: 'OpenRouter (Auto)',
        provider: 'OpenRouter',
        inputCostPer1K: 0.0,
        outputCostPer1K: 0.0,
        available: true,
        recommended: false,
        note: 'Free tier available',
      },
    ];

    res.json({
      currentModel: project.aiModel,
      availableModels: models,
    });
  })
);

export default router;
