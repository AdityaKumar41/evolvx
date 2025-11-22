import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { inngest } from '../lib/inngest';
import { prisma } from '../lib/prisma';

const router: Router = Router();

/**
 * Manual trigger for repository analysis (for testing)
 * POST /api/test/trigger-repo-analysis/:projectId
 */
router.post(
  '/trigger-repo-analysis/:projectId',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  asyncHandler(async (req, res) => {
    const { projectId } = req.params;

    // Get project
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        repositoryUrl: true,
        sponsorId: true,
        repoAnalysisStatus: true,
      },
    });

    if (!project) {
      throw new AppError('Project not found', 404);
    }

    if (!project.repositoryUrl) {
      throw new AppError('Project has no repository URL', 400);
    }

    // Trigger Inngest workflow
    const result = await inngest.send({
      name: 'repo/analysis.requested',
      data: {
        projectId: project.id,
        repositoryUrl: project.repositoryUrl,
        userId: req.user!.id,
      },
    });

    res.json({
      message: 'Repository analysis triggered',
      eventIds: result.ids,
      project: {
        id: project.id,
        repositoryUrl: project.repositoryUrl,
        status: project.repoAnalysisStatus,
      },
    });
  })
);

/**
 * Check Qdrant embeddings for a project
 * GET /api/test/check-embeddings/:projectId
 */
router.get(
  '/check-embeddings/:projectId',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const { qdrantClient, QDRANT_COLLECTIONS } = await import('../lib/qdrant');

    try {
      // Search for embeddings with this projectId
      const result = await qdrantClient.scroll(QDRANT_COLLECTIONS.REPO_EMBEDDINGS, {
        filter: {
          must: [
            {
              key: 'projectId',
              match: { value: projectId },
            },
          ],
        },
        limit: 100,
        with_payload: true,
        with_vector: false,
      });

      res.json({
        projectId,
        embeddingsFound: result.points.length,
        embeddings: result.points.map((p) => ({
          id: p.id,
          filePath: p.payload?.filePath,
          language: p.payload?.fileType,
          complexity: p.payload?.complexity,
          purpose: p.payload?.purpose,
        })),
      });
    } catch (error) {
      throw new AppError(`Failed to query Qdrant: ${error}`, 500);
    }
  })
);

/**
 * Check project analysis status
 * GET /api/test/analysis-status/:projectId
 */
router.get(
  '/analysis-status/:projectId',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  asyncHandler(async (req, res) => {
    const { projectId } = req.params;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        title: true,
        repositoryUrl: true,
        repoAnalysisStatus: true,
        repoAnalysisStartedAt: true,
        repoAnalysisCompletedAt: true,
        repoAnalysisError: true,
        repoFilesIndexed: true,
        repoEmbeddingsCount: true,
      },
    });

    if (!project) {
      throw new AppError('Project not found', 404);
    }

    res.json({ project });
  })
);

export default router;
