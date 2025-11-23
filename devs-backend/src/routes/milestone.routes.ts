import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { prisma } from '../lib/prisma';
import { MilestoneController } from '../controllers/milestone.controller';
import multer from 'multer';

const router: Router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Create milestone for a project
router.post(
  '/project/:projectId',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  authorize('SPONSOR', 'ADMIN') as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const { title, description, subMilestones } = req.body;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new AppError('Project not found', 404);
    }

    if (project.sponsorId !== req.user!.id) {
      throw new AppError('Only the project sponsor can create milestones', 403);
    }

    // Get the highest order number
    const lastMilestone = await prisma.milestone.findFirst({
      where: { projectId },
      orderBy: { order: 'desc' },
    });

    // If no subMilestones provided, create 10 default ones
    const subMilestonesToCreate =
      subMilestones && subMilestones.length > 0
        ? subMilestones.map((sub: any) => ({
            description: sub.description,
            acceptanceCriteria: sub.acceptanceCriteria || {},
            checkpointAmount: sub.checkpointAmount || '0',
            checkpointsCount: sub.checkpointsCount || 1,
            estimateHours: sub.estimateHours || 8,
            status: 'OPEN',
          }))
        : Array.from({ length: 10 }, (_, i) => ({
            description: `Sub-task ${i + 1}: Define task requirements`,
            acceptanceCriteria: {},
            checkpointAmount: '0',
            checkpointsCount: 1,
            estimateHours: 8,
            status: 'OPEN',
          }));

    const milestone = await prisma.milestone.create({
      data: {
        projectId,
        title,
        description,
        order: (lastMilestone?.order || 0) + 1,
        status: 'OPEN',
        subMilestones: {
          create: subMilestonesToCreate,
        },
      },
      include: {
        subMilestones: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    res.status(201).json({ milestone });
  })
);

// Claim sub-milestone
router.post(
  '/:subMilestoneId/claim',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  authorize('DEVELOPER', 'CONTRIBUTOR') as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  asyncHandler(async (req, res) => {
    const { subMilestoneId } = req.params;
    const { branchUrl: _branchUrl } = req.body; // eslint-disable-line @typescript-eslint/no-unused-vars

    const subMilestone = await prisma.subMilestone.findUnique({
      where: { id: subMilestoneId },
    });

    if (!subMilestone) {
      throw new AppError('Sub-milestone not found', 404);
    }

    if (subMilestone.status !== 'OPEN') {
      throw new AppError('Sub-milestone is not available for claiming', 400);
    }

    const updated = await prisma.subMilestone.update({
      where: { id: subMilestoneId },
      data: {
        assignedTo: req.user!.id,
        status: 'CLAIMED',
      },
    });

    res.json({
      message: 'Sub-milestone claimed successfully',
      subMilestone: updated,
    });
  })
);

// Get milestones for a project
router.get(
  '/project/:projectId',
  asyncHandler(async (req, res) => {
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
  })
);

// Get detailed submilestone information
router.get(
  '/submilestone/:subMilestoneId',
  asyncHandler(MilestoneController.getSubMilestoneDetails)
);

// Update submilestone (sponsor only)
router.patch(
  '/submilestone/:subMilestoneId',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  authorize('SPONSOR', 'ADMIN') as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  asyncHandler(MilestoneController.updateSubMilestone)
);

// Upload reference images for submilestone
router.post(
  '/submilestone/:subMilestoneId/reference-images',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  authorize('SPONSOR', 'ADMIN') as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  upload.array('images', 10), // Max 10 images
  asyncHandler(MilestoneController.uploadReferenceImages)
);

// Delete reference image
router.delete(
  '/submilestone/:subMilestoneId/reference-images',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  authorize('SPONSOR', 'ADMIN') as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  asyncHandler(MilestoneController.deleteReferenceImage)
);

export default router;
