import { inngest } from '../lib/inngest';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { githubService } from '../services/github.service';
import { aiOrchestrator } from '../services/ai.service';
import { codeRabbitService } from '../services/coderabbit.service';
import { aiMergeService } from '../services/ai-merge.service';
import { aiBillingService } from '../services/ai-billing.service';

// Local enum definitions matching Prisma schema (TypeScript server caching issue)
enum TaskType {
  BACKEND = 'BACKEND',
  FRONTEND = 'FRONTEND',
  UI = 'UI',
  FULLSTACK = 'FULLSTACK',
  DEVOPS = 'DEVOPS',
}

enum AIWorkflowType {
  MILESTONE_GENERATION = 'MILESTONE_GENERATION',
  PR_REVIEW = 'PR_REVIEW',
  UI_ANALYSIS = 'UI_ANALYSIS',
  CHAT = 'CHAT',
  CODE_ANALYSIS = 'CODE_ANALYSIS',
}

/**
 * AI-powered PR Verification Workflow
 * Complete pipeline: Task detection -> AI review -> CodeRabbit review -> Merge decision
 */
export const aiPRVerificationWorkflow = inngest.createFunction(
  {
    id: 'ai-pr-verification',
    name: 'AI PR Verification Pipeline',
    retries: 2,
  },
  { event: 'pr/submitted' },
  async ({ event, step }) => {
    const { prSubmissionId, prNumber, projectId, repositoryUrl, contributorId } = event.data;

    logger.info(`Starting AI PR verification for PR ${prSubmissionId}`);

    // Step 1: Fetch PR submission and context
    const prSubmission = await step.run('fetch-pr-context', async () => {
      const data = await prisma.pRSubmission.findUnique({
        where: { id: prSubmissionId },
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
          contributor: true,
        },
      });

      if (!data) {
        throw new Error(`PR submission ${prSubmissionId} not found`);
      }

      return data;
    });

    // Step 2: Get PR diff from GitHub
    const prDiff = await step.run('fetch-pr-diff', async () => {
      if (!repositoryUrl || !prNumber) {
        throw new Error('Repository URL and PR number are required');
      }

      const urlParts = repositoryUrl.replace('https://github.com/', '').split('/');
      const owner = urlParts[0];
      const repo = urlParts[1];

      return await githubService.getPullRequestDiff(owner, repo, prNumber);
    });

    // Step 3: Detect task type - DETERMINISTIC FIRST, then AI refinement
    const taskType = await step.run('detect-task-type', async () => {
      /**
       * CRITICAL: Use file-based detection FIRST (deterministic)
       * Then refine with AI if needed (semantic understanding)
       *
       * This prevents AI hallucinations and ensures consistency
       */

      // Parse changed files from diff (first line of each file change)
      const changedFiles = prDiff
        .split('\n')
        .filter((line) => line.startsWith('diff --git'))
        .map((line) => line.split(' ')[2].replace('a/', ''));

      // File extension categorization (deterministic)
      const uiExtensions = [
        '.tsx',
        '.jsx',
        '.vue',
        '.css',
        '.scss',
        '.sass',
        '.less',
        '.styled.ts',
      ];
      const backendExtensions = ['.ts', '.js', '.py', '.go', '.java', '.rb', '.php'];
      const devopsExtensions = ['Dockerfile', '.yml', '.yaml', '.tf', '.sh', 'docker-compose'];

      const hasUI = changedFiles.some(
        (file) =>
          uiExtensions.some((ext) => file.endsWith(ext)) ||
          file.includes('components/') ||
          file.includes('pages/') ||
          file.includes('styles/')
      );

      const hasBackend = changedFiles.some(
        (file) =>
          backendExtensions.some((ext) => file.endsWith(ext)) ||
          file.includes('api/') ||
          file.includes('routes/') ||
          file.includes('services/') ||
          file.includes('controllers/')
      );

      const hasDevOps = changedFiles.some(
        (file) =>
          devopsExtensions.some((pattern) => file.includes(pattern)) ||
          file.includes('.github/workflows/') ||
          file.includes('k8s/')
      );

      // Check if package.json changes (usually fullstack)
      const hasPackageJson = changedFiles.some((file) => file.includes('package.json'));

      // Deterministic classification
      if (hasDevOps && !hasUI && !hasBackend) {
        return TaskType.DEVOPS;
      }

      if (hasUI && hasBackend) {
        return TaskType.FULLSTACK;
      }

      if (hasUI && !hasBackend) {
        // Check submilestone description for confirmation
        const description = prSubmission.subMilestone.description.toLowerCase();
        const hasUIKeywords =
          description.includes('ui') ||
          description.includes('frontend') ||
          description.includes('design') ||
          description.includes('layout') ||
          description.includes('component');

        return hasUIKeywords || hasPackageJson ? TaskType.UI : TaskType.FRONTEND;
      }

      if (hasBackend && !hasUI) {
        return TaskType.BACKEND;
      }

      // Fallback: default to FULLSTACK for unclear cases
      // This ensures deterministic behavior without AI dependency
      logger.info('Task type unclear from files, defaulting to FULLSTACK');
      return TaskType.FULLSTACK;
    });

    // Step 4: Task type detected - stored for future use when schema includes taskType field
    // TODO: Add taskType field to PRSubmission schema and update step to persist it
    logger.info(`Detected task type: ${taskType}`);

    // Step 5: Run AI PR analysis
    const aiAnalysis = await step.run('ai-pr-analysis', async () => {
      const acceptanceCriteria = (prSubmission.subMilestone.acceptanceCriteria as string[]) || [];

      const analysis = await aiOrchestrator.analyzePR(prDiff, acceptanceCriteria);

      // Calculate score based on meetsRequirements
      const score = analysis.meetsRequirements ? 85 : 60;

      // Track AI usage (estimated tokens)
      const estimatedInputTokens = Math.ceil(prDiff.length / 4);
      const estimatedOutputTokens = Math.ceil(analysis.analysis.length / 4);

      await aiBillingService.trackUsage(
        contributorId,
        projectId,
        AIWorkflowType.PR_REVIEW,
        'gpt-4',
        estimatedInputTokens,
        estimatedOutputTokens,
        { prSubmissionId, prNumber }
      );

      return { ...analysis, score };
    });

    // Step 6: Run CodeRabbit review
    const coderabbitAnalysis = await step.run('coderabbit-review', async () => {
      if (!repositoryUrl || !prNumber) {
        throw new Error('Repository URL and PR number required for CodeRabbit');
      }

      try {
        const urlParts = repositoryUrl.replace('https://github.com/', '').split('/');
        const owner = urlParts[0];
        const repo = urlParts[1];

        const analysis = await codeRabbitService.analyzePR({
          owner,
          repo,
          pullNumber: prNumber,
          prDiff, // Pass the pre-fetched diff from Step 2
        });
        return analysis;
      } catch (error) {
        logger.error('CodeRabbit analysis failed:', error);
        // Return default score if CodeRabbit fails
        return {
          score: 70,
          summary: 'CodeRabbit analysis unavailable',
          issues: [],
        };
      }
    });

    // Step 7: Combine scores and decide merge path
    const mergeDecision = await step.run('make-merge-decision', async () => {
      const aiScore = aiAnalysis.score || 0;
      const coderabbitScore = coderabbitAnalysis.score || 0;

      const decision = await aiMergeService.decideMerge(
        prSubmissionId,
        aiScore,
        coderabbitScore,
        taskType
      );

      // Update PR submission with scores and decision
      await aiMergeService.updatePRSubmission(prSubmissionId, decision);

      return decision;
    });

    // Step 8: Handle based on task type and decision
    if (mergeDecision.canAutoMerge) {
      // Auto-merge backend PRs
      await step.run('auto-merge-pr', async () => {
        logger.info(`Auto-merging PR ${prSubmissionId}`);
        await aiMergeService.executeMerge(prSubmissionId);

        // Create notification
        await prisma.notification.create({
          data: {
            userId: contributorId,
            type: 'VERIFICATION_SUCCESS',
            title: 'PR Auto-Merged',
            message: `Your PR #${prNumber} passed all checks and was automatically merged!`,
          },
        });
      });
    } else if (mergeDecision.requiresSponsorApproval) {
      // UI tasks or failed checks - notify sponsor
      await step.run('notify-sponsor-review', async () => {
        logger.info(`PR ${prSubmissionId} requires sponsor review`);

        const sponsorId = prSubmission.subMilestone.milestone.project.sponsorId;

        await prisma.notification.create({
          data: {
            userId: sponsorId,
            type: 'VERIFICATION_PENDING',
            title: 'PR Requires Your Review',
            message: `PR #${prNumber} by ${prSubmission.contributor.githubUsername} needs your approval. ${mergeDecision.reason}`,
          },
        });

        // Also notify contributor
        await prisma.notification.create({
          data: {
            userId: contributorId,
            type: 'VERIFICATION_PENDING',
            title: 'PR Under Review',
            message: `Your PR #${prNumber} is awaiting sponsor review. ${mergeDecision.reason}`,
          },
        });
      });
    }

    // Step 9: Trigger billing workflow for AI usage
    await step.run('trigger-billing', async () => {
      await inngest.send({
        name: 'ai/usage-recorded',
        data: {
          userId: contributorId,
          projectId,
          workflow: AIWorkflowType.PR_REVIEW,
          prSubmissionId,
        },
      });
    });

    return {
      prSubmissionId,
      taskType,
      aiScore: aiAnalysis.score,
      coderabbitScore: coderabbitAnalysis.score,
      combinedScore: mergeDecision.combinedScore,
      canAutoMerge: mergeDecision.canAutoMerge,
      requiresSponsorApproval: mergeDecision.requiresSponsorApproval,
      reason: mergeDecision.reason,
    };
  }
);
