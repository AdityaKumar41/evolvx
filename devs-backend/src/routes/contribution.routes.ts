import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { prisma } from '../lib/prisma';

const router: Router = Router();

// Get all contributions (with optional filters)
router.get(
  '/',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  asyncHandler(async (req, res) => {
    const { contributorId } = req.query;

    const where: any = {};
    if (contributorId) {
      where.contributorId = contributorId as string;
    }

    const contributions = await prisma.contribution.findMany({
      where,
      include: {
        contributor: {
          select: {
            id: true,
            githubUsername: true,
            avatarUrl: true,
          },
        },
        subMilestone: {
          select: {
            id: true,
            description: true,
            milestone: {
              select: {
                id: true,
                title: true,
                projectId: true,
              },
            },
          },
        },
        proof: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json({ contributions });
  })
);

// Get my contributions
router.get(
  '/my',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  asyncHandler(async (req, res) => {
    const contributions = await prisma.contribution.findMany({
      where: {
        contributorId: req.user!.id,
      },
      include: {
        subMilestone: {
          select: {
            id: true,
            description: true,
            milestone: {
              select: {
                id: true,
                title: true,
                project: {
                  select: {
                    id: true,
                    title: true,
                  },
                },
              },
            },
          },
        },
        proof: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json({ contributions });
  })
);

// Get contributions for a project
router.get(
  '/project/:projectId',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  asyncHandler(async (req, res) => {
    const { projectId } = req.params;

    const contributions = await prisma.contribution.findMany({
      where: {
        subMilestone: {
          milestone: {
            projectId,
          },
        },
      },
      include: {
        contributor: {
          select: {
            id: true,
            githubUsername: true,
            avatarUrl: true,
          },
        },
        subMilestone: {
          select: {
            id: true,
            description: true,
          },
        },
        proof: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json({ contributions });
  })
);

// Get contribution by ID
router.get(
  '/:id',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const contribution = await prisma.contribution.findUnique({
      where: { id },
      include: {
        contributor: true,
        subMilestone: {
          include: {
            milestone: true,
          },
        },
        proof: true,
      },
    });

    if (!contribution) {
      throw new AppError('Contribution not found', 404);
    }

    res.json({ contribution });
  })
);

export default router;
