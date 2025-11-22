import { QdrantClient } from '@qdrant/js-client-rest';
import { config } from '../config';
import { logger } from '../utils/logger';

export const qdrant = new QdrantClient({
  url: config.qdrant.url,
  apiKey: config.qdrant.apiKey,
});

// Alias for compatibility
export const qdrantClient = qdrant;

// Collection names (Based on PRD Section 4.4)
export const QDRANT_COLLECTIONS = {
  DOCUMENTS: 'documents',
  PROJECT_DOCUMENTS: 'project_documents',
  TASK_CONTEXT: 'task_context',
  REPO_EMBEDDINGS: 'repo_embeddings',
  CODE_EMBEDDINGS: 'code_embeddings',
  MILESTONES: 'milestones',
  CHAT_CONVERSATIONS: 'chat_conversations',
} as const;

export const initQdrantCollections = async () => {
  try {
    // Check and create documents collection
    const collections = await qdrant.getCollections();
    const collectionNames = collections.collections.map((c) => c.name);

    if (!collectionNames.includes(QDRANT_COLLECTIONS.DOCUMENTS)) {
      await qdrant.createCollection(QDRANT_COLLECTIONS.DOCUMENTS, {
        vectors: {
          size: 1536, // OpenAI embeddings size
          distance: 'Cosine',
        },
      });
      logger.info(`✅ Created Qdrant collection: ${QDRANT_COLLECTIONS.DOCUMENTS}`);
    }

    if (!collectionNames.includes(QDRANT_COLLECTIONS.CODE_EMBEDDINGS)) {
      await qdrant.createCollection(QDRANT_COLLECTIONS.CODE_EMBEDDINGS, {
        vectors: {
          size: 1536,
          distance: 'Cosine',
        },
      });
      logger.info(`✅ Created Qdrant collection: ${QDRANT_COLLECTIONS.CODE_EMBEDDINGS}`);
    }

    if (!collectionNames.includes(QDRANT_COLLECTIONS.MILESTONES)) {
      await qdrant.createCollection(QDRANT_COLLECTIONS.MILESTONES, {
        vectors: {
          size: 1536,
          distance: 'Cosine',
        },
      });
      logger.info(`✅ Created Qdrant collection: ${QDRANT_COLLECTIONS.MILESTONES}`);
    }

    if (!collectionNames.includes(QDRANT_COLLECTIONS.REPO_EMBEDDINGS)) {
      await qdrant.createCollection(QDRANT_COLLECTIONS.REPO_EMBEDDINGS, {
        vectors: {
          size: 1536,
          distance: 'Cosine',
        },
      });
      logger.info(`✅ Created Qdrant collection: ${QDRANT_COLLECTIONS.REPO_EMBEDDINGS}`);
    }

    if (!collectionNames.includes(QDRANT_COLLECTIONS.CHAT_CONVERSATIONS)) {
      await qdrant.createCollection(QDRANT_COLLECTIONS.CHAT_CONVERSATIONS, {
        vectors: {
          size: 1536,
          distance: 'Cosine',
        },
      });
      logger.info(`✅ Created Qdrant collection: ${QDRANT_COLLECTIONS.CHAT_CONVERSATIONS}`);
    }

    logger.info('✅ Qdrant collections initialized');
  } catch (error) {
    logger.error('❌ Failed to initialize Qdrant collections:', error);
    throw error;
  }
};
