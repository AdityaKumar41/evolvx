import { qdrantClient, QDRANT_COLLECTIONS } from '../lib/qdrant';
import { logger } from '../utils/logger';
import { aiOrchestrator } from './ai.service';

export interface SearchResult {
  filePath: string;
  content: string;
  context: string;
  purpose: string;
  complexity: string;
  score: number;
  metadata: {
    fileType?: string;
    dependencies?: string[];
    exports?: string[];
    summary?: string;
    startLine?: number;
    endLine?: number;
  };
}

export interface CodebaseContextResult {
  relevantFiles: SearchResult[];
  summary: string;
  totalFiles: number;
}

/**
 * Vector Search Service
 * Provides semantic search capabilities over code embeddings in Qdrant
 */
export class VectorSearchService {
  /**
   * Search for relevant code snippets based on query
   */
  async searchCodebase(
    projectId: string,
    query: string,
    limit: number = 10
  ): Promise<SearchResult[]> {
    try {
      logger.info(`[VectorSearch] Searching codebase for project ${projectId}`);

      // Generate embedding for the query
      const queryEmbedding = await aiOrchestrator.generateEmbedding(query);

      // Search in Qdrant
      const searchResults = await qdrantClient.search(QDRANT_COLLECTIONS.REPO_EMBEDDINGS, {
        vector: queryEmbedding,
        filter: {
          must: [
            {
              key: 'projectId',
              match: {
                value: projectId,
              },
            },
          ],
        },
        limit,
        with_payload: true,
      });

      // Transform results
      const results: SearchResult[] = searchResults.map((result) => ({
        filePath: result.payload?.filePath as string,
        content: result.payload?.content as string,
        context: result.payload?.context as string,
        purpose: result.payload?.purpose as string,
        complexity: result.payload?.complexity as string,
        score: result.score,
        metadata: {
          fileType: result.payload?.fileType as string | undefined,
          dependencies: result.payload?.dependencies as string[] | undefined,
          exports: result.payload?.exports as string[] | undefined,
          summary: result.payload?.summary as string | undefined,
          startLine: result.payload?.startLine as number | undefined,
          endLine: result.payload?.endLine as number | undefined,
        },
      }));

      logger.info(`[VectorSearch] Found ${results.length} relevant code snippets`);
      return results;
    } catch (error) {
      logger.error('[VectorSearch] Search failed:', error);
      return [];
    }
  }

  /**
   * Get comprehensive codebase context for a query
   */
  async getCodebaseContext(
    projectId: string,
    query: string,
    maxFiles: number = 5
  ): Promise<CodebaseContextResult> {
    try {
      const results = await this.searchCodebase(projectId, query, maxFiles * 3);

      // Group by file and take top results
      const fileMap = new Map<string, SearchResult>();
      for (const result of results) {
        if (!fileMap.has(result.filePath) && fileMap.size < maxFiles) {
          fileMap.set(result.filePath, result);
        }
      }

      const relevantFiles = Array.from(fileMap.values());

      // Generate summary
      const summary = this.generateContextSummary(relevantFiles);

      return {
        relevantFiles,
        summary,
        totalFiles: fileMap.size,
      };
    } catch (error) {
      logger.error('[VectorSearch] Failed to get codebase context:', error);
      return {
        relevantFiles: [],
        summary: 'No codebase context available',
        totalFiles: 0,
      };
    }
  }

  /**
   * Get all files in the codebase for a project
   */
  async getProjectFiles(projectId: string, limit: number = 100): Promise<SearchResult[]> {
    try {
      // Scroll through all points for the project
      const scrollResults = await qdrantClient.scroll(QDRANT_COLLECTIONS.REPO_EMBEDDINGS, {
        filter: {
          must: [
            {
              key: 'projectId',
              match: {
                value: projectId,
              },
            },
          ],
        },
        limit,
        with_payload: true,
      });

      const results: SearchResult[] = scrollResults.points.map((point) => ({
        filePath: point.payload?.filePath as string,
        content: point.payload?.content as string,
        context: point.payload?.context as string,
        purpose: point.payload?.purpose as string,
        complexity: point.payload?.complexity as string,
        score: 1.0, // No semantic matching score
        metadata: {
          fileType: point.payload?.fileType as string | undefined,
          dependencies: point.payload?.dependencies as string[] | undefined,
          exports: point.payload?.exports as string[] | undefined,
          summary: point.payload?.summary as string | undefined,
        },
      }));

      logger.info(`[VectorSearch] Retrieved ${results.length} files for project ${projectId}`);
      return results;
    } catch (error) {
      logger.error('[VectorSearch] Failed to get project files:', error);
      return [];
    }
  }

  /**
   * Get statistics about indexed code
   */
  async getIndexStats(projectId: string): Promise<{
    totalChunks: number;
    uniqueFiles: number;
    technologies: string[];
  }> {
    try {
      const results = await this.getProjectFiles(projectId, 1000);

      const uniqueFiles = new Set(results.map((r) => r.filePath));
      const technologies = new Set(results.map((r) => r.metadata.fileType));

      return {
        totalChunks: results.length,
        uniqueFiles: uniqueFiles.size,
        technologies: Array.from(technologies).filter((t): t is string => Boolean(t)),
      };
    } catch (error) {
      logger.error('[VectorSearch] Failed to get index stats:', error);
      return {
        totalChunks: 0,
        uniqueFiles: 0,
        technologies: [],
      };
    }
  }

  /**
   * Search for specific file patterns or names
   */
  async searchFilesByPattern(
    projectId: string,
    pattern: string,
    limit: number = 20
  ): Promise<SearchResult[]> {
    try {
      const allFiles = await this.getProjectFiles(projectId, 500);

      // Filter by pattern
      const regex = new RegExp(pattern, 'i');
      const matching = allFiles.filter((file) => regex.test(file.filePath)).slice(0, limit);

      logger.info(`[VectorSearch] Found ${matching.length} files matching pattern: ${pattern}`);
      return matching;
    } catch (error) {
      logger.error('[VectorSearch] File pattern search failed:', error);
      return [];
    }
  }

  /**
   * Generate a summary of context from search results
   */
  private generateContextSummary(results: SearchResult[]): string {
    if (results.length === 0) return 'No relevant code found';

    const files = results.map((r) => r.filePath).join(', ');
    const technologies = [...new Set(results.map((r) => r.metadata.fileType).filter(Boolean))];

    return `Found ${results.length} relevant files: ${files}. Technologies: ${technologies.join(', ')}`;
  }

  /**
   * Delete all embeddings for a project
   */
  async deleteProjectEmbeddings(projectId: string): Promise<void> {
    try {
      await qdrantClient.delete(QDRANT_COLLECTIONS.REPO_EMBEDDINGS, {
        filter: {
          must: [
            {
              key: 'projectId',
              match: {
                value: projectId,
              },
            },
          ],
        },
      });

      logger.info(`[VectorSearch] Deleted all embeddings for project ${projectId}`);
    } catch (error) {
      logger.error('[VectorSearch] Failed to delete project embeddings:', error);
      throw error;
    }
  }
}

export const vectorSearchService = new VectorSearchService();
