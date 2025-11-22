import { inngest } from './lib/inngest';
import { logger } from './utils/logger';

/**
 * Test script to manually trigger repository analysis
 * Usage: pnpm ts-node src/test-repo-analysis.ts <projectId> <repoUrl>
 */
async function testRepoAnalysis() {
  const projectId = process.argv[2];
  const repositoryUrl = process.argv[3];
  const userId = process.argv[4];

  if (!projectId || !repositoryUrl || !userId) {
    console.error('Usage: pnpm ts-node src/test-repo-analysis.ts <projectId> <repoUrl> <userId>');
    process.exit(1);
  }

  logger.info('Testing repository analysis trigger', {
    projectId,
    repositoryUrl,
    userId,
  });

  try {
    // Trigger Inngest event
    const result = await inngest.send({
      name: 'repo/analysis.requested',
      data: {
        projectId,
        repositoryUrl,
        userId,
      },
    });

    logger.info('✅ Inngest event sent successfully', result);
    console.log('Event sent successfully! Check Inngest dashboard at /api/inngest');
    console.log('Event IDs:', result.ids);
  } catch (error) {
    logger.error('❌ Failed to send Inngest event:', error);
    throw error;
  }
}

testRepoAnalysis()
  .then(() => {
    console.log('✅ Test completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });
