import { qdrantClient, QDRANT_COLLECTIONS } from '../lib/qdrant';
import { logger } from '../utils/logger';
import { aiOrchestrator } from './ai.service';
import { codeRabbitService } from './coderabbit.service';

export interface RepoEmbeddingMetadata {
  projectId: string;
  repositoryUrl: string;
  filePath?: string;
  fileType?: string;
  chunkIndex?: number;
  totalChunks?: number;
  lastUpdated: string;
}

export interface CodeContext {
  content: string;
  filePath: string;
  language: string;
  score: number;
}

/**
 * Service for managing repository embeddings in Qdrant
 * Provides context-aware code search for chat conversations
 */
export class RepoEmbeddingService {
  private readonly collectionName = QDRANT_COLLECTIONS.REPO_EMBEDDINGS;

  /**
   * Index a repository for semantic search (simplified version)
   * In production, this would be called via a background job
   */
  async indexRepository(projectId: string, repositoryUrl: string): Promise<void> {
    try {
      logger.info(`[RepoEmbedding] Repository indexing requested for project ${projectId}`);

      // For now, just store repository metadata
      // Full indexing would be done in a background job
      const analysis = await codeRabbitService.analyzeRepository(repositoryUrl);
      await this.storeRepoMetadata(projectId, repositoryUrl, analysis);

      logger.info(`[RepoEmbedding] Repository metadata stored for project ${projectId}`);
    } catch (error) {
      logger.error('[RepoEmbedding] Failed to index repository:', error);
      throw error;
    }
  }

  /**
   * Search for relevant code context based on a query
   */
  async searchCodeContext(
    projectId: string,
    query: string,
    limit: number = 5
  ): Promise<CodeContext[]> {
    try {
      // Generate embedding for the query
      const queryEmbedding = await aiOrchestrator.generateEmbedding(query);

      // Search Qdrant
      const results = await qdrantClient.search(this.collectionName, {
        vector: queryEmbedding,
        filter: {
          must: [{ key: 'projectId', match: { value: projectId } }],
        },
        limit,
        with_payload: true,
      });

      return results.map((result) => ({
        content: result.payload?.content as string,
        filePath: result.payload?.filePath as string,
        language: result.payload?.fileType as string,
        score: result.score,
      }));
    } catch (error) {
      logger.error('[RepoEmbedding] Failed to search code context:', error);
      return [];
    }
  }

  /**
   * Delete repository embeddings
   */
  async deleteRepositoryEmbeddings(projectId: string): Promise<void> {
    try {
      await qdrantClient.delete(this.collectionName, {
        wait: true,
        filter: {
          must: [{ key: 'projectId', match: { value: projectId } }],
        },
      });

      logger.info(`[RepoEmbedding] Deleted embeddings for project ${projectId}`);
    } catch (error) {
      logger.error('[RepoEmbedding] Failed to delete repository embeddings:', error);
      throw error;
    }
  }

  /**
   * Store repository metadata for quick access
   */
  private async storeRepoMetadata(
    projectId: string,
    repositoryUrl: string,
    analysis: any
  ): Promise<void> {
    try {
      const metadataText = `
Repository: ${repositoryUrl}
Architecture: ${analysis.architecture}
Technologies: ${analysis.technologies.join(', ')}
Summary: ${analysis.summary}
Complexity: ${analysis.complexity}
Recommendations: ${analysis.recommendations.join('\n')}
      `.trim();

      const embedding = await aiOrchestrator.generateEmbedding(metadataText);

      await qdrantClient.upsert(this.collectionName, {
        wait: true,
        points: [
          {
            id: `${projectId}-metadata`,
            vector: embedding,
            payload: {
              projectId,
              repositoryUrl,
              type: 'metadata',
              content: metadataText,
              analysis,
              lastUpdated: new Date().toISOString(),
            },
          },
        ],
      });
    } catch (error) {
      logger.error('[RepoEmbedding] Failed to store repo metadata:', error);
    }
  }
}

export const repoEmbeddingService = new RepoEmbeddingService();
