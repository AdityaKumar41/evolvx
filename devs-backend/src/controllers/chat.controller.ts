import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { chatService } from '../services/chat.service';
import { logger } from '../utils/logger';
import { prisma } from '../lib/prisma';
import { DocumentParser } from '../utils/document-parser';
import { aiOrchestrator } from '../services/ai.service';
import { qdrantClient, QDRANT_COLLECTIONS } from '../lib/qdrant';
import { v4 as uuidv4 } from 'uuid';
import { uploadToS3 } from '../lib/s3';

export class ChatController {
  /**
   * POST /api/chat/stream
   * Stream chat responses with context awareness
   */
  async streamChat(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { conversationId, message, context } = req.body;
      const userId = req.user!.id;

      if (!message || !context) {
        res.status(400).json({ error: 'Message and context are required' });
        return;
      }

      // Validate user owns the conversation if provided
      if (conversationId) {
        const existingConv = await chatService.getConversationHistory(conversationId);
        if (existingConv.userId !== userId) {
          res.status(403).json({ error: 'Unauthorized' });
          return;
        }
      }

      // Set headers for SSE
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // Start streaming
      const { conversationId: newConvId, stream } = await chatService.streamChat({
        conversationId,
        message,
        context: {
          ...context,
          userId,
        },
      });

      // Send conversation ID first
      res.write(
        `data: ${JSON.stringify({ type: 'conversation_id', conversationId: newConvId })}\n\n`
      );

      // Stream the response
      const reader = stream.getReader();
      const decoder = new TextDecoder();

      try {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
        }

        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        res.end();
      } catch (streamError) {
        logger.error('Stream error:', streamError);
        res.write(`data: ${JSON.stringify({ type: 'error', error: 'Stream interrupted' })}\n\n`);
        res.end();
      }
    } catch (error) {
      logger.error('Error in streamChat:', error);
      next(error);
    }
  }

  /**
   * POST /api/chat
   * Get chat response without streaming
   */
  async sendMessage(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { conversationId, message, context } = req.body;
      const userId = req.user!.id;

      if (!message || !context) {
        res.status(400).json({ error: 'Message and context are required' });
        return;
      }

      // Validate user owns the conversation if provided
      if (conversationId) {
        const existingConv = await chatService.getConversationHistory(conversationId);
        if (existingConv.userId !== userId) {
          res.status(403).json({ error: 'Unauthorized' });
          return;
        }
      }

      const result = await chatService.getChatResponse({
        conversationId,
        message,
        context: {
          ...context,
          userId,
        },
      });

      res.json({
        conversationId: result.conversationId,
        response: result.response,
      });
    } catch (error) {
      logger.error('Error in sendMessage:', error);
      next(error);
    }
  }

  /**
   * GET /api/chat/conversations
   * List user's conversations
   */
  async listConversations(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const limit = parseInt(req.query.limit as string) || 20;

      const conversations = await chatService.getUserConversations(userId, limit);

      res.json({ conversations });
    } catch (error) {
      logger.error('Error in listConversations:', error);
      next(error);
    }
  }

  /**
   * GET /api/chat/conversations/:id
   * Get conversation history
   */
  async getConversation(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      const limit = parseInt(req.query.limit as string) || 50;

      const conversation = await chatService.getConversationHistory(id, limit);

      // Verify user owns the conversation
      if (conversation.userId !== userId) {
        res.status(403).json({ error: 'Unauthorized' });
        return;
      }

      res.json({ conversation });
    } catch (error) {
      logger.error('Error in getConversation:', error);
      if ((error as Error).message === 'Conversation not found') {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }
      next(error);
    }
  }

  /**
   * DELETE /api/chat/conversations/:id
   * Delete a conversation
   */
  async deleteConversation(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.id;

      await chatService.deleteConversation(id, userId);

      res.json({ success: true });
    } catch (error) {
      logger.error('Error in deleteConversation:', error);
      if ((error as Error).message === 'Conversation not found or unauthorized') {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }
      next(error);
    }
  }

  /**
   * POST /api/chat/suggestions
   * Get task suggestions for a project
   */
  async getTaskSuggestions(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { projectId, milestoneId } = req.body;
      const userId = req.user!.id;

      if (!projectId) {
        res.status(400).json({ error: 'Project ID is required' });
        return;
      }

      // Verify user has access to project (either as sponsor or contributor)
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          milestones: {
            include: {
              subMilestones: {
                include: {
                  contributions: {
                    where: { contributorId: userId },
                    select: { id: true },
                  },
                },
              },
            },
          },
        },
      });

      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      const isProjectSponsor = project.sponsorId === userId;
      const hasContribution = project.milestones.some((m) =>
        m.subMilestones.some((sm) => sm.contributions.length > 0)
      );

      if (!isProjectSponsor && !hasContribution) {
        res.status(403).json({ error: 'You do not have access to this project' });
        return;
      }

      const suggestions = await chatService.generateTaskSuggestions(projectId, milestoneId);

      res.json({ suggestions });
    } catch (error) {
      logger.error('Error in getTaskSuggestions:', error);
      next(error);
    }
  }

  /**
   * POST /api/chat/rescoping
   * Get re-scoping recommendation for a task
   */
  async getRescopingRecommendation(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { subMilestoneId } = req.body;
      const userId = req.user!.id;

      if (!subMilestoneId) {
        res.status(400).json({ error: 'Sub-milestone ID is required' });
        return;
      }

      // Verify user has access to sub-milestone (via project sponsor or contribution)
      const subMilestone = await prisma.subMilestone.findUnique({
        where: { id: subMilestoneId },
        include: {
          milestone: {
            include: {
              project: true,
            },
          },
          contributions: {
            where: { contributorId: userId },
            select: { id: true },
          },
        },
      });

      if (!subMilestone) {
        res.status(404).json({ error: 'Sub-milestone not found' });
        return;
      }

      const isProjectSponsor = subMilestone.milestone.project.sponsorId === userId;
      const hasContribution = subMilestone.contributions.length > 0;

      if (!isProjectSponsor && !hasContribution) {
        res.status(403).json({ error: 'You do not have access to this sub-milestone' });
        return;
      }

      const recommendation = await chatService.generateRescopingRecommendation(subMilestoneId);

      res.json({ recommendation });
    } catch (error) {
      logger.error('Error in getRescopingRecommendation:', error);
      next(error);
    }
  }

  /**
   * GET /api/chat/progress/:projectId
   * Get progress explanation for sponsors
   */
  async getProgressExplanation(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { projectId } = req.params;
      const userId = req.user!.id;

      if (!projectId) {
        res.status(400).json({ error: 'Project ID is required' });
        return;
      }

      // Verify user is sponsor of project
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { sponsorId: true },
      });

      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      if (project.sponsorId !== userId) {
        res.status(403).json({ error: 'Only the project sponsor can view progress explanations' });
        return;
      }

      const explanation = await chatService.explainProgress(projectId);

      res.json({ explanation });
    } catch (error) {
      logger.error('Error in getProgressExplanation:', error);
      next(error);
    }
  }

  /**
   * GET /api/chat/projects/:projectId/conversation
   * Get existing conversation history for a project
   */
  async getProjectConversation(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const userId = req.user!.id;

      // Verify user is sponsor of project
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { sponsorId: true },
      });

      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      if (project.sponsorId !== userId) {
        res.status(403).json({ error: 'Only the project sponsor can access conversation history' });
        return;
      }

      // Get or create conversation
      let conversation = await prisma.chatConversation.findFirst({
        where: {
          userId,
          projectId,
          contextType: 'project_orchestration',
        },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              role: true,
              content: true,
              createdAt: true,
            },
          },
        },
      });

      if (!conversation) {
        // Create new conversation
        conversation = await prisma.chatConversation.create({
          data: {
            userId,
            projectId,
            contextType: 'project_orchestration',
            title: 'Project Chat',
          },
          include: {
            messages: true,
          },
        });
      }

      res.json({
        conversationId: conversation.id,
        messages: conversation.messages.map((msg) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          timestamp: msg.createdAt,
        })),
      });
    } catch (error) {
      logger.error('Error in getProjectConversation:', error);
      res.status(500).json({ error: 'Failed to load conversation' });
    }
  }

  /**
   * POST /api/chat/projects/:projectId/orchestrate
   * Orchestrated chat for project sponsors with intelligent routing
   * Routes to milestone generation, code analysis, or information query
   */
  async orchestrateProjectChat(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { projectId } = req.params;
      const { message, conversationHistory = [], repositoryUrl, documentContents } = req.body;
      const userId = req.user!.id;

      if (!projectId || !message) {
        res.status(400).json({ error: 'Project ID and message are required' });
        return;
      }

      // Verify user is sponsor of project
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: {
          id: true,
          sponsorId: true,
          title: true,
          repositoryUrl: true,
          description: true,
          milestones: {
            select: { id: true },
          },
        },
      });

      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      if (project.sponsorId !== userId) {
        res.status(403).json({ error: 'Only the project sponsor can use orchestrated chat' });
        return;
      }

      // Process uploaded document files
      const uploadedFiles = req.files as Express.Multer.File[] | undefined;
      const parsedDocuments: string[] = [];

      if (uploadedFiles && uploadedFiles.length > 0) {
        logger.info('[Chat] Processing uploaded documents', {
          count: uploadedFiles.length,
          files: uploadedFiles.map((f) => ({ name: f.originalname, size: f.size })),
        });

        for (const file of uploadedFiles) {
          try {
            const content = await DocumentParser.parseFile(file.buffer, file.originalname);
            if (content.trim().length > 0) {
              parsedDocuments.push(content.trim());
              logger.info('[Chat] Successfully parsed document', {
                filename: file.originalname,
                contentLength: content.length,
              });
            }
          } catch (error) {
            logger.error('[Chat] Failed to parse document', {
              filename: file.originalname,
              error,
            });
          }
        }
      }

      // Combine with inline document content if provided
      const finalDocumentContents: string[] = [...parsedDocuments];
      if (documentContents && typeof documentContents === 'string' && documentContents.trim()) {
        finalDocumentContents.push(documentContents.trim());
      } else if (Array.isArray(documentContents)) {
        finalDocumentContents.push(
          ...documentContents.filter((d) => typeof d === 'string' && d.trim())
        );
      }

      // Build project context for intelligent routing
      const projectCtx = {
        hasRepository: !!project.repositoryUrl,
        hasMilestones: project.milestones.length > 0,
        repositoryUrl: project.repositoryUrl || undefined,
        description: project.description || undefined,
      };

      // Use AI orchestration service for intelligent routing
      const { AIChatOrchestrationService } = await import(
        '../services/ai-chat-orchestration.service'
      );
      const orchestrationService = new AIChatOrchestrationService();

      const result = await orchestrationService.orchestrateChat({
        message,
        projectId,
        conversationHistory: conversationHistory.map((msg: { role: string; content: string }) => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })),
        repositoryUrl: repositoryUrl || project.repositoryUrl || undefined,
        documentContents: finalDocumentContents.length > 0 ? finalDocumentContents : undefined,
        projectContext: projectCtx,
      });

      res.json({
        intent: result.intent,
        chatResponse: result.chatResponse,
        artifacts: result.artifacts,
        codebaseContext: result.codebaseContext,
        nextActions: result.nextActions,
      });
    } catch (error) {
      logger.error('Error in orchestrateProjectChat:', error);
      next(error);
    }
  }

  /**
   * POST /api/chat/projects/:projectId/orchestrate/stream
   * Streaming version of orchestrated chat for real-time responses
   */
  async streamOrchestrationChat(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const { message, conversationHistory = [], repositoryUrl, documentContents } = req.body;
      const userId = req.user!.id;

      if (!projectId || !message) {
        res.status(400).json({ error: 'Project ID and message are required' });
        return;
      }

      // Process uploaded document files (same as non-streaming endpoint)
      const uploadedFiles = req.files as Express.Multer.File[] | undefined;
      const parsedDocuments: string[] = [];

      if (uploadedFiles && uploadedFiles.length > 0) {
        logger.info('[Chat Stream] Processing uploaded documents', {
          count: uploadedFiles.length,
          files: uploadedFiles.map((f) => ({
            name: f.originalname,
            size: f.size,
            type: f.mimetype,
          })),
        });

        for (const file of uploadedFiles) {
          try {
            logger.info('[Chat Stream] Parsing document', {
              filename: file.originalname,
              size: file.size,
              type: file.mimetype,
            });

            const content = await DocumentParser.parseFile(file.buffer, file.originalname);

            if (content.trim().length > 0) {
              parsedDocuments.push(content.trim());
              logger.info('[Chat Stream] ✅ Successfully parsed document', {
                filename: file.originalname,
                contentLength: content.length,
              });
            } else {
              logger.warn('[Chat Stream] ⚠️ Document parsing returned empty content', {
                filename: file.originalname,
              });
            }
          } catch (error) {
            logger.error('[Chat Stream] ❌ Failed to parse document', {
              filename: file.originalname,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }

      // Combine with inline document content if provided
      const finalDocumentContents: string[] = [...parsedDocuments];
      if (documentContents && typeof documentContents === 'string' && documentContents.trim()) {
        finalDocumentContents.push(documentContents.trim());
      } else if (Array.isArray(documentContents)) {
        finalDocumentContents.push(
          ...documentContents.filter((d) => typeof d === 'string' && d.trim())
        );
      }

      logger.info('[Chat Stream] Total documents to process', {
        uploadedCount: parsedDocuments.length,
        totalCount: finalDocumentContents.length,
      });

      // Verify user is sponsor of project
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: {
          id: true,
          sponsorId: true,
          title: true,
          repositoryUrl: true,
          description: true,
          repoAnalysisStatus: true,
          repoEmbeddingsCount: true,
          repoFilesIndexed: true,
          milestones: {
            select: { id: true },
          },
        },
      });

      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      if (project.sponsorId !== userId) {
        res.status(403).json({ error: 'Only the project sponsor can use orchestrated chat' });
        return;
      }

      // Build project context
      const projectCtx = {
        hasRepository: !!project.repositoryUrl,
        hasMilestones: project.milestones.length > 0,
        repositoryUrl: project.repositoryUrl || undefined,
        description: project.description || undefined,
      };

      // Use AI orchestration service
      const { AIChatOrchestrationService } = await import(
        '../services/ai-chat-orchestration.service'
      );
      const orchestrationService = new AIChatOrchestrationService();

      // First classify intent
      const intent = await orchestrationService.classifyIntent(
        message,
        conversationHistory.map((msg: { role: string; content: string }) => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })),
        projectCtx
      );

      // Set headers for streaming
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      // Get or create conversation
      let conversation = await prisma.chatConversation.findFirst({
        where: {
          userId,
          projectId,
          contextType: 'project_orchestration',
        },
      });

      if (!conversation) {
        conversation = await prisma.chatConversation.create({
          data: {
            userId,
            projectId,
            contextType: 'project_orchestration',
            title: `Chat - ${project.title}`,
          },
        });
      }

      // Save user message
      await prisma.chatMessage.create({
        data: {
          conversationId: conversation.id,
          role: 'user',
          content: message,
        },
      });

      // Check if repository needs analysis
      if (
        project.repositoryUrl &&
        (!project.repoAnalysisStatus || project.repoAnalysisStatus === 'PENDING')
      ) {
        // Trigger repository analysis in background
        try {
          const { inngest } = await import('../lib/inngest');
          await inngest.send({
            name: 'repo/analysis.requested',
            data: {
              projectId,
              repositoryUrl: project.repositoryUrl,
              userId,
            },
          });
          logger.info('[Chat] Triggered repository analysis for project', { projectId });
        } catch (error) {
          logger.warn('[Chat] Failed to trigger repository analysis:', error);
        }
      }

      // Send intent first
      res.write(`data: ${JSON.stringify({ type: 'intent', intent: intent.intent })}\n\n`);

      let fullResponse = '';

      // For information queries, stream the response
      if (intent.intent === 'information_query' || intent.intent === 'general_chat') {
        // Get codebase context if needed
        let codebaseContext;
        if (intent.requiresCodebaseAccess && project.repositoryUrl) {
          // Check if repo is indexed
          const isIndexed =
            project.repoAnalysisStatus === 'COMPLETED' &&
            project.repoEmbeddingsCount &&
            project.repoEmbeddingsCount > 0;

          if (isIndexed) {
            // Use semantic search for indexed repos
            codebaseContext = await orchestrationService.getCodebaseContext(message, projectId, 8);
          } else {
            // Notify that analysis is pending
            res.write(
              `data: ${JSON.stringify({ type: 'context_status', status: 'analyzing', message: 'Repository analysis in progress. Responses may be limited until complete.' })}\n\n`
            );
          }
        }

        const streamResult = await orchestrationService.streamInformationQuery(
          message,
          projectId,
          conversationHistory.map((msg: { role: string; content: string }) => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
          })),
          codebaseContext,
          finalDocumentContents.length > 0 ? finalDocumentContents : undefined
        );

        // Stream the text
        for await (const chunk of streamResult.textStream) {
          fullResponse += chunk;
          res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
        }

        // Save assistant message
        const assistantMessage = await prisma.chatMessage.create({
          data: {
            conversationId: conversation.id,
            role: 'assistant',
            content: fullResponse,
          },
        });

        res.write(`data: ${JSON.stringify({ type: 'done', messageId: assistantMessage.id })}\n\n`);
        res.end();
      } else if (intent.intent === 'milestone_generation') {
        // Trigger milestone generation workflow
        try {
          const { inngest } = await import('../lib/inngest');

          // Send initial acknowledgment
          const ackMessage =
            "🚀 I'll analyze your requirements and generate a comprehensive roadmap with milestones and sub-milestones. This will take a moment...\n\n📊 Processing:\n- Analyzing requirements\n- Creating milestone structure\n- Breaking down into actionable tasks";

          res.write(`data: ${JSON.stringify({ type: 'chunk', content: ackMessage })}\n\n`);

          // Save assistant acknowledgment
          const assistantMessage = await prisma.chatMessage.create({
            data: {
              conversationId: conversation.id,
              role: 'assistant',
              content: ackMessage,
            },
          });

          // Fetch uploaded documents (PRDs, requirements, etc.)
          const projectDocuments = await prisma.document.findMany({
            where: {
              projectId,
              milestoneId: null, // Only project-level documents, not milestone-specific
            },
            select: {
              fileUrl: true,
              fileName: true,
            },
          });

          const documentUrls = projectDocuments.map((doc) => doc.fileUrl);

          // Process uploaded document files
          const uploadedFiles = req.files as Express.Multer.File[] | undefined;
          const parsedDocuments: string[] = [];
          const savedDocumentUrls: string[] = [];

          if (uploadedFiles && uploadedFiles.length > 0) {
            logger.info('[Chat] Processing uploaded documents', {
              count: uploadedFiles.length,
              files: uploadedFiles.map((f) => ({
                name: f.originalname,
                size: f.size,
                type: f.mimetype,
              })),
            });

            for (const file of uploadedFiles) {
              try {
                logger.info('[Chat] Parsing document', {
                  filename: file.originalname,
                  size: file.size,
                  type: file.mimetype,
                });

                const content = await DocumentParser.parseFile(file.buffer, file.originalname);

                if (content.trim().length > 0) {
                  parsedDocuments.push(content.trim());
                  logger.info('[Chat] ✅ Successfully parsed document', {
                    filename: file.originalname,
                    contentLength: content.length,
                    previewStart: content.substring(0, 100),
                  });

                  // Upload to S3 for persistence
                  try {
                    const s3Key = `projects/${projectId}/documents/${Date.now()}-${file.originalname}`;
                    const s3Url = await uploadToS3(s3Key, file.buffer, file.mimetype);
                    savedDocumentUrls.push(s3Url);

                    // Chunk document for embeddings (1000 chars per chunk with 200 overlap)
                    const chunks = this.chunkText(content.trim(), 1000, 200);
                    logger.info('[Chat] 📝 Document chunked', {
                      filename: file.originalname,
                      chunksCount: chunks.length,
                    });

                    // Generate embeddings and store in Qdrant
                    const vectorRefIds: string[] = [];
                    for (let i = 0; i < chunks.length; i++) {
                      const chunk = chunks[i];
                      try {
                        const embedding = await aiOrchestrator.generateEmbedding(chunk);
                        const pointId = uuidv4();
                        vectorRefIds.push(pointId);

                        await qdrantClient.upsert(QDRANT_COLLECTIONS.PROJECT_DOCUMENTS, {
                          wait: true,
                          points: [
                            {
                              id: pointId,
                              vector: embedding,
                              payload: {
                                projectId,
                                fileName: file.originalname,
                                fileUrl: s3Url,
                                content: chunk,
                                chunkIndex: i,
                                totalChunks: chunks.length,
                                uploadedBy: userId,
                                createdAt: new Date().toISOString(),
                              },
                            },
                          ],
                        });
                      } catch (embeddingError) {
                        logger.error('[Chat] Failed to generate embedding for chunk', {
                          filename: file.originalname,
                          chunkIndex: i,
                          error:
                            embeddingError instanceof Error
                              ? embeddingError.message
                              : String(embeddingError),
                        });
                      }
                    }

                    // Save to database
                    await prisma.document.create({
                      data: {
                        projectId,
                        fileName: file.originalname,
                        fileUrl: s3Url,
                        fileType: file.mimetype,
                        fileSizeBytes: file.size,
                        vectorRefIds,
                        uploadedBy: userId,
                      },
                    });

                    logger.info('[Chat] 💾 Document saved to S3, database, and Qdrant', {
                      filename: file.originalname,
                      s3Url,
                      vectorRefIds: vectorRefIds.length,
                      chunks: chunks.length,
                    });
                  } catch (uploadError) {
                    logger.error('[Chat] Failed to save document', {
                      filename: file.originalname,
                      error:
                        uploadError instanceof Error ? uploadError.message : String(uploadError),
                    });
                  }
                } else {
                  logger.warn('[Chat] ⚠️ Document parsing returned empty content', {
                    filename: file.originalname,
                  });
                }
              } catch (error) {
                logger.error('[Chat] ❌ Failed to parse document', {
                  filename: file.originalname,
                  error: error instanceof Error ? error.message : String(error),
                });
              }
            }
          }

          // Also support inline document contents from chat (user pasted PRD directly)
          let inlineDocumentContent: string | undefined;
          if (
            documentContents &&
            typeof documentContents === 'string' &&
            documentContents.trim().length > 0
          ) {
            inlineDocumentContent = documentContents.trim();
            logger.info('[Chat] Received inline document content', {
              length: inlineDocumentContent.length,
            });
          }

          // Combine all document sources
          const allDocumentContents = [
            ...parsedDocuments,
            ...(inlineDocumentContent ? [inlineDocumentContent] : []),
          ].join('\n\n---\n\n'); // Separate multiple documents

          // Combine all document URLs (existing + newly uploaded)
          const allDocumentUrls = [...documentUrls, ...savedDocumentUrls];

          logger.info('[Chat] 📊 Milestone generation triggered with context', {
            projectId,
            existingS3DocumentsCount: documentUrls.length,
            newlyUploadedCount: savedDocumentUrls.length,
            totalS3DocumentsCount: allDocumentUrls.length,
            uploadedFilesCount: parsedDocuments.length,
            uploadedFilesTotal: parsedDocuments.reduce((sum, doc) => sum + doc.length, 0),
            hasInlineContent: !!inlineDocumentContent,
            hasRepository: !!project.repositoryUrl,
            totalDocumentLength: allDocumentContents.length,
            willSendToInngest: allDocumentContents.length > 0,
          });

          if (allDocumentContents.length > 0) {
            logger.info('[Chat] 📄 Document content preview (first 200 chars):', {
              preview: allDocumentContents.substring(0, 200),
            });
          }

          // Trigger Inngest workflow with full project context
          await inngest.send({
            name: 'milestone/generate.requested',
            data: {
              projectId,
              prompt: message,
              projectTitle: project.title,
              projectDescription: project.description || '',
              documentUrls: allDocumentUrls.length > 0 ? allDocumentUrls : undefined,
              inlineDocument: allDocumentContents.length > 0 ? allDocumentContents : undefined,
              repositoryUrl: project.repositoryUrl || undefined,
              userId,
              existingMilestonesCount: project.milestones.length,
            },
          });

          res.write(
            `data: ${JSON.stringify({ type: 'milestone_generation_started', projectId })}\n\n`
          );
          res.write(
            `data: ${JSON.stringify({ type: 'done', messageId: assistantMessage.id })}\n\n`
          );
          res.end();

          logger.info('[Chat] Triggered milestone generation workflow', { projectId });
        } catch (error) {
          logger.error('[Chat] Failed to trigger milestone generation:', error);
          const errorMsg = 'Failed to start milestone generation. Please try again.';
          res.write(`data: ${JSON.stringify({ type: 'error', error: errorMsg })}\n\n`);
          res.end();
        }
      } else {
        // For other intents, use non-streaming
        const result = await orchestrationService.orchestrateChat({
          message,
          projectId,
          conversationHistory: conversationHistory.map(
            (msg: { role: string; content: string }) => ({
              role: msg.role as 'user' | 'assistant',
              content: msg.content,
            })
          ),
          repositoryUrl: repositoryUrl || project.repositoryUrl || undefined,
          documentContents,
          projectContext: projectCtx,
        });

        // Save assistant message
        const assistantMessage = await prisma.chatMessage.create({
          data: {
            conversationId: conversation.id,
            role: 'assistant',
            content: result.chatResponse,
          },
        });

        res.write(
          `data: ${JSON.stringify({ type: 'complete', response: result.chatResponse, artifacts: result.artifacts })}\n\n`
        );
        res.write(`data: ${JSON.stringify({ type: 'done', messageId: assistantMessage.id })}\n\n`);
        res.end();
      }
    } catch (error) {
      logger.error('Error in streamOrchestrationChat:', error);
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'Stream error' })}\n\n`);
      res.end();
    }
  }

  /**
   * Chunk text into overlapping segments for embedding
   */
  private chunkText(text: string, chunkSize: number = 1000, overlap: number = 200): string[] {
    const chunks: string[] = [];
    let startIndex = 0;

    while (startIndex < text.length) {
      const endIndex = Math.min(startIndex + chunkSize, text.length);
      chunks.push(text.substring(startIndex, endIndex));
      startIndex += chunkSize - overlap;
    }

    return chunks;
  }
}

export const chatController = new ChatController();
