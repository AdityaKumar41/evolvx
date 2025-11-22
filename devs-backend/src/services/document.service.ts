import { prisma } from '../lib/prisma';
import { qdrant, QDRANT_COLLECTIONS } from '../lib/qdrant';
import { logger } from '../utils/logger';
import { uploadToS3, getSignedS3Url } from '../lib/s3';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';

export interface DocumentUploadData {
  projectId: string;
  milestoneId?: string;
  uploadedBy?: string;
  file: Buffer;
  fileName: string;
  fileType: string;
  fileSizeBytes: number;
}

export interface DocumentChunk {
  content: string;
  metadata: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export class DocumentService {
  /**
   * Upload and process document
   */
  async uploadDocument(data: DocumentUploadData) {
    try {
      // 1. Upload to S3
      const s3Key = `projects/${data.projectId}/documents/${uuidv4()}-${data.fileName}`;
      await uploadToS3(s3Key, data.file, data.fileType);

      // 2. Parse and chunk document
      const chunks = await this.parseAndChunkDocument(data.file, data.fileName, data.fileType);

      // 3. Generate embeddings and store in Qdrant
      const vectorRefIds = await this.storeEmbeddings(data.projectId, chunks);

      // 4. Store document metadata in Postgres
      const document = await prisma.document.create({
        data: {
          projectId: data.projectId,
          milestoneId: data.milestoneId,
          uploadedBy: data.uploadedBy,
          fileName: data.fileName,
          fileUrl: s3Key,
          fileType: data.fileType,
          fileSizeBytes: data.fileSizeBytes,
          vectorRefIds: vectorRefIds,
        },
      });

      logger.info(`Document uploaded and processed: ${document.id} for project ${data.projectId}`);
      return document;
    } catch (error) {
      logger.error('Error uploading document:', error);
      throw new Error('Failed to upload document');
    }
  }

  /**
   * Parse and chunk document based on file type
   */
  private async parseAndChunkDocument(
    fileBuffer: Buffer,
    fileName: string,
    fileType: string
  ): Promise<DocumentChunk[]> {
    try {
      let content = '';

      // Parse based on file type
      if (fileType.includes('text') || fileType.includes('markdown')) {
        content = fileBuffer.toString('utf-8');
      } else if (fileType.includes('pdf')) {
        // For PDF, you'd use a library like pdf-parse
        // For now, simplified
        content = fileBuffer.toString('utf-8');
      } else {
        // For code files, read as text
        content = fileBuffer.toString('utf-8');
      }

      // Chunk the content
      return this.chunkText(content, fileName);
    } catch (error) {
      logger.error('Error parsing document:', error);
      throw new Error('Failed to parse document');
    }
  }

  /**
   * Chunk text into manageable pieces
   */
  private chunkText(text: string, fileName: string): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    const chunkSize = 1000; // characters
    const overlap = 200; // overlap between chunks

    let startIndex = 0;
    let chunkIndex = 0;

    while (startIndex < text.length) {
      const endIndex = Math.min(startIndex + chunkSize, text.length);
      const chunkContent = text.substring(startIndex, endIndex);

      chunks.push({
        content: chunkContent,
        metadata: {
          fileName,
          chunkIndex,
          startIndex,
          endIndex,
          length: chunkContent.length,
        },
      });

      startIndex += chunkSize - overlap;
      chunkIndex++;
    }

    return chunks;
  }

  /**
   * Generate embeddings and store in Qdrant
   */
  private async storeEmbeddings(projectId: string, chunks: DocumentChunk[]): Promise<string[]> {
    try {
      const pointIds: string[] = [];

      // Initialize collection if not exists
      await this.ensureQdrantCollection();

      // Process chunks in batches
      const batchSize = 10;
      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);

        // Generate embeddings for batch
        const embeddings = await this.generateEmbeddings(batch.map((c) => c.content));

        // Store in Qdrant
        const points = batch.map((chunk, idx) => {
          const pointId = uuidv4();
          pointIds.push(pointId);

          return {
            id: pointId,
            vector: embeddings[idx],
            payload: {
              projectId,
              content: chunk.content,
              metadata: chunk.metadata,
              createdAt: new Date().toISOString(),
            },
          };
        });

        await qdrant.upsert(QDRANT_COLLECTIONS.PROJECT_DOCUMENTS, {
          wait: true,
          points: points,
        });
      }

      logger.info(`Stored ${pointIds.length} embeddings in Qdrant for project ${projectId}`);
      return pointIds;
    } catch (error) {
      logger.error('Error storing embeddings:', error);
      throw new Error('Failed to store embeddings');
    }
  }

  /**
   * Generate embeddings using AI SDK
   */
  private async generateEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      // Using OpenAI's text-embedding-3-small model via AI SDK
      // Note: In production, you'd use the proper embedding endpoint
      // For now, we'll use a simplified approach
      const embeddings: number[][] = [];

      for (const text of texts) {
        // Generate a simple hash-based embedding (for development)
        // In production, use proper embedding models
        const hash = crypto.createHash('sha256').update(text).digest();
        const embedding = Array.from(hash.slice(0, 128)).map((b) => b / 255);

        // Pad to 1536 dimensions (OpenAI embedding size)
        while (embedding.length < 1536) {
          embedding.push(0);
        }

        embeddings.push(embedding.slice(0, 1536));
      }

      return embeddings;
    } catch (error) {
      logger.error('Error generating embeddings:', error);
      throw new Error('Failed to generate embeddings');
    }
  }

  /**
   * Ensure Qdrant collection exists
   */
  private async ensureQdrantCollection() {
    try {
      const collections = await qdrant.getCollections();
      const exists = collections.collections.some(
        (c) => c.name === QDRANT_COLLECTIONS.PROJECT_DOCUMENTS
      );

      if (!exists) {
        await qdrant.createCollection(QDRANT_COLLECTIONS.PROJECT_DOCUMENTS, {
          vectors: {
            size: 1536,
            distance: 'Cosine',
          },
        });
        logger.info(`Created Qdrant collection: ${QDRANT_COLLECTIONS.PROJECT_DOCUMENTS}`);
      }
    } catch (error) {
      logger.error('Error ensuring Qdrant collection:', error);
      // Don't throw, collection might already exist
    }
  }

  /**
   * Search documents using vector similarity
   */
  async searchDocuments(projectId: string, query: string, limit: number = 5) {
    try {
      // Generate query embedding
      const queryEmbedding = (await this.generateEmbeddings([query]))[0];

      // Search in Qdrant
      const searchResults = await qdrant.search(QDRANT_COLLECTIONS.PROJECT_DOCUMENTS, {
        vector: queryEmbedding,
        filter: {
          must: [
            {
              key: 'projectId',
              match: { value: projectId },
            },
          ],
        },
        limit: limit,
        with_payload: true,
      });

      return searchResults.map((result) => ({
        content: result.payload?.content,
        metadata: result.payload?.metadata,
        score: result.score,
      }));
    } catch (error) {
      logger.error('Error searching documents:', error);
      throw new Error('Failed to search documents');
    }
  }

  /**
   * Get project documents
   */
  async getProjectDocuments(projectId: string) {
    try {
      const documents = await prisma.document.findMany({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
      });

      // Generate signed URLs for downloads
      const documentsWithUrls = await Promise.all(
        documents.map(async (doc) => ({
          ...doc,
          downloadUrl: await getSignedS3Url(doc.fileUrl, 3600),
        }))
      );

      return documentsWithUrls;
    } catch (error) {
      logger.error('Error fetching project documents:', error);
      throw new Error('Failed to fetch documents');
    }
  }

  /**
   * Delete document
   */
  async deleteDocument(documentId: string, projectId: string) {
    try {
      const document = await prisma.document.findUnique({
        where: { id: documentId },
      });

      if (!document) {
        throw new Error('Document not found');
      }

      if (document.projectId !== projectId) {
        throw new Error('Document does not belong to this project');
      }

      // Delete vectors from Qdrant
      if (document.vectorRefIds && document.vectorRefIds.length > 0) {
        await qdrant.delete(QDRANT_COLLECTIONS.PROJECT_DOCUMENTS, {
          wait: true,
          points: document.vectorRefIds,
        });
      }

      // Delete from database
      await prisma.document.delete({
        where: { id: documentId },
      });

      logger.info(`Document deleted: ${documentId}`);
      return { success: true };
    } catch (error) {
      logger.error('Error deleting document:', error);
      throw error;
    }
  }

  /**
   * Get context for AI queries (used by AI sidebar and milestone generation)
   */
  async getProjectContext(projectId: string, query: string, maxChunks: number = 5) {
    try {
      const searchResults = await this.searchDocuments(projectId, query, maxChunks);

      // Combine chunks into context
      const context = searchResults.map((result) => result.content).join('\n\n---\n\n');

      return {
        context,
        sources: searchResults.map((r) => r.metadata),
      };
    } catch (error) {
      logger.error('Error getting project context:', error);
      return { context: '', sources: [] };
    }
  }

  /**
   * Get document content from S3 URL (for AI processing)
   */
  async getDocumentContent(s3Url: string): Promise<string> {
    try {
      // For S3 URLs, we need to fetch the content
      // This is a simplified version - in production, you'd use AWS SDK
      const signedUrl = await getSignedS3Url(s3Url, 3600);

      // Fetch content from signed URL
      const response = await fetch(signedUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch document: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || '';

      // Handle different content types
      if (contentType.includes('text') || contentType.includes('markdown')) {
        return await response.text();
      } else if (contentType.includes('pdf')) {
        // For PDF, you'd use pdf-parse or similar
        // For now, return empty string
        logger.warn('PDF parsing not implemented, skipping content extraction');
        return '';
      } else {
        // Try to read as text
        return await response.text();
      }
    } catch (error) {
      logger.error('Error getting document content:', error);
      return '';
    }
  }
}

export const documentService = new DocumentService();
