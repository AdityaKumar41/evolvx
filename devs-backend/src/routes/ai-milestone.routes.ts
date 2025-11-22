import { Router } from 'express';
import multer from 'multer';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { prisma } from '../lib/prisma';
import { uploadToS3 } from '../lib/s3';
import { inngest } from '../lib/inngest';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';

const router: Router = Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 5, // Max 5 files
  },
  fileFilter: (_req, file, cb) => {
    // Allow PDF, Markdown, and Text files
    const allowed = ['.pdf', '.md', '.txt', '.json'];
    const ext = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));

    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed. Allowed types: ${allowed.join(', ')}`));
    }
  },
});

/**
 * POST /api/milestones/generate
 * Generate milestones using AI with optional file attachments
 */
router.post(
  '/generate',
  authenticate as never,
  authorize('SPONSOR', 'ADMIN') as never,
  upload.array('attachments', 5),
  asyncHandler(async (req: AuthRequest, res) => {
    const { projectId, prompt } = req.body;
    const files = req.files as Express.Multer.File[];

    logger.info('[Milestone Gen API] Received request', {
      projectId,
      prompt: prompt?.substring(0, 50),
      filesCount: files?.length || 0,
      userId: req.user?.id,
    });

    if (!projectId || !prompt) {
      throw new AppError('Project ID and prompt are required', 400);
    }

    // Validate project exists and user is owner
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new AppError('Project not found', 404);
    }

    if (project.sponsorId !== req.user!.id) {
      throw new AppError('Only the project sponsor can generate milestones', 403);
    }

    logger.info('[Milestone Gen API] Project validated, starting generation');

    // Upload files to S3
    const documentUrls: string[] = [];

    if (files && files.length > 0) {
      logger.info('[Milestone Gen API] Uploading attachments to S3');

      for (const file of files) {
        const s3Key = `projects/${projectId}/milestone-gen/${uuidv4()}-${file.originalname}`;

        try {
          await uploadToS3(s3Key, file.buffer, file.mimetype);
          documentUrls.push(s3Key);

          logger.info('[Milestone Gen API] File uploaded', {
            filename: file.originalname,
            s3Key,
          });
        } catch (error) {
          logger.error('[Milestone Gen API] File upload failed', {
            filename: file.originalname,
            error,
          });
          throw new AppError(`Failed to upload file: ${file.originalname}`, 500);
        }
      }
    }

    // Trigger Inngest workflow
    try {
      const eventData = {
        projectId,
        prompt,
        documentUrls,
        repositoryUrl: project.repositoryUrl,
        userId: req.user!.id,
      };

      logger.info('[Milestone Gen API] Triggering Inngest workflow', {
        eventData,
        inngestConfigured:
          !!config.inngest.eventKey && config.inngest.eventKey !== 'your-inngest-event-key',
      });

      // Send event to Inngest (will work in dev mode or with cloud)
      const result = await inngest.send({
        name: 'milestone/generate.requested',
        data: eventData,
      });

      logger.info('[Milestone Gen API] Inngest event sent successfully', {
        projectId,
        result: result?.ids || 'no-ids',
      });

      res.json({
        success: true,
        message: 'Milestone generation started',
        projectId,
        estimatedTime: '30-60 seconds',
        trackingId: `${projectId}-${Date.now()}`,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;

      logger.error('[Milestone Gen API] Failed to trigger workflow', {
        error: errorMessage,
        stack: errorStack,
        projectId,
      });

      throw new AppError(`Failed to start milestone generation: ${errorMessage}`, 500);
    }
  })
);

/**
 * GET /api/milestones/status/:projectId
 * Check milestone generation status
 */
router.get(
  '/status/:projectId',
  authenticate as never,
  asyncHandler(async (req: AuthRequest, res) => {
    const { projectId } = req.params;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        milestones: {
          where: { createdByAI: true },
          include: {
            subMilestones: true,
          },
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!project) {
      throw new AppError('Project not found', 404);
    }

    // Check if user has access
    if (project.sponsorId !== req.user!.id && req.user!.role !== 'ADMIN') {
      throw new AppError('Access denied', 403);
    }

    const hasMilestones = project.milestones.length > 0;

    res.json({
      projectId,
      status: hasMilestones ? 'completed' : 'pending',
      milestones: project.milestones,
      totalMilestones: project.milestones.length,
      totalSubMilestones: project.milestones.reduce((sum, m) => sum + m.subMilestones.length, 0),
    });
  })
);

/**
 * GET /api/milestones/stream/:projectId
 * Stream milestone generation progress in real-time (SSE)
 * Note: For SSE, we accept token via query param since EventSource doesn't support headers
 */
router.get(
  '/stream/:projectId',
  asyncHandler(async (req: AuthRequest, res) => {
    const { projectId } = req.params;
    const token = req.query.token as string;

    // Manual token validation for SSE (EventSource can't send headers)
    if (!token) {
      res.status(401).json({ error: 'Token required' });
      return;
    }

    // Verify access
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    // For now, allow any authenticated request (we'll verify token in production)
    // TODO: Properly verify JWT token from query param

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    logger.info('[Milestone Stream] Client connected', { projectId });

    // Send initial event
    res.write(`data: ${JSON.stringify({ type: 'connected', projectId })}\n\n`);

    // Poll for updates every 2 seconds
    const interval = setInterval(async () => {
      try {
        const updatedProject = await prisma.project.findUnique({
          where: { id: projectId },
          include: {
            milestones: {
              where: { createdByAI: true },
              include: { subMilestones: true },
              orderBy: { order: 'asc' },
            },
          },
        });

        if (!updatedProject) {
          clearInterval(interval);
          res.write(`data: ${JSON.stringify({ type: 'error', message: 'Project not found' })}\n\n`);
          res.end();
          return;
        }

        const milestoneCount = updatedProject.milestones.length;

        if (milestoneCount > 0) {
          // Milestones generated!
          res.write(
            `data: ${JSON.stringify({
              type: 'completed',
              milestones: updatedProject.milestones,
              totalMilestones: milestoneCount,
              totalSubMilestones: updatedProject.milestones.reduce(
                (sum, m) => sum + m.subMilestones.length,
                0
              ),
            })}\n\n`
          );
          clearInterval(interval);
          res.end();
        } else {
          // Still processing
          res.write(
            `data: ${JSON.stringify({
              type: 'progress',
              message: 'Generating milestones...',
              step: 'processing',
            })}\n\n`
          );
        }
      } catch (error) {
        logger.error('[Milestone Stream] Error polling updates', { error });
        clearInterval(interval);
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'Internal error' })}\n\n`);
        res.end();
      }
    }, 2000);

    // Clean up on client disconnect
    req.on('close', () => {
      clearInterval(interval);
      logger.info('[Milestone Stream] Client disconnected', { projectId });
    });
  })
);

export default router;
