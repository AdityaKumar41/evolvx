import { getConsumer, KAFKA_TOPICS } from '../lib/kafka';
import { redis } from '../lib/redis';
import { logger } from '../utils/logger';

/**
 * Repository Analysis Event Consumer
 *
 * Listens to repo analysis Kafka events and forwards them to WebSocket clients
 * via Redis pub/sub for real-time progress updates
 */
export async function startRepoAnalysisConsumer() {
  try {
    logger.info('[RepoAnalysisConsumer] Starting consumer...');

    const consumer = await getConsumer('repo-analysis-consumer-group');

    // Subscribe to all topics at once
    const topics = [
      KAFKA_TOPICS.REPO_ANALYSIS_STARTED,
      KAFKA_TOPICS.REPO_ANALYSIS_PROGRESS,
      KAFKA_TOPICS.REPO_ANALYSIS_COMPLETED,
      KAFKA_TOPICS.REPO_ANALYSIS_FAILED,
    ];

    await consumer.subscribe({
      topics,
      fromBeginning: false,
    });

    logger.info('[RepoAnalysisConsumer] Subscribed to topics:', topics);

    // Handle messages
    await consumer.run({
      eachMessage: async ({ topic, message }) => {
        try {
          const data = JSON.parse(message.value?.toString() || '{}');

          switch (topic) {
            case KAFKA_TOPICS.REPO_ANALYSIS_STARTED:
              logger.info('[RepoAnalysisConsumer] Analysis started:', data);
              await redis.publish(
                'repo-analysis',
                JSON.stringify({
                  projectId: data.projectId,
                  update: {
                    status: 'started',
                    stage: data.stage || 'initializing',
                    message: data.message || 'Starting repository analysis',
                    timestamp: data.timestamp,
                  },
                })
              );
              break;

            case KAFKA_TOPICS.REPO_ANALYSIS_PROGRESS:
              logger.info('[RepoAnalysisConsumer] Progress update:', {
                projectId: data.projectId,
                progress: data.progress,
              });
              await redis.publish(
                'repo-analysis',
                JSON.stringify({
                  projectId: data.projectId,
                  update: {
                    status: 'in_progress',
                    stage: 'analyzing',
                    filesAnalyzed: data.filesAnalyzed,
                    totalFiles: data.totalFiles,
                    embeddingsCreated: data.embeddingsCreated,
                    progress: data.progress,
                    currentBatch: data.currentBatch,
                    totalBatches: data.totalBatches,
                    message: `Analyzing files: ${data.filesAnalyzed}/${data.totalFiles} (${data.progress}%)`,
                    timestamp: data.timestamp,
                  },
                })
              );
              break;

            case KAFKA_TOPICS.REPO_ANALYSIS_COMPLETED:
              logger.info('[RepoAnalysisConsumer] Analysis completed:', data);
              await redis.publish(
                'repo-analysis',
                JSON.stringify({
                  projectId: data.projectId,
                  update: {
                    status: 'completed',
                    stage: 'complete',
                    filesIndexed: data.filesIndexed,
                    embeddingsCount: data.embeddingsCount,
                    technologies: data.technologies,
                    complexity: data.complexity,
                    duration: data.duration,
                    message: `Repository analysis complete! Indexed ${data.filesIndexed} files with ${data.embeddingsCount} embeddings.`,
                    timestamp: data.timestamp,
                  },
                })
              );
              break;

            case KAFKA_TOPICS.REPO_ANALYSIS_FAILED:
              logger.info('[RepoAnalysisConsumer] Analysis failed:', data);
              await redis.publish(
                'repo-analysis',
                JSON.stringify({
                  projectId: data.projectId,
                  update: {
                    status: 'failed',
                    stage: data.stage || 'unknown',
                    error: data.error,
                    message: `Repository analysis failed: ${data.error}`,
                    timestamp: data.timestamp,
                  },
                })
              );
              break;

            default:
              logger.warn('[RepoAnalysisConsumer] Unknown topic:', topic);
          }
        } catch (error) {
          logger.error(`[RepoAnalysisConsumer] Error processing message from ${topic}:`, error);
        }
      },
    });

    logger.info('[RepoAnalysisConsumer] Consumer running successfully');
  } catch (error) {
    logger.error('[RepoAnalysisConsumer] Failed to start consumer:', error);
    throw error;
  }
}
