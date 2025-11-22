import { inngest } from '../lib/inngest';
import { aiOrchestrator } from '../services/ai.service';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { qdrant, QDRANT_COLLECTIONS } from '../lib/qdrant';

// Import new workflows
import { aiMilestoneGeneration } from './ai-milestone-generation';
import { aiMilestoneGenerationWorkflow } from './ai-milestone-workflow';
import { prVerificationWorkflow, testHarnessExecution } from './pr-verification';
// import { autoYieldHarvest } from './yield-harvesting'; // POSTPONED: Over-engineered for MVP, move to v2
import { aiPRVerificationWorkflow } from './ai-pr-verification';
import { uiSponsorApproveWorkflow } from './ui-sponsor-approve';
import { aiBillingWorkflow } from './ai-billing';
import {
  repositoryAnalysisWorkflow,
  repositoryAnalysisErrorHandler,
} from './repo-analysis-workflow';

// AI Milestone Generation Orchestration
export const aiCreateProject = inngest.createFunction(
  { id: 'ai-create-project', name: 'AI Create Project with Milestones' },
  { event: 'ai/create-project' },
  async ({ event, step }) => {
    const { projectId, prompt, documentUrl } = event.data;

    // Step 1: Generate milestones with AI
    const milestones = await step.run('generate-milestones', async () => {
      logger.info(`Generating milestones for project: ${projectId}`);
      return await aiOrchestrator.generateMilestones({
        prompt,
        documentUrl,
      });
    });

    // Step 2: Store milestones in database
    await step.run('store-milestones', async () => {
      for (const [index, milestone] of milestones.entries()) {
        const createdMilestone = await prisma.milestone.create({
          data: {
            projectId,
            title: milestone.title,
            description: milestone.description,
            order: index,
            createdByAI: true,
          },
        });

        // Create sub-milestones
        for (const subMilestone of milestone.subMilestones) {
          await prisma.subMilestone.create({
            data: {
              milestoneId: createdMilestone.id,
              description: subMilestone.description,
              acceptanceCriteria: subMilestone.acceptanceCriteria,
              checkpointAmount: subMilestone.checkpointAmount,
              checkpointsCount: subMilestone.checkpointsCount,
              verificationRules: subMilestone.verificationRules,
              estimateHours: subMilestone.estimateHours,
              createdByAI: true,
            },
          });
        }
      }

      logger.info(`Stored ${milestones.length} milestones for project: ${projectId}`);
    });

    // Step 3: Generate embeddings and store in Qdrant
    await step.run('store-embeddings', async () => {
      for (const milestone of milestones) {
        const text = `${milestone.title} ${milestone.description}`;
        const embedding = await aiOrchestrator.generateEmbedding(text);

        await qdrant.upsert(QDRANT_COLLECTIONS.MILESTONES, {
          points: [
            {
              id: milestone.title, // Use UUID in production
              vector: embedding,
              payload: {
                projectId,
                title: milestone.title,
                description: milestone.description,
              },
            },
          ],
        });
      }

      logger.info('Embeddings stored in Qdrant');
    });

    return { success: true, milestonesCount: milestones.length };
  }
);

// Commit -> Proof -> Payout Orchestration
export const handleCommitToProof = inngest.createFunction(
  { id: 'handle-commit-to-proof', name: 'Handle Commit to Proof Generation' },
  { event: 'github/commit' },
  async ({ event, step }) => {
    const { commitHash } = event.data;

    // Step 1: Find associated contribution
    const contribution = await step.run('find-contribution', async () => {
      return await prisma.contribution.findFirst({
        where: { commitHash },
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
    });

    if (!contribution) {
      logger.warn(`No contribution found for commit: ${commitHash}`);
      return { success: false, reason: 'No contribution found' };
    }

    // Step 2: Run verification (delegated to Verifier Worker)
    await step.run('trigger-verification', async () => {
      // This would be handled by the Verifier Worker listening to Kafka
      logger.info(`Verification triggered for commit: ${commitHash}`);
    });

    // Step 3: Wait for verification to complete
    await step.waitForEvent('verification-complete', {
      event: 'verification/complete',
      timeout: '5m',
      match: 'data.commitHash',
    });

    // Step 4: Generate proof (delegated to Prover Worker)
    await step.run('trigger-proof-generation', async () => {
      logger.info(`Proof generation triggered for contribution: ${contribution.id}`);
    });

    // Step 5: Wait for proof generation
    await step.waitForEvent('proof-generated', {
      event: 'proof/generated',
      timeout: '10m',
      match: 'data.contributionId',
    });

    // Step 6: Submit proof to blockchain
    await step.run('submit-proof', async () => {
      logger.info(`Proof submission triggered for contribution: ${contribution.id}`);
    });

    return { success: true };
  }
);

// Export all functions for Inngest to register
export const functions = [
  aiCreateProject,
  // verifyPR, // Removed - using prVerificationWorkflow instead
  aiMilestoneGeneration,
  aiMilestoneGenerationWorkflow, // New multi-model workflow
  prVerificationWorkflow,
  testHarnessExecution,
  // autoYieldHarvest, // POSTPONED: Over-engineered for MVP, move to v2
  aiPRVerificationWorkflow,
  uiSponsorApproveWorkflow,
  aiBillingWorkflow,
  repositoryAnalysisWorkflow,
  repositoryAnalysisErrorHandler,
];
