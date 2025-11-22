import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { aiContextService } from '../services/ai-context.service';

const router: Router = Router();

// Get AI context for sidebar
router.get(
  '/context',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  asyncHandler(async (req, res) => {
    const userId = (req as any).user.id; // eslint-disable-line @typescript-eslint/no-explicit-any
    const { projectId, submilestoneId } = req.query;

    if (!projectId) {
      throw new AppError('Project ID is required', 400);
    }

    const context = await aiContextService.buildContext(
      userId,
      projectId as string,
      submilestoneId as string | undefined
    );

    res.json(context);
  })
);

// Search documents
router.get(
  '/search/documents',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  asyncHandler(async (req, res) => {
    const { query, projectId } = req.query;

    if (!query || !projectId) {
      throw new AppError('Query and project ID are required', 400);
    }

    const documents = await aiContextService.searchDocuments(query as string, projectId as string);

    res.json({ documents });
  })
);

// Get repository structure
router.get(
  '/repo-structure',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  asyncHandler(async (req, res) => {
    const { repositoryUrl } = req.query;

    if (!repositoryUrl) {
      throw new AppError('Repository URL is required', 400);
    }

    const structure = await aiContextService.getRepoStructure(repositoryUrl as string);

    res.json(structure);
  })
);

// Get UI templates for a project
router.get(
  '/ui-templates/:projectId',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  asyncHandler(async (req, res) => {
    const { projectId } = req.params;

    const templates = await aiContextService.getUITemplates(projectId);

    res.json({ templates });
  })
);

// Get milestone context
router.get(
  '/milestone/:milestoneId',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  asyncHandler(async (req, res) => {
    const { milestoneId } = req.params;

    const context = await aiContextService.getMilestoneContext(milestoneId);

    res.json(context);
  })
);

// Get submilestone details
router.get(
  '/submilestone/:submilestoneId',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  asyncHandler(async (req, res) => {
    const { submilestoneId } = req.params;

    const details = await aiContextService.getSubmilestoneDetails(submilestoneId);

    res.json(details);
  })
);

// Get acceptance criteria
router.get(
  '/submilestone/:submilestoneId/acceptance-criteria',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  asyncHandler(async (req, res) => {
    const { submilestoneId } = req.params;

    const criteria = await aiContextService.getAcceptanceCriteria(submilestoneId);

    res.json({ acceptanceCriteria: criteria });
  })
);

// Get verification rules
router.get(
  '/submilestone/:submilestoneId/verification-rules',
  authenticate as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  asyncHandler(async (req, res) => {
    const { submilestoneId } = req.params;

    const rules = await aiContextService.getVerificationRules(submilestoneId);

    res.json({ verificationRules: rules });
  })
);

export default router;
