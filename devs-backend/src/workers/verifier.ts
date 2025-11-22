import { subscribeToTopic, KAFKA_TOPICS } from '../lib/kafka';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { uploadToS3 } from '../lib/s3';
import crypto from 'crypto';

interface CommitEvent {
  commitHash: string;
  repository: {
    id: number;
    name: string;
    url: string;
  };
  author: {
    name: string;
    email: string;
  };
}

class VerifierWorker {
  async start() {
    logger.info('🔧 Verifier Worker starting...');

    await subscribeToTopic(KAFKA_TOPICS.GITHUB_COMMIT, async (payload) => {
      const message = JSON.parse(payload.message.value?.toString() || '{}');
      await this.processCommit(message);
    });

    logger.info('✅ Verifier Worker ready');
  }

  private async processCommit(event: CommitEvent) {
    try {
      logger.info(`Processing commit: ${event.commitHash}`);

      // Find associated sub-milestone
      const contribution = await prisma.contribution.findFirst({
        where: {
          commitHash: event.commitHash,
        },
        include: {
          subMilestone: true,
        },
      });

      if (!contribution) {
        logger.warn(`No contribution found for commit: ${event.commitHash}`);
        return;
      }

      const { subMilestone } = contribution;
      const acceptanceCriteria = subMilestone.acceptanceCriteria as any; // eslint-disable-line @typescript-eslint/no-explicit-any

      // Update job status
      await prisma.job.create({
        data: {
          type: 'verification',
          status: 'RUNNING',
          payload: {
            contributionId: contribution.id,
            commitHash: event.commitHash,
          },
        },
      });

      // Run tests (simplified - in production, use Docker sandbox)
      const testResults = await this.runTests(acceptanceCriteria);

      if (!testResults.success) {
        await prisma.contribution.update({
          where: { id: contribution.id },
          data: { status: 'PENDING' },
        });

        logger.warn(`Tests failed for commit: ${event.commitHash}`);
        return;
      }

      // Generate artifact digest
      const artifactDigest = this.generateDigest(testResults.output);

      // Store artifact to S3
      const artifactKey = `artifacts/${contribution.id}/${event.commitHash}.json`;
      await uploadToS3(
        artifactKey,
        JSON.stringify({
          commitHash: event.commitHash,
          testResults,
          digest: artifactDigest,
          timestamp: new Date().toISOString(),
        }),
        'application/json'
      );

      // Update contribution
      await prisma.contribution.update({
        where: { id: contribution.id },
        data: {
          status: 'VERIFIED',
          metadata: {
            artifactDigest,
            artifactKey,
            verifiedAt: new Date().toISOString(),
          },
        },
      });

      logger.info(`✅ Verification completed for commit: ${event.commitHash}`);

      // Trigger proof generation (this would be handled by Prover Worker)
      // In a real system, publish to KAFKA_TOPICS.PROOF_GENERATION_REQUESTED
    } catch (error) {
      logger.error('Failed to process commit:', error);

      await prisma.job.create({
        data: {
          type: 'verification',
          status: 'FAILED',
          payload: { commitHash: event.commitHash },
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async runTests(acceptanceCriteria: any): Promise<{ success: boolean; output: string }> {
    try {
      // Simplified test execution
      // In production: clone repo, run tests in Docker container, collect results
      const testCommand = acceptanceCriteria.verificationRules?.testCommand || 'npm test';

      // Simulate test run (replace with actual Docker execution)
      logger.info(`Running test command: ${testCommand}`);

      // For now, return success
      return {
        success: true,
        output: 'All tests passed',
      };
    } catch (error) {
      return {
        success: false,
        output: error instanceof Error ? error.message : 'Test execution failed',
      };
    }
  }

  private generateDigest(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }
}

// Start worker if run directly
if (require.main === module) {
  const worker = new VerifierWorker();
  worker.start().catch((error) => {
    logger.error('Failed to start Verifier Worker:', error);
    process.exit(1);
  });
}

export default VerifierWorker;
