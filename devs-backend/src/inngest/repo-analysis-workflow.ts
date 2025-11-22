import { inngest } from '../lib/inngest';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { repositoryAnalyzerService } from '../services/repo-analyzer.service';
import { publishEvent, KAFKA_TOPICS } from '../lib/kafka';

// Input schema
const RepoAnalysisInput = z.object({
  projectId: z.string(),
  repositoryUrl: z.string(),
  userId: z.string(),
});

/**
 * Repository Analysis Workflow
 *
 * Orchestrates deep repository analysis using:
 * - CodeRabbit for high-level insights
 * - Claude AI for semantic code understanding
 * - Qdrant for vector storage
 * - Kafka for progress events
 */
export const repositoryAnalysisWorkflow = inngest.createFunction(
  {
    id: 'repository-analysis-workflow',
    name: 'Repository Analysis Workflow',
    retries: 2,
    concurrency: [
      {
        limit: 3, // Max 3 concurrent repo analyses
        key: 'event.data.userId',
      },
    ],
  },
  { event: 'repo/analysis.requested' },
  async ({ event, step }) => {
    const input = RepoAnalysisInput.parse(event.data);
    const startTime = Date.now();

    logger.info('[RepoAnalysis] Starting workflow', {
      projectId: input.projectId,
      repositoryUrl: input.repositoryUrl,
    });

    // Step 1: Validate project and check status
    const project = await step.run('validate-project', async () => {
      const proj = await prisma.project.findUnique({
        where: { id: input.projectId },
        select: {
          id: true,
          repositoryUrl: true,
          sponsorId: true,
          repoAnalysisStatus: true,
        },
      });

      if (!proj) {
        throw new Error('Project not found');
      }

      if (proj.sponsorId !== input.userId) {
        throw new Error('Only project sponsor can trigger repository analysis');
      }

      if (proj.repoAnalysisStatus === 'IN_PROGRESS') {
        throw new Error('Repository analysis already in progress');
      }

      if (!proj.repositoryUrl) {
        throw new Error('Project has no repository URL');
      }

      return proj;
    });

    // Step 2: Update status to IN_PROGRESS
    await step.run('update-status-started', async () => {
      await prisma.project.update({
        where: { id: input.projectId },
        data: {
          repoAnalysisStatus: 'IN_PROGRESS',
          repoAnalysisStartedAt: new Date(),
          repoAnalysisError: null,
        },
      });

      // Emit Kafka event for real-time updates
      await publishEvent(KAFKA_TOPICS.REPO_ANALYSIS_STARTED, {
        projectId: input.projectId,
        repositoryUrl: input.repositoryUrl,
        status: 'analyzing',
        stage: 'initializing',
        message: 'Starting repository analysis with CodeRabbit and Claude AI',
        timestamp: new Date().toISOString(),
      });

      logger.info('[RepoAnalysis] Status updated to IN_PROGRESS');
    });

    // Step 3: Analyze repository
    const analysisResult = await step.run('analyze-repository', async () => {
      try {
        logger.info('[RepoAnalysis] Starting repository analysis');

        // Get user's GitHub access token
        const user = await prisma.user.findUnique({
          where: { id: input.userId },
          select: { githubAccessToken: true, githubAccessTokenExpiry: true },
        });

        if (!user?.githubAccessToken) {
          throw new Error(
            'User GitHub access token not found. Please reconnect your GitHub account.'
          );
        }

        // Check if token is expired
        if (user.githubAccessTokenExpiry && user.githubAccessTokenExpiry < new Date()) {
          throw new Error('GitHub access token has expired. Please reconnect your GitHub account.');
        }

        const result = await repositoryAnalyzerService.analyzeRepository(
          input.projectId,
          input.repositoryUrl,
          user.githubAccessToken
        );

        logger.info('[RepoAnalysis] Analysis completed', {
          filesAnalyzed: result.filesAnalyzed,
          embeddingsCreated: result.embeddingsCreated,
        });

        return result;
      } catch (error) {
        logger.error('[RepoAnalysis] Analysis failed:', error);
        throw error;
      }
    });

    // Step 4: Update project with results
    await step.run('update-status-completed', async () => {
      await prisma.project.update({
        where: { id: input.projectId },
        data: {
          repoAnalysisStatus: 'COMPLETED',
          repoAnalysisCompletedAt: new Date(),
          repoFilesIndexed: analysisResult.filesAnalyzed,
          repoEmbeddingsCount: analysisResult.embeddingsCreated,
        },
      });

      logger.info('[RepoAnalysis] Project updated with results');
    });

    // Step 5: Emit completion event
    await step.run('emit-completion-event', async () => {
      const duration = Date.now() - startTime;

      await publishEvent(KAFKA_TOPICS.REPO_ANALYSIS_COMPLETED, {
        projectId: input.projectId,
        filesIndexed: analysisResult.filesAnalyzed,
        embeddingsCount: analysisResult.embeddingsCreated,
        duration,
        technologies: analysisResult.technologies,
        complexity: analysisResult.complexity,
        timestamp: new Date().toISOString(),
      });

      logger.info('[RepoAnalysis] Completion event emitted', {
        duration: `${(duration / 1000).toFixed(2)}s`,
      });
    });

    // Step 6: Send notification to sponsor
    await step.run('send-notification', async () => {
      try {
        await inngest.send({
          name: 'email/send',
          data: {
            to: project.sponsorId,
            subject: `🔍 Repository Analysis Complete`,
            template: 'repo-analysis-complete',
            data: {
              projectId: input.projectId,
              filesAnalyzed: analysisResult.filesAnalyzed,
              embeddingsCreated: analysisResult.embeddingsCreated,
              technologies: analysisResult.technologies.join(', '),
            },
          },
        });
      } catch (error) {
        logger.error('[RepoAnalysis] Failed to send notification:', error);
        // Don't fail the workflow if notification fails
      }
    });

    logger.info('[RepoAnalysis] Workflow completed successfully', {
      projectId: input.projectId,
      duration: `${((Date.now() - startTime) / 1000).toFixed(2)}s`,
    });

    return {
      success: true,
      projectId: input.projectId,
      filesAnalyzed: analysisResult.filesAnalyzed,
      embeddingsCreated: analysisResult.embeddingsCreated,
      technologies: analysisResult.technologies,
      complexity: analysisResult.complexity,
      duration: Date.now() - startTime,
    };
  }
);

/**
 * Error handler workflow
 * Catches failures and updates project status
 */
export const repositoryAnalysisErrorHandler = inngest.createFunction(
  {
    id: 'repository-analysis-error-handler',
    name: 'Repository Analysis Error Handler',
  },
  { event: 'inngest/function.failed' },
  async ({ event }) => {
    // Check if it's our workflow that failed
    if (event.data.function_id !== 'repository-analysis-workflow') {
      return;
    }

    const error = event.data.error;
    const projectId = event.data.event?.data?.projectId;

    if (!projectId) {
      logger.error('[RepoAnalysis] Error handler: No project ID in failed event');
      return;
    }

    logger.error('[RepoAnalysis] Workflow failed', {
      projectId,
      error: error.message,
    });

    // Update project status
    await prisma.project.update({
      where: { id: projectId },
      data: {
        repoAnalysisStatus: 'FAILED',
        repoAnalysisError: error.message || 'Unknown error',
      },
    });

    // Emit failure event
    await publishEvent(KAFKA_TOPICS.REPO_ANALYSIS_FAILED, {
      projectId,
      error: error.message || 'Unknown error',
      stage: error.stack || 'unknown',
      timestamp: new Date().toISOString(),
    });
  }
);
