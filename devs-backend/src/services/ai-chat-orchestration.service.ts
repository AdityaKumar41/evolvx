import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { generateText, streamText } from 'ai';
import { z } from 'zod';
import { logger } from '../utils/logger';
import { config } from '../config';

/**
 * Intent Classification Schema
 */
const IntentSchema = z.object({
  intent: z.enum([
    'information_query', // Just asking questions about project/codebase
    'code_analysis', // Want to analyze specific code/files
    'milestone_generation', // Want to create milestones/roadmap from PRD
    'code_modification', // Want to modify/update existing code
    'architecture_review', // Want architecture analysis
    'general_chat', // General conversation
  ]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  requiresCodebaseAccess: z.boolean(),
  requiresMilestoneGeneration: z.boolean(),
  extractedEntities: z.object({
    prds: z.array(z.string()).optional(),
    filesPaths: z.array(z.string()).optional(),
    features: z.array(z.string()).optional(),
    technologies: z.array(z.string()).optional(),
  }),
});

export type Intent = z.infer<typeof IntentSchema>;

/**
 * Response Type for Different Intents
 */
export interface OrchestrationResponse {
  intent: Intent['intent'];
  chatResponse: string;
  streamingResponse?: AsyncIterable<string>;
  artifacts?: {
    type: 'milestones' | 'code_analysis' | 'architecture' | 'roadmap';
    data: unknown;
    shouldStream: boolean;
  };
  codebaseContext?: {
    relevantFiles: Array<{ path: string; content: string; similarity: number }>;
    summary: string;
  };
  nextActions?: Array<{
    action: string;
    description: string;
    requiresConfirmation: boolean;
  }>;
}

/**
 * AI Chat Orchestration Service
 * Routes sponsor queries to appropriate AI workflows
 */
export class AIChatOrchestrationService {
  private claudeModel;
  private gptModel;

  constructor() {
    this.claudeModel = anthropic(config.ai.anthropicModel);
    this.gptModel = openai(config.ai.openaiModel);
  }

  /**
   * Classify the intent of the sponsor's message
   */
  async classifyIntent(
    message: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
    projectContext?: {
      hasRepository: boolean;
      hasMilestones: boolean;
      description?: string;
    }
  ): Promise<Intent> {
    try {
      logger.info('[AI Chat Orchestration] Classifying intent for message');

      const systemPrompt = `You are an AI assistant that analyzes sponsor messages to determine their intent.

Project Context:
- Has Repository: ${projectContext?.hasRepository ? 'Yes' : 'No'}
- Has Milestones: ${projectContext?.hasMilestones ? 'Yes' : 'No'}
- Description: ${projectContext?.description || 'Not provided'}

Intent Categories:
1. information_query: Asking about existing project/codebase/status (e.g., "what's in the code?", "show me files", "what have we built?", "what's the current progress?")
2. code_analysis: Wants detailed analysis of specific code/architecture (e.g., "analyze the auth system", "review security")
3. milestone_generation: ONLY when user is ACTIVELY PROVIDING a detailed PRD/requirements document (MUST be 500+ chars with specific features/requirements)
4. code_modification: Requesting changes/updates to code
5. architecture_review: Wants high-level architecture analysis
6. general_chat: General conversation, clarification, or simple requests

⚠️ RULES FOR milestone_generation:
  Use milestone_generation when user wants to CREATE NEW milestones/roadmap with requirements.

✅ USE milestone_generation when user:
  - Says "generate milestones", "create milestones", "create roadmap", "build milestones", etc.
  - Provides ANY level of project requirements or features (can be brief or detailed)
  - Describes what they want to build and asks for milestones
  - Examples:
    * "Generate milestones for an e-commerce site"
    * "Create milestones for: user auth, posts, comments"
    * "Build a social platform with [features]. Create milestones"
    * "I want to add payment integration and notifications. Generate milestones"

❌ NEVER use milestone_generation for:
  - Questions ABOUT existing milestones: "what are milestones?", "show my milestones" → information_query
  - Questions ABOUT progress: "what's done?", "what's the status?" → information_query  
  - Questions ABOUT the codebase: "what's in the code?", "show me files" → information_query
  - Just chatting about ideas WITHOUT asking to create milestones → general_chat

📋 Quick Classification Guide:
  - "What have we done?" → information_query
  - "Show me the repository" → information_query
  - "Create milestones for [any features]" → milestone_generation
  - "Generate milestones" + any requirements → milestone_generation
  - "Analyze the auth flow" → code_analysis

Previous conversation context:
${conversationHistory
  .slice(-3)
  .map((msg) => `${msg.role}: ${msg.content}`)
  .join('\n')}

Classify the user's intent. Be VERY strict about milestone_generation - only use it when user is actively providing requirements.`;

      const result = await generateText({
        model: this.gptModel,
        system: systemPrompt,
        prompt: `User message: "${message}"

Analyze this message and classify the intent. Consider the conversation context and project state.

Key Decision Points:
- Does the user say "generate", "create", "build" + "milestones" or "roadmap"? → milestone_generation
- Is the user asking ABOUT existing milestones/progress? → information_query
- Is the user asking ABOUT code/repository? → information_query
- Is the user providing requirements/features for milestone generation? → milestone_generation

Respond with JSON:
{
  "intent": "information_query|code_analysis|milestone_generation|code_modification|architecture_review|general_chat",
  "reasoning": "Brief explanation of classification",
  "confidence": 0.0-1.0
}`,
        temperature: 0.2,
      });

      // Parse JSON response
      let parsedIntent: { intent: string; reasoning: string; confidence: number };
      try {
        const jsonMatch = result.text.match(/\{[\s\S]*\}/);
        parsedIntent = jsonMatch
          ? JSON.parse(jsonMatch[0])
          : { intent: 'general_chat', reasoning: 'Parse failed', confidence: 0.5 };
      } catch {
        parsedIntent = { intent: 'general_chat', reasoning: 'Parse error', confidence: 0.5 };
      }

      const intent = parsedIntent.intent as Intent['intent'];

      const requiresCodebase =
        intent === 'code_analysis' ||
        intent === 'information_query' ||
        intent === 'architecture_review' ||
        message.toLowerCase().includes('code') ||
        message.toLowerCase().includes('repository');

      // Trigger milestone generation if:
      // 1. Intent is milestone_generation (user explicitly asks to generate/create milestones)
      // 2. OR message contains milestone generation keywords + some requirements/features
      const explicitlyAsksForMilestones =
        /generate.{0,30}milestone|create.{0,30}milestone|build.{0,30}milestone|generate.{0,30}roadmap|create.{0,30}roadmap|build.{0,30}roadmap/i.test(
          message
        );

      const hasAnyRequirements =
        message.length > 50 && // At least some content
        (/build|implement|develop|feature|requirement|add|create|make|want|need/i.test(message) ||
          message.includes(',') || // Lists of features
          message.includes('\n')); // Multi-line requirements

      // Trigger milestone generation if intent is classified as such
      // OR if explicitly asking for milestones with any requirements
      const requiresMilestones =
        intent === 'milestone_generation' || (explicitlyAsksForMilestones && hasAnyRequirements);

      logger.info(
        `[AI Chat Orchestration] Intent: ${intent}, Requires Milestones: ${requiresMilestones}, Reasoning: ${parsedIntent.reasoning}`
      );

      return {
        intent,
        confidence: parsedIntent.confidence,
        reasoning: parsedIntent.reasoning,
        requiresCodebaseAccess: requiresCodebase && projectContext?.hasRepository === true,
        requiresMilestoneGeneration: requiresMilestones,
        extractedEntities: {
          prds: [],
          filesPaths: [],
          features: [],
          technologies: [],
        },
      };
    } catch (error) {
      logger.error('[AI Chat Orchestration] Intent classification failed:', error);
      // Default to general chat on error
      return {
        intent: 'general_chat',
        confidence: 0.5,
        reasoning: 'Failed to classify intent',
        requiresCodebaseAccess: false,
        requiresMilestoneGeneration: false,
        extractedEntities: {},
      };
    }
  }

  /**
   * Get relevant codebase context using vector search
   */
  async getCodebaseContext(
    query: string,
    projectId: string,
    limit: number = 5
  ): Promise<OrchestrationResponse['codebaseContext']> {
    try {
      logger.info('[AI Chat Orchestration] Fetching codebase context');

      // Use vector search service to find relevant code
      const { vectorSearchService } = await import('./vector-search.service');
      const contextResult = await vectorSearchService.getCodebaseContext(projectId, query, limit);

      return {
        relevantFiles: contextResult.relevantFiles.map((file) => ({
          path: file.filePath,
          content: file.content.substring(0, 2000), // Limit content size
          similarity: file.score,
        })),
        summary: contextResult.summary,
      };
    } catch (error) {
      logger.error('[AI Chat Orchestration] Failed to get codebase context:', error);
      return {
        relevantFiles: [],
        summary: 'Unable to access codebase context. Repository may not be indexed yet.',
      };
    }
  }

  /**
   * Handle information query - just answer questions
   */
  async handleInformationQuery(
    message: string,
    _projectId: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
    codebaseContext?: OrchestrationResponse['codebaseContext']
  ): Promise<OrchestrationResponse> {
    logger.info('[AI Chat Orchestration] Handling information query');

    const systemPrompt = `You are a helpful AI assistant for DevSponsor platform. Answer questions about the project and codebase.

${
  codebaseContext
    ? `\nRelevant Code Context:\n${codebaseContext.summary}\n\nFiles analyzed:\n${codebaseContext.relevantFiles.map((f) => `- ${f.path}`).join('\n')}`
    : ''
}

Be concise and helpful. If you reference code, mention the file path.`;

    const conversationContext = conversationHistory
      .slice(-5)
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join('\n');

    try {
      const response = await generateText({
        model: this.claudeModel,
        system: systemPrompt,
        prompt: `Previous conversation:\n${conversationContext}\n\nUser: ${message}`,
        temperature: 0.7,
      });

      return {
        intent: 'information_query',
        chatResponse: response.text,
        codebaseContext,
        nextActions: codebaseContext
          ? [
              {
                action: 'deep_analysis',
                description: 'Would you like a detailed analysis of these files?',
                requiresConfirmation: true,
              },
            ]
          : undefined,
      };
    } catch (error) {
      logger.error('[AI Chat Orchestration] Information query failed:', error);
      throw error;
    }
  }

  /**
   * Stream information query response for real-time chat experience
   */
  async streamInformationQuery(
    message: string,
    _projectId: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
    codebaseContext?: OrchestrationResponse['codebaseContext'],
    documentContents?: string[]
  ) {
    logger.info('[AI Chat Orchestration] Streaming information query', {
      hasCodebaseContext: !!codebaseContext,
      hasDocuments: !!documentContents && documentContents.length > 0,
      documentCount: documentContents?.length || 0,
    });

    const systemPrompt = `You are a helpful AI assistant for DevSponsor platform. Answer questions about the project and codebase.

${
  codebaseContext
    ? `\nRelevant Code Context:\n${codebaseContext.summary}\n\nFiles analyzed:\n${codebaseContext.relevantFiles.map((f) => `- ${f.path}`).join('\n')}`
    : ''
}

${
  documentContents && documentContents.length > 0
    ? `\nProject Documents & Requirements:\n${documentContents.map((doc, i) => `### Document ${i + 1}\n${doc}`).join('\n\n')}`
    : ''
}

Be concise and helpful. If you reference code or documents, mention the source. Use the document content above to provide accurate answers about requirements and specifications.`;

    const conversationContext = conversationHistory
      .slice(-5)
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join('\n');

    try {
      const result = streamText({
        model: this.claudeModel,
        system: systemPrompt,
        prompt: `Previous conversation:\n${conversationContext}\n\nUser: ${message}`,
        temperature: 0.7,
      });

      return result;
    } catch (error) {
      logger.error('[AI Chat Orchestration] Stream information query failed:', error);
      throw error;
    }
  }

  /**
   * Handle milestone generation - create roadmap from PRD
   */
  async handleMilestoneGeneration(
    message: string,
    _projectId: string,
    repositoryUrl?: string,
    documentContents?: string[]
  ): Promise<OrchestrationResponse> {
    logger.info('[AI Chat Orchestration] Handling milestone generation', {
      messageLength: message.length,
      hasDocuments: !!documentContents && documentContents.length > 0,
      documentCount: documentContents?.length || 0,
      hasRepo: !!repositoryUrl,
    });

    // Check if we have ANY substantial context (message, documents, or repository)
    const totalContentLength = message.length + (documentContents?.join('').length || 0);
    const hasDocumentContext = documentContents && documentContents.length > 0;
    const hasRepoContext = !!repositoryUrl;

    // Very lenient validation - allow if:
    // 1. User explicitly wants milestones (already classified as milestone_generation intent)
    // 2. Has some content (message + documents)
    // 3. OR has repository to analyze
    const hasMinimalRequirements =
      message.length > 30 || // At least a short request
      hasDocumentContext || // Or uploaded documents
      hasRepoContext; // Or repository to analyze

    if (!hasMinimalRequirements) {
      logger.warn('[AI Chat Orchestration] Insufficient context for milestone generation', {
        messageLength: message.length,
        hasDocuments: hasDocumentContext,
        hasRepo: hasRepoContext,
      });
      return {
        intent: 'general_chat',
        chatResponse: `To generate milestones, please provide:

📋 **Option 1**: Describe your requirements
- List the features you want to build
- Mention the technologies and tools you plan to use
- Describe the main functionality

💡 **Option 2**: Upload a PRD document
- Attach a PDF, Markdown, or text file with your requirements
- The more detail, the better the milestones

🔗 **Option 3**: Connect a repository
- Link your GitHub repository if you're building on existing code
- I'll analyze the codebase and create relevant milestones

**Tip**: The more context you provide (detailed requirements + documents + repository), the more accurate and specific your milestones will be!`,
      };
    }

    // Generate appropriate acknowledgment based on available context
    let ackResponse = `🚀 I'll analyze your requirements and generate a comprehensive roadmap with milestones.\n\n`;

    if (hasDocumentContext) {
      ackResponse += `📄 Processing ${documentContents!.length} document(s) with detailed requirements\n`;
    }
    if (hasRepoContext) {
      ackResponse += `🔗 Analyzing repository structure and codebase\n`;
    }
    ackResponse += `\n⏳ This will take a moment...`;

    logger.info('[AI Chat Orchestration] Proceeding with milestone generation', {
      totalContentLength,
      hasDocuments: hasDocumentContext,
      hasRepo: hasRepoContext,
    });

    // Return response with instruction to trigger milestone workflow
    return {
      intent: 'milestone_generation',
      chatResponse: ackResponse,
      artifacts: {
        type: 'milestones',
        data: {
          status: 'generating',
          message: 'Milestone generation workflow triggered',
          prompt: message,
          repositoryUrl,
          documentContents: documentContents,
        },
        shouldStream: true,
      },
      nextActions: [
        {
          action: 'trigger_milestone_workflow',
          description: 'Generate milestones from requirements',
          requiresConfirmation: false,
        },
      ],
    };
  }

  /**
   * Handle code analysis - deep dive into architecture
   */
  async handleCodeAnalysis(
    message: string,
    _projectId: string,
    codebaseContext: OrchestrationResponse['codebaseContext']
  ): Promise<OrchestrationResponse> {
    logger.info('[AI Chat Orchestration] Handling code analysis');

    const systemPrompt = `You are an expert code analyst. Provide detailed technical analysis of the codebase.

Codebase Context:
${codebaseContext?.summary}

Files to analyze:
${codebaseContext?.relevantFiles.map((f, i) => `\nFile ${i + 1}: ${f.path}\n${f.content.slice(0, 1000)}`).join('\n')}

Provide:
1. Architecture overview
2. Key patterns and practices
3. Potential improvements
4. Dependencies and relationships`;

    try {
      const response = await generateText({
        model: this.claudeModel,
        system: systemPrompt,
        prompt: message,
        temperature: 0.5,
      });

      return {
        intent: 'code_analysis',
        chatResponse: response.text,
        codebaseContext,
        artifacts: {
          type: 'code_analysis',
          data: {
            files: codebaseContext?.relevantFiles.map((f) => f.path),
            analysis: response.text,
          },
          shouldStream: false,
        },
      };
    } catch (error) {
      logger.error('[AI Chat Orchestration] Code analysis failed:', error);
      throw error;
    }
  }

  /**
   * Main orchestration method - routes to appropriate handler
   */
  async orchestrateChat(params: {
    message: string;
    projectId: string;
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
    repositoryUrl?: string;
    documentContents?: string[];
    projectContext?: {
      hasRepository: boolean;
      hasMilestones: boolean;
      repositoryUrl?: string;
      description?: string;
    };
  }): Promise<OrchestrationResponse> {
    const {
      message,
      projectId,
      conversationHistory,
      repositoryUrl,
      documentContents,
      projectContext,
    } = params;
    try {
      logger.info('[AI Chat Orchestration] Starting orchestration');

      // Step 1: Classify intent
      const intent = await this.classifyIntent(message, conversationHistory, projectContext);
      logger.info(`[AI Chat Orchestration] Classified intent: ${intent.intent}`);

      // Step 2: Get codebase context if needed
      let codebaseContext: OrchestrationResponse['codebaseContext'] | undefined;
      if (intent.requiresCodebaseAccess && projectContext?.hasRepository) {
        codebaseContext = await this.getCodebaseContext(message, projectId);
      }

      // Step 3: Route to appropriate handler
      switch (intent.intent) {
        case 'information_query':
          return await this.handleInformationQuery(
            message,
            projectId,
            conversationHistory,
            codebaseContext
          );

        case 'milestone_generation':
          return await this.handleMilestoneGeneration(
            message,
            projectId,
            repositoryUrl || projectContext?.repositoryUrl,
            documentContents
          );

        case 'code_analysis':
        case 'architecture_review':
          if (!codebaseContext) {
            return {
              intent: intent.intent,
              chatResponse:
                'I need access to the repository to perform code analysis. Please ensure a repository is connected to this project.',
            };
          }
          return await this.handleCodeAnalysis(message, projectId, codebaseContext);

        case 'code_modification':
          return {
            intent: 'code_modification',
            chatResponse:
              'Code modification requests are best handled through pull requests and milestones. Would you like me to create milestones for these changes?',
            nextActions: [
              {
                action: 'create_milestones_for_changes',
                description: 'Create structured milestones for the requested changes',
                requiresConfirmation: true,
              },
            ],
          };

        case 'general_chat':
        default: {
          const response = await generateText({
            model: this.claudeModel,
            system:
              'You are a helpful AI assistant for DevSponsor platform. Assist sponsors with their projects.',
            prompt: `Previous conversation:\n${conversationHistory
              .slice(-3)
              .map((m) => `${m.role}: ${m.content}`)
              .join('\n')}\n\nUser: ${message}`,
            temperature: 0.8,
          });

          return {
            intent: 'general_chat',
            chatResponse: response.text,
          };
        }
      }
    } catch (error) {
      logger.error('[AI Chat Orchestration] Orchestration failed:', error);
      throw error;
    }
  }

  /**
   * Stream chat response for better UX
   */
  async streamChatResponse(message: string, systemPrompt: string): Promise<AsyncIterable<string>> {
    const { textStream } = await streamText({
      model: this.claudeModel,
      system: systemPrompt,
      prompt: message,
      temperature: 0.7,
    });

    return textStream;
  }
}

export const aiChatOrchestrationService = new AIChatOrchestrationService();
