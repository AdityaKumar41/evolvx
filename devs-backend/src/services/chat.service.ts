import { anthropic } from '@ai-sdk/anthropic';
import { generateText, streamText, CoreMessage } from 'ai';
import { prisma } from '../lib/prisma';
import { qdrantClient } from '../lib/qdrant';
import { logger } from '../utils/logger';
import { aiOrchestrator } from './ai.service';
import { repoEmbeddingService } from './repo-embedding.service';


interface ChatContext {
  userId: string;
  projectId?: string;
  subMilestoneId?: string;
  contextType: 'general' | 'project' | 'task' | 'milestone';
}

interface ChatRequest {
  conversationId?: string;
  message: string;
  context: ChatContext;
}

interface RetrievedContext {
  type: 'project' | 'milestone' | 'contribution' | 'document';
  content: string;
  score: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: any;
}

export class ChatService {
  private readonly model = anthropic('claude-3-5-sonnet-20241022');
  private readonly collectionName = 'devsponsor_embeddings';
  private readonly maxHistoryMessages = 10;

  /**
   * Stream chat responses with context awareness
   */
  async streamChat(request: ChatRequest) {
    try {
      const { conversationId, message, context } = request;

      // Get or create conversation
      let conversation = conversationId
        ? await prisma.chatConversation.findUnique({
            where: { id: conversationId },
            include: { messages: { orderBy: { createdAt: 'asc' }, take: this.maxHistoryMessages } },
          })
        : null;

      if (!conversation) {
        conversation = await prisma.chatConversation.create({
          data: {
            userId: context.userId,
            projectId: context.projectId,
            subMilestoneId: context.subMilestoneId,
            contextType: context.contextType,
            title: message.substring(0, 100),
          },
          include: { messages: true },
        });
      }

      // Retrieve relevant context from Qdrant
      const retrievedContext = await this.retrieveContext(message, context);

      // Build system prompt with context
      const systemPrompt = this.buildSystemPrompt(context, retrievedContext);

      // Build message history
      const messages: CoreMessage[] = [
        { role: 'system', content: systemPrompt },
        ...conversation.messages.map((msg) => ({
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content,
        })),
        { role: 'user' as const, content: message },
      ];

      // Save user message
      await prisma.chatMessage.create({
        data: {
          conversationId: conversation.id,
          role: 'user',
          content: message,
        },
      });

      // Stream response
      const result = await streamText({
        model: this.model,
        messages,
        temperature: 0.7,
      });

      // Collect full response for saving
      let fullResponse = '';
      let tokenCount = 0;

      const transformedStream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of result.textStream) {
              fullResponse += chunk;
              controller.enqueue(chunk);
            }

            // Save assistant message after streaming completes
            const usage = await result.usage;
            tokenCount = usage?.totalTokens || 0;

            await prisma.chatMessage.create({
              data: {
                conversationId: conversation!.id,
                role: 'assistant',
                content: fullResponse,
                tokens: tokenCount,
                model: 'claude-3-5-sonnet-20241022',
                contextRetrieved: JSON.parse(JSON.stringify(retrievedContext)),
              },
            });

            controller.close();
          } catch (error) {
            logger.error('Error in chat stream:', error);
            controller.error(error);
          }
        },
      });

      return {
        conversationId: conversation.id,
        stream: transformedStream,
      };
    } catch (error) {
      logger.error('Error streaming chat:', error);
      throw error;
    }
  }

  /**
   * Get chat response without streaming (for background tasks)
   */
  async getChatResponse(
    request: ChatRequest
  ): Promise<{ conversationId: string; response: string }> {
    try {
      const { conversationId, message, context } = request;

      // Get or create conversation
      let conversation = conversationId
        ? await prisma.chatConversation.findUnique({
            where: { id: conversationId },
            include: { messages: { orderBy: { createdAt: 'asc' }, take: this.maxHistoryMessages } },
          })
        : null;

      if (!conversation) {
        conversation = await prisma.chatConversation.create({
          data: {
            userId: context.userId,
            projectId: context.projectId,
            subMilestoneId: context.subMilestoneId,
            contextType: context.contextType,
            title: message.substring(0, 100),
          },
          include: { messages: true },
        });
      }

      // Retrieve relevant context from Qdrant
      const retrievedContext = await this.retrieveContext(message, context);

      // Build system prompt with context
      const systemPrompt = this.buildSystemPrompt(context, retrievedContext);

      // Build message history
      const messages: CoreMessage[] = [
        { role: 'system', content: systemPrompt },
        ...conversation.messages.map((msg) => ({
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content,
        })),
        { role: 'user' as const, content: message },
      ];

      // Save user message
      await prisma.chatMessage.create({
        data: {
          conversationId: conversation.id,
          role: 'user',
          content: message,
        },
      });

      // Generate response
      const result = await generateText({
        model: this.model,
        messages,
        temperature: 0.7,
      });

      // Save assistant message
      await prisma.chatMessage.create({
        data: {
          conversationId: conversation.id,
          role: 'assistant',
          content: result.text,
          tokens: result.usage.totalTokens,
          model: 'claude-3-5-sonnet-20241022',
          contextRetrieved: JSON.parse(JSON.stringify(retrievedContext)),
        },
      });

      return {
        conversationId: conversation.id,
        response: result.text,
      };
    } catch (error) {
      logger.error('Error getting chat response:', error);
      throw error;
    }
  }

  /**
   * Get conversation history
   */
  async getConversationHistory(conversationId: string, limit: number = 50) {
    try {
      const conversation = await prisma.chatConversation.findUnique({
        where: { id: conversationId },
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: limit,
          },
          user: { select: { id: true, githubUsername: true, avatarUrl: true, role: true } },
          project: { select: { id: true, title: true, status: true } },
          subMilestone: { select: { id: true, description: true, status: true } },
        },
      });

      if (!conversation) {
        throw new Error('Conversation not found');
      }

      return {
        ...conversation,
        messages: conversation.messages.reverse(),
      };
    } catch (error) {
      logger.error('Error getting conversation history:', error);
      throw error;
    }
  }

  /**
   * List user conversations
   */
  async getUserConversations(userId: string, limit: number = 20) {
    try {
      const conversations = await prisma.chatConversation.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        take: limit,
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          project: { select: { id: true, title: true } },
          subMilestone: { select: { id: true, description: true } },
        },
      });

      return conversations;
    } catch (error) {
      logger.error('Error getting user conversations:', error);
      throw error;
    }
  }

  /**
   * Delete conversation
   */
  async deleteConversation(conversationId: string, userId: string) {
    try {
      const conversation = await prisma.chatConversation.findFirst({
        where: { id: conversationId, userId },
      });

      if (!conversation) {
        throw new Error('Conversation not found or unauthorized');
      }

      await prisma.chatConversation.delete({
        where: { id: conversationId },
      });

      return { success: true };
    } catch (error) {
      logger.error('Error deleting conversation:', error);
      throw error;
    }
  }

  /**
   * Retrieve relevant context from Qdrant vector database
   */
  private async retrieveContext(query: string, context: ChatContext): Promise<RetrievedContext[]> {
    try {
      const retrievedContexts: RetrievedContext[] = [];

      // Generate embedding for the query using Anthropic
      const embedding = await this.generateEmbedding(query);

      // Search Qdrant with filters based on context
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const filter: any = {
        must: [{ key: 'userId', match: { value: context.userId } }],
      };

      if (context.projectId) {
        filter.must.push({ key: 'projectId', match: { value: context.projectId } });
      }

      if (context.subMilestoneId) {
        filter.must.push({ key: 'subMilestoneId', match: { value: context.subMilestoneId } });
      }

      const searchResults = await qdrantClient.search(this.collectionName, {
        vector: embedding,
        filter,
        limit: 3,
        with_payload: true,
      });

      retrievedContexts.push(
        ...searchResults.map((result) => ({
          type: result.payload?.type as 'project' | 'milestone' | 'contribution' | 'document',
          content: result.payload?.content as string,
          score: result.score,
          metadata: result.payload?.metadata,
        }))
      );

      // If project context, also search repository code
      if (context.projectId) {
        try {
          const codeContexts = await repoEmbeddingService.searchCodeContext(
            context.projectId,
            query,
            2
          );

          retrievedContexts.push(
            ...codeContexts.map((ctx) => ({
              type: 'document' as const,
              content: `File: ${ctx.filePath}\n\`\`\`${ctx.language}\n${ctx.content}\n\`\`\``,
              score: ctx.score,
              metadata: { filePath: ctx.filePath, language: ctx.language },
            }))
          );
        } catch (error) {
          logger.warn('[Chat] Failed to retrieve code context:', error);
        }
      }

      return retrievedContexts;
    } catch (error) {
      logger.error('Error retrieving context from Qdrant:', error);
      return [];
    }
  }

  /**
   * Generate embedding for text using OpenAI's text-embedding model
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    return aiOrchestrator.generateEmbedding(text);
  }

  /**
   * Build system prompt with context awareness
   */
  private buildSystemPrompt(context: ChatContext, retrievedContext: RetrievedContext[]): string {
    const basePrompt = `You are an AI assistant for DevSponsor, a platform that connects developers with sponsors for open-source contributions.

Your role is to help users with:
- Understanding project requirements and milestones
- Suggesting tasks and providing implementation guidance
- Explaining progress and payment status
- Providing re-scoping recommendations when needed
- Answering questions about the verification and payment process

Always be helpful, clear, and concise. Focus on actionable advice.`;

    let contextInfo = '';

    if (context.contextType === 'project' && retrievedContext.length > 0) {
      contextInfo = `\n\n**Current Project Context:**\n`;
      retrievedContext.forEach((ctx, idx) => {
        contextInfo += `\n${idx + 1}. [${ctx.type}] ${ctx.content.substring(0, 200)}...`;
      });
    }

    if (context.contextType === 'task' && retrievedContext.length > 0) {
      contextInfo = `\n\n**Current Task Context:**\n`;
      retrievedContext.forEach((ctx, idx) => {
        contextInfo += `\n${idx + 1}. [${ctx.type}] ${ctx.content.substring(0, 200)}...`;
      });
    }

    return basePrompt + contextInfo;
  }

  /**
   * Generate task suggestions for a project or milestone
   */
  async generateTaskSuggestions(projectId: string, milestoneId?: string): Promise<string[]> {
    try {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          milestones: {
            where: milestoneId ? { id: milestoneId } : undefined,
            include: { subMilestones: true },
          },
        },
      });

      if (!project) {
        throw new Error('Project not found');
      }

      const prompt = `Based on the following project details, suggest 5 concrete next tasks that developers could work on:

Project: ${project.title}
Description: ${project.description || 'Not provided'}
Repository: ${project.repositoryUrl || 'Not provided'}

Existing Milestones:
${project.milestones.map((m, i) => `${i + 1}. ${m.title}: ${m.description}`).join('\n')}

Provide task suggestions in a clear, actionable format. Each task should be specific and achievable.`;

      const result = await generateText({
        model: this.model,
        prompt,
        temperature: 0.8,
      });

      // Parse suggestions from response
      const suggestions = result.text
        .split('\n')
        .filter((line) => line.match(/^\d+\./))
        .map((line) => line.replace(/^\d+\.\s*/, '').trim());

      return suggestions.slice(0, 5);
    } catch (error) {
      logger.error('Error generating task suggestions:', error);
      throw error;
    }
  }

  /**
   * Generate re-scoping recommendation
   */
  async generateRescopingRecommendation(subMilestoneId: string): Promise<string> {
    try {
      const subMilestone = await prisma.subMilestone.findUnique({
        where: { id: subMilestoneId },
        include: {
          milestone: {
            include: {
              project: true,
            },
          },
          contributions: {
            include: {
              contributor: { select: { githubUsername: true } },
            },
          },
          prLink: true,
        },
      });

      if (!subMilestone) {
        throw new Error('Sub-milestone not found');
      }

      const prompt = `Analyze the following task and provide a re-scoping recommendation:

Task Description: ${subMilestone.description}
Acceptance Criteria: ${JSON.stringify(subMilestone.acceptanceCriteria)}
Status: ${subMilestone.status}
Estimated Hours: ${subMilestone.estimateHours || 'Not specified'}
Current Progress: ${subMilestone.contributions.length} contributions

Based on this information, provide:
1. Whether the task scope is appropriate
2. Suggestions for breaking it down or expanding it
3. Recommended checkpoint adjustments
4. Risk assessment`;

      const result = await generateText({
        model: this.model,
        prompt,
        temperature: 0.7,
      });

      return result.text;
    } catch (error) {
      logger.error('Error generating rescoping recommendation:', error);
      throw error;
    }
  }

  /**
   * Explain progress for sponsors
   */
  async explainProgress(projectId: string): Promise<string> {
    try {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          milestones: {
            include: {
              subMilestones: {
                include: {
                  contributions: {
                    include: {
                      contributor: { select: { githubUsername: true } },
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!project) {
        throw new Error('Project not found');
      }

      const totalTasks = project.milestones.reduce((sum, m) => sum + m.subMilestones.length, 0);
      const completedTasks = project.milestones.reduce(
        (sum, m) => sum + m.subMilestones.filter((sm) => sm.status === 'COMPLETED').length,
        0
      );
      const inProgressTasks = project.milestones.reduce(
        (sum, m) => sum + m.subMilestones.filter((sm) => sm.status === 'IN_PROGRESS').length,
        0
      );

      const prompt = `Provide a clear, sponsor-friendly progress summary for this project:

Project: ${project.title}
Total Tasks: ${totalTasks}
Completed: ${completedTasks}
In Progress: ${inProgressTasks}
Status: ${project.status}

Milestones:
${project.milestones
  .map(
    (m, i) =>
      `${i + 1}. ${m.title} (${m.subMilestones.filter((sm) => sm.status === 'COMPLETED').length}/${m.subMilestones.length} tasks completed)`
  )
  .join('\n')}

Provide a concise, positive summary highlighting achievements and next steps.`;

      const result = await generateText({
        model: this.model,
        prompt,
        temperature: 0.7,
      });

      return result.text;
    } catch (error) {
      logger.error('Error explaining progress:', error);
      throw error;
    }
  }
}

export const chatService = new ChatService();
