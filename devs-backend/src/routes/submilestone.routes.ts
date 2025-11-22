import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { prisma } from '../lib/prisma';
import { publishEvent, KAFKA_TOPICS } from '../lib/kafka';
import multer from 'multer';
import { uploadFile } from '../services/s3.service';
import { aiMergeService } from '../services/ai-merge.service';
import { uiReviewService } from '../services/ui-review.service';
import { inngest } from '../lib/inngest';

const router: Router = Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (_req, file, cb) => {
    // Only allow images
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

// Submit PR for a submilestone
router.post(
  '/:id/submit-pr',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  upload.array('screenshots', 5), // Max 5 screenshots
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { prUrl, prNumber, notes } = req.body;
    const files = req.files as Express.Multer.File[];

    if (!prUrl) {
      throw new AppError('PR URL is required', 400);
    }

    // Verify submilestone exists
    const submilestone = await prisma.subMilestone.findUnique({
      where: { id },
      include: {
        milestone: {
          include: {
            project: true,
          },
        },
      },
    });

    if (!submilestone) {
      throw new AppError('Submilestone not found', 404);
    }

    // Check if user has access to submit (must be assigned or project is open)
    const contribution = await prisma.contribution.findFirst({
      where: {
        subMilestoneId: id,
        contributorId: req.user!.id,
        status: 'IN_PROGRESS',
      },
    });

    if (!contribution) {
      throw new AppError('You must be assigned to this task to submit a PR', 403);
    }

    // Check if PR already submitted
    const existingSubmission = await prisma.pRSubmission.findFirst({
      where: {
        subMilestoneId: id,
        contributorId: req.user!.id,
        status: {
          in: ['PENDING', 'AI_REVIEW', 'SPONSOR_REVIEW', 'APPROVED'],
        },
      },
    });

    if (existingSubmission) {
      throw new AppError('You already have an active PR submission for this task', 400);
    }

    // Create PR submission
    const prSubmission = await prisma.pRSubmission.create({
      data: {
        subMilestoneId: id,
        contributorId: req.user!.id,
        prUrl,
        prNumber: prNumber ? parseInt(prNumber) : undefined,
        notes,
        status: 'PENDING',
      },
    });

    // Upload screenshots if provided
    if (files && files.length > 0) {
      const screenshotPromises = files.map(async (file) => {
        const key = `pr-submissions/${prSubmission.id}/${Date.now()}-${file.originalname}`;
        const s3Result = await uploadFile(file.buffer, key, file.mimetype);

        return prisma.uIScreenshot.create({
          data: {
            prSubmissionId: prSubmission.id,
            s3Key: key,
            s3Url: s3Result.url,
            filename: file.originalname,
            mimeType: file.mimetype,
            size: file.size,
          },
        });
      });

      await Promise.all(screenshotPromises);
    }

    // Fetch complete submission with screenshots
    const completeSubmission = await prisma.pRSubmission.findUnique({
      where: { id: prSubmission.id },
      include: {
        screenshots: true,
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

    // Publish event for AI review workflow
    await publishEvent(KAFKA_TOPICS.PR_SUBMITTED, {
      prSubmissionId: prSubmission.id,
      projectId: submilestone.milestone.project.id,
      milestoneId: submilestone.milestoneId,
      subMilestoneId: id,
      contributorId: req.user!.id,
      prUrl,
      prNumber,
      hasScreenshots: files && files.length > 0,
      timestamp: new Date().toISOString(),
    });

    res.status(201).json({ prSubmission: completeSubmission });
  })
);

// Get PR submissions for a submilestone
router.get(
  '/:id/submissions',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const submilestone = await prisma.subMilestone.findUnique({
      where: { id },
    });

    if (!submilestone) {
      throw new AppError('Submilestone not found', 404);
    }

    const submissions = await prisma.pRSubmission.findMany({
      where: { subMilestoneId: id },
      include: {
        contributor: {
          select: {
            id: true,
            githubUsername: true,
            avatarUrl: true,
          },
        },
        screenshots: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json({ submissions });
  })
);

// Get single PR submission
router.get(
  '/submissions/:submissionId',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  asyncHandler(async (req, res) => {
    const { submissionId } = req.params;

    const submission = await prisma.pRSubmission.findUnique({
      where: { id: submissionId },
      include: {
        contributor: {
          select: {
            id: true,
            githubUsername: true,
            avatarUrl: true,
          },
        },
        screenshots: true,
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

    if (!submission) {
      throw new AppError('PR submission not found', 404);
    }

    res.json({ submission });
  })
);

// Sponsor review PR submission
router.put(
  '/submissions/:submissionId/review',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  asyncHandler(async (req, res) => {
    const { submissionId } = req.params;
    const { approved, feedback } = req.body;

    const submission = await prisma.pRSubmission.findUnique({
      where: { id: submissionId },
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

    if (!submission) {
      throw new AppError('PR submission not found', 404);
    }

    // Only sponsor can review
    if (submission.subMilestone.milestone.project.sponsorId !== req.user!.id) {
      throw new AppError('Only the project sponsor can review PR submissions', 403);
    }

    // Update submission status
    const updatedSubmission = await prisma.pRSubmission.update({
      where: { id: submissionId },
      data: {
        status: approved ? 'APPROVED' : 'REJECTED',
        sponsorFeedback: feedback,
      },
      include: {
        contributor: {
          select: {
            id: true,
            githubUsername: true,
            avatarUrl: true,
          },
        },
        screenshots: true,
      },
    });

    // If approved, update contribution status
    if (approved) {
      await prisma.contribution.updateMany({
        where: {
          subMilestoneId: submission.subMilestoneId,
          contributorId: submission.contributorId,
          status: 'IN_PROGRESS',
        },
        data: {
          status: 'COMPLETED',
        },
      });
    }

    // Publish event for notifications
    await publishEvent(KAFKA_TOPICS.PROJECT_UPDATED, {
      projectId: submission.subMilestone.milestone.project.id,
      type: approved ? 'pr_approved' : 'pr_rejected',
      prSubmissionId: submissionId,
      contributorId: submission.contributorId,
      feedback,
      timestamp: new Date().toISOString(),
    });

    res.json({ submission: updatedSubmission });
  })
);

// AI/CodeRabbit PR verification (trigger workflow)
router.post(
  '/pr-submissions/:id/ai/verify',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const prSubmission = await prisma.pRSubmission.findUnique({
      where: { id },
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
      throw new AppError('PR submission not found', 404);
    }

    // Trigger Inngest workflow for AI + CodeRabbit verification
    await inngest.send({
      name: 'pr/submitted',
      data: {
        prSubmissionId: id,
        prUrl: prSubmission.prUrl,
        prNumber: prSubmission.prNumber,
        projectId: prSubmission.subMilestone.milestone.project.id,
        repositoryUrl: prSubmission.subMilestone.milestone.project.repositoryUrl,
        contributorId: prSubmission.contributorId,
      },
    });

    res.json({
      message: 'AI verification started',
      prSubmissionId: id,
    });
  })
);

// Execute AI merge (after verification)
router.post(
  '/pr-submissions/:id/ai/merge',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const prSubmission = await prisma.pRSubmission.findUnique({
      where: { id },
    });

    if (!prSubmission) {
      throw new AppError('PR submission not found', 404);
    }

    // Execute merge
    const merged = await aiMergeService.executeMerge(id);

    res.json({
      success: merged,
      message: merged ? 'PR merged successfully' : 'PR merge failed',
      prSubmissionId: id,
    });
  })
);

// Upload contributor screenshot (UI tasks)
router.post(
  '/pr-submissions/:id/ui/contributor-screenshot',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  upload.single('screenshot'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const file = req.file;
    const userId = (req as any).user.id; // eslint-disable-line @typescript-eslint/no-explicit-any

    if (!file) {
      throw new AppError('Screenshot file is required', 400);
    }

    const result = await uiReviewService.uploadContributorScreenshot(id, file, userId);

    res.json({
      message: 'Contributor screenshot uploaded successfully',
      url: result.url,
      s3Key: result.s3Key,
    });
  })
);

// Upload sponsor reference screenshot (UI tasks)
router.post(
  '/pr-submissions/:id/ui/sponsor-screenshot',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  upload.single('screenshot'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const file = req.file;
    const userId = (req as any).user.id; // eslint-disable-line @typescript-eslint/no-explicit-any

    if (!file) {
      throw new AppError('Screenshot file is required', 400);
    }

    const result = await uiReviewService.uploadSponsorScreenshot(id, file, userId);

    res.json({
      message: 'Sponsor screenshot uploaded successfully',
      url: result.url,
      s3Key: result.s3Key,
    });
  })
);

// Generate UI comparison score
router.post(
  '/pr-submissions/:id/ui/analyze',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const comparison = await uiReviewService.generateUIScore(id);

    res.json({
      message: 'UI analysis completed',
      comparison,
    });
  })
);

// Sponsor approve UI PR
router.post(
  '/pr-submissions/:id/ui/approve',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { feedback } = req.body;
    const userId = (req as any).user.id; // eslint-disable-line @typescript-eslint/no-explicit-any

    await aiMergeService.sponsorApprovePR(id, userId, feedback);

    res.json({
      message: 'PR approved and merge initiated',
      prSubmissionId: id,
    });
  })
);

// Sponsor reject UI PR
router.post(
  '/pr-submissions/:id/ui/reject',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { feedback } = req.body;
    const userId = (req as any).user.id; // eslint-disable-line @typescript-eslint/no-explicit-any

    if (!feedback) {
      throw new AppError('Feedback is required when rejecting a PR', 400);
    }

    await aiMergeService.sponsorRejectPR(id, userId, feedback);

    res.json({
      message: 'PR rejected',
      prSubmissionId: id,
    });
  })
);

// Get UI review status
router.get(
  '/pr-submissions/:id/ui/status',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const status = await uiReviewService.getReviewStatus(id);

    res.json(status);
  })
);

export default router;
