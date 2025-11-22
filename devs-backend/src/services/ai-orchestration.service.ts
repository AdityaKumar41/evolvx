import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { generateText, generateObject, streamText } from 'ai';
import { z } from 'zod';
import { config } from '../config';
import { logger } from '../utils/logger';

export type AIModel = 'gpt-4o' | 'claude-3-5-sonnet-20241022';

export interface AIOrchestrationOptions {
  model?: AIModel;
  temperature?: number;
  maxTokens?: number;
  streaming?: boolean;
}

export interface MilestoneGenerationContext {
  projectDescription: string;
  repositoryUrl?: string;
  existingCode?: string;
  documentContents?: string[];
  githubContext?: {
    readme?: string;
    structure?: string;
    technologies?: string[];
    source?: string;
    overview?: string;
    keyPatterns?: string[];
    files?: Array<{
      path: string;
      language: string;
      purpose: string;
      complexity: string;
      exports?: string[];
      dependencies?: string[];
    }>;
    summary?: string;
  };
}

// Schemas for structured output
export const SubMilestoneSchema = z.object({
  title: z.string().describe('Clear, actionable sub-milestone title (max 80 chars)'),
  description: z.string().describe('Detailed description of the task with technical context'),
  points: z.number().min(1).max(100).describe('Point value representing complexity (1-100)'),
  estimatedHours: z.number().min(1).describe('Estimated hours to complete this task'),
  taskType: z.enum(['ui', 'code', 'feature', 'bug', 'docs']).describe('Type of task'),
  technicalRequirements: z.array(z.string()).describe('Technical requirements and dependencies'),
  acceptanceCriteria: z
    .array(z.string())
    .min(1)
    .describe('Specific, testable criteria for completion'),
  suggestedFiles: z.array(z.string()).optional().describe('Files that may need modification'),
  dependencies: z.array(z.string()).optional().describe('IDs of sub-milestones this depends on'),
});

export const MilestoneSchema = z.object({
  title: z.string().describe('Milestone title summarizing the phase/feature'),
  description: z.string().describe('Milestone description explaining the goal and scope'),
  points: z.number().min(1).describe('Total points for this milestone'),
  order: z.number().describe('Sequential order of this milestone in the project'),
  subMilestones: z.array(SubMilestoneSchema).min(1).max(15).describe('Breakdown of tasks'),
});

export const MilestoneStructureSchema = z.object({
  milestones: z
    .array(MilestoneSchema)
    .min(1)
    .max(20)
    .describe('Complete project roadmap broken into phases'),
  totalPoints: z.number().describe('Total points across all milestones'),
  totalEstimatedHours: z.number().describe('Total estimated hours for completion'),
  projectComplexity: z
    .enum(['simple', 'moderate', 'complex', 'enterprise'])
    .describe('Overall project complexity'),
  recommendedTeamSize: z.number().min(1).max(20).describe('Recommended number of contributors'),
  criticalPath: z.array(z.string()).describe('IDs of milestones on the critical path'),
});

/**
 * Multi-Model AI Orchestration Service
 * Supports GPT-4 and Claude 3.5 Sonnet with intelligent routing
 */
export class AIOrchestrationService {
  private gptModel;
  private claudeModel;

  constructor() {
    this.gptModel = openai(config.ai.openaiModel);
    this.claudeModel = anthropic(config.ai.anthropicModel);
  }

  /**
   * Get the appropriate model instance
   */
  private getModel(modelType: AIModel) {
    switch (modelType) {
      case 'gpt-4o':
        return this.gptModel;
      case 'claude-3-5-sonnet-20241022':
        return this.claudeModel;
      default:
        return this.claudeModel; // Default to Claude
    }
  }

  /**
   * Generate milestones using structured output
   * Uses Claude for its superior planning capabilities
   */
  async generateMilestones(
    context: MilestoneGenerationContext,
    options: AIOrchestrationOptions = {}
  ) {
    const model = this.getModel(options.model || 'claude-3-5-sonnet-20241022');

    logger.info('[AI Orchestration] Generating milestones', {
      model: options.model || 'claude-3-5-sonnet-20241022',
      hasDocuments: (context.documentContents?.length || 0) > 0,
      hasGithubContext: !!context.githubContext,
    });

    const systemPrompt = this.buildMilestoneSystemPrompt();
    const userPrompt = this.buildMilestoneUserPrompt(context);

    try {
      const result = await generateObject({
        model,
        schema: MilestoneStructureSchema,
        system: systemPrompt,
        prompt: userPrompt,
        temperature: options.temperature || 0.7,
        maxRetries: 2,
      });

      logger.info('[AI Orchestration] Successfully generated milestones', {
        milestoneCount: result.object.milestones.length,
        totalPoints: result.object.totalPoints,
      });

      return result.object;
    } catch (error) {
      logger.error('[AI Orchestration] Error generating milestones', { error });
      throw error;
    }
  }

  /**
   * Analyze uploaded documents and extract key information
   * Uses GPT-4o for its superior document understanding
   */
  async analyzeDocuments(documents: string[]): Promise<string> {
    const model = this.getModel('gpt-4o');

    logger.info('[AI Orchestration] Analyzing documents', {
      documentCount: documents.length,
    });

    const systemPrompt = `You are an expert technical analyst. Analyze the provided documents and extract:
1. Key technical requirements
2. Technology stack and frameworks
3. Architecture patterns mentioned
4. Integration points and dependencies
5. Critical features or functionalities
6. Performance or quality requirements

Provide a concise technical summary in markdown format.`;

    const userPrompt = `Analyze these documents and provide a comprehensive technical summary:

${documents.map((doc, i) => `=== Document ${i + 1} ===\n${doc}`).join('\n\n')}`;

    try {
      const result = await generateText({
        model,
        system: systemPrompt,
        prompt: userPrompt,
        temperature: 0.3,
      });

      return result.text;
    } catch (error) {
      logger.error('[AI Orchestration] Error analyzing documents', { error });
      throw error;
    }
  }

  /**
   * Refine existing milestones based on user feedback
   * Uses GPT-4o for its strong reasoning capabilities
   */
  async refineMilestones(
    existingMilestones: Array<Record<string, unknown>>,
    feedback: string,
    context: MilestoneGenerationContext
  ) {
    const model = this.getModel('gpt-4o');

    logger.info('[AI Orchestration] Refining milestones based on feedback');

    const systemPrompt = `You are an expert project manager. Refine the existing project milestones based on user feedback.
Maintain the overall structure but adjust details, priorities, or breakdowns as requested.`;

    const userPrompt = `Current milestones:
${JSON.stringify(existingMilestones, null, 2)}

Project context:
${context.projectDescription}

User feedback:
${feedback}

Please refine the milestones based on this feedback while maintaining a logical project structure.`;

    try {
      const result = await generateObject({
        model,
        schema: MilestoneStructureSchema,
        system: systemPrompt,
        prompt: userPrompt,
        temperature: 0.7,
      });

      return result.object;
    } catch (error) {
      logger.error('[AI Orchestration] Error refining milestones', { error });
      throw error;
    }
  }

  /**
   * Generate chat response with context
   * Routes to appropriate model based on query type
   */
  async generateChatResponse(
    message: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
    projectContext?: string,
    options: AIOrchestrationOptions = {}
  ) {
    // Use Claude for planning/architecture, GPT-4o for coding questions
    const modelType = this.selectModelForQuery(message);
    const model = this.getModel(modelType);

    logger.info('[AI Orchestration] Generating chat response', { model: modelType });

    const systemPrompt = `You are an expert software development assistant helping a sponsor plan and manage their open-source project.
${projectContext ? `\nProject Context:\n${projectContext}` : ''}

Provide concise, actionable advice. When discussing milestones, be specific about technical requirements and acceptance criteria.`;

    try {
      if (options.streaming) {
        return await streamText({
          model,
          system: systemPrompt,
          messages: [
            ...conversationHistory.map((msg) => ({
              role: msg.role,
              content: msg.content,
            })),
            { role: 'user', content: message },
          ],
          temperature: options.temperature || 0.7,
        });
      } else {
        const result = await generateText({
          model,
          system: systemPrompt,
          messages: [
            ...conversationHistory.map((msg) => ({
              role: msg.role,
              content: msg.content,
            })),
            { role: 'user', content: message },
          ],
          temperature: options.temperature || 0.7,
        });

        return result.text;
      }
    } catch (error) {
      logger.error('[AI Orchestration] Error generating chat response', { error });
      throw error;
    }
  }

  /**
   * Select appropriate model based on query type
   */
  private selectModelForQuery(message: string): AIModel {
    const lowerMessage = message.toLowerCase();

    // Use GPT-4o for code-related queries
    if (
      lowerMessage.includes('code') ||
      lowerMessage.includes('implement') ||
      lowerMessage.includes('function') ||
      lowerMessage.includes('debug') ||
      lowerMessage.includes('error')
    ) {
      return 'gpt-4o';
    }

    // Use Claude for planning and architecture
    return 'claude-3-5-sonnet-20241022';
  }

  /**
   * Build system prompt for milestone generation
   */
  private buildMilestoneSystemPrompt(): string {
    return `You are a world-class software project manager and technical architect with 15+ years experience at FAANG companies, specialized in breaking down complex projects into actionable, detailed roadmaps.

Your expertise includes: Full-stack development, Cloud architecture, DevOps, Agile methodologies, and modern software engineering practices.

🎯 **Mission**: Create an EXCEPTIONAL, COMPREHENSIVE project roadmap that:

## 1. COMPREHENSIVE COVERAGE
- Include ALL aspects: Frontend, Backend, Database, API, DevOps, Testing, Documentation, Security
- Add infrastructure setup, environment configuration, CI/CD pipelines
- Include quality assurance, code reviews, and deployment strategies
- Don't forget: Error handling, logging, monitoring, analytics integration

## 2. LOGICAL MILESTONE STRUCTURE (Phases)
- **Phase 1**: Project Setup & Foundation (repo structure, tooling, basic configs)
- **Phase 2**: Core Features & Backend (database, APIs, authentication)
- **Phase 3**: Frontend Development & UI/UX (components, pages, interactions)
- **Phase 4**: Advanced Features (real-time, notifications, integrations)
- **Phase 5**: Testing, Optimization & Deployment (tests, performance, CI/CD)
- Create 5-12 milestones depending on project complexity
- Each milestone = 1-2 weeks of work with clear deliverables

## 3. DETAILED SUB-MILESTONES (Tasks)
Each milestone should have 5-12 specific, actionable sub-milestones:
- **Title**: Crystal clear, actionable (e.g., "Implement JWT Authentication with Refresh Tokens")
- **Description**: 2-4 sentences with technical details, approach, and expected outcome
- **Technical Requirements**: Specific libraries, APIs, tools, or patterns needed
- **Acceptance Criteria**: 3-5 testable, specific criteria (e.g., "User can login with email/password", "Access token expires after 15 minutes")
- **Suggested Files**: Actual file paths that will be created/modified
- **Task Type**: Categorize as 'feature', 'ui', 'code', 'bug', 'docs'
- **Points**: Reflect TRUE complexity
  * 1-15 points: Quick tasks (1-4 hours)
  * 16-35 points: Standard features (4-12 hours)
  * 36-60 points: Complex features (1-3 days)
  * 61-100 points: Major architectural work (3-5 days)
- **Estimated Hours**: Realistic time including design, coding, testing, review

## 4. MODERN BEST PRACTICES
✅ Include these critical elements:
- Environment setup (.env files, config management)
- Database schema design and migrations
- API documentation (OpenAPI/Swagger)
- Unit tests, integration tests, E2E tests
- Error handling and validation
- Security measures (CORS, rate limiting, input sanitization)
- Code formatting and linting setup
- Git workflow and branching strategy
- Deployment scripts and infrastructure as code
- Monitoring and logging setup
- Performance optimization
- Mobile responsiveness
- Accessibility (WCAG compliance)

## 5. REALISTIC COMPLEXITY ASSESSMENT
- **Simple** (< 100 total hours): Basic CRUD app, landing page, simple dashboard
- **Moderate** (100-300 hours): Full-stack app with auth, real-time features
- **Complex** (300-800 hours): Multi-tenant SaaS, marketplace, social platform
- **Enterprise** (800+ hours): Complex business logic, integrations, scalability

## 6. SMART DEPENDENCIES & CRITICAL PATH
- Identify which tasks block others
- Mark critical path milestones
- Suggest 1-5 contributors based on scope

## 7. ⚠️ CRITICAL: USE THE PROVIDED CONTEXT
🎯 **MOST IMPORTANT**: Base your milestones EXCLUSIVELY on the user's specific requirements provided below.
- DO NOT generate generic/template milestones
- DO NOT make assumptions about features not mentioned
- DO reference specific technologies, patterns, and files mentioned in the context
- DO align with the existing codebase structure if repository analysis is provided
- DO prioritize features explicitly mentioned in the user's requirements
- DO create tasks that match the exact scope and scale described

If the user says "build authentication with OAuth", create milestones for OAuth specifically, not generic auth.
If the user mentions specific frameworks/libraries, use those in your technical requirements.
If repository analysis shows existing patterns, follow them.

🚀 **Goal**: Create a roadmap so detailed and well-thought-out that developers can start working immediately without asking questions. Make it production-ready, not a prototype.

Be SPECIFIC, DETAILED, and ACTIONABLE. Think like you're building for a major production application.`;
  }

  /**
   * Build user prompt with full context
   */
  private buildMilestoneUserPrompt(context: MilestoneGenerationContext): string {
    let prompt = `# Project Overview\n${context.projectDescription}\n\n`;

    // If user provided a PRD or requirements, force the AI to use ONLY those
    if (context.documentContents && context.documentContents.length > 0) {
      prompt += `## Project Documents & Requirements\n\n`;
      context.documentContents.forEach((doc, i) => {
        prompt += `### Document ${i + 1}\n${doc}\n\n`;
      });
      prompt += `\n---\n\n🚨 STRICT MODE: Only generate milestones and sub-milestones that directly match the requirements and details above. Do NOT generate generic setup, repo, or CI/CD milestones unless they are explicitly mentioned in the PRD or requirements.\n`;
    }

    // Optionally add repository context if present
    if (context.githubContext) {
      prompt += `## Repository Analysis\n\n`;
      if (context.githubContext.source === 'qdrant') {
        if (context.githubContext.overview) {
          prompt += `${context.githubContext.overview}\n\n`;
        }
        if (context.githubContext.keyPatterns && context.githubContext.keyPatterns.length > 0) {
          prompt += `### Identified Patterns\n${context.githubContext.keyPatterns.join(', ')}\n\n`;
        }
        if (context.githubContext.files && context.githubContext.files.length > 0) {
          prompt += `### Key Files & Components\n\n`;
          context.githubContext.files.slice(0, 10).forEach((file, i: number) => {
            prompt += `${i + 1}. **${file.path}** (${file.language})\n`;
            prompt += `   - Purpose: ${file.purpose}\n`;
            prompt += `   - Complexity: ${file.complexity}\n`;
            if (file.exports && file.exports.length > 0) {
              prompt += `   - Exports: ${file.exports.slice(0, 5).join(', ')}${file.exports.length > 5 ? '...' : ''}\n`;
            }
            if (file.dependencies && file.dependencies.length > 0) {
              prompt += `   - Dependencies: ${file.dependencies.slice(0, 5).join(', ')}${file.dependencies.length > 5 ? '...' : ''}\n`;
            }
            prompt += `\n`;
          });
        }
        if (context.githubContext.readme) {
          prompt += `### README\n${context.githubContext.readme.substring(0, 2000)}${context.githubContext.readme.length > 2000 ? '...' : ''}\n\n`;
        }
      } else {
        if (context.githubContext.readme) {
          prompt += `### README\n${context.githubContext.readme}\n\n`;
        }
        if (context.githubContext.structure) {
          prompt += `### Repository Structure\n\`\`\`\n${context.githubContext.structure}\n\`\`\`\n\n`;
        }
        if (context.githubContext.technologies && context.githubContext.technologies.length > 0) {
          prompt += `### Technologies Detected\n${context.githubContext.technologies.join(', ')}\n\n`;
        }
        if (context.githubContext.summary) {
          prompt += `### Summary\n${context.githubContext.summary}\n\n`;
        }
      }
    }

    if (context.existingCode) {
      prompt += `## Existing Codebase\n\`\`\`\n${context.existingCode}\n\`\`\`\n\n`;
    }

    prompt += `\n---\n\n🎯 **CRITICAL INSTRUCTIONS**:

1. **STRICT CONTEXT USAGE**: Only generate milestones based on the PRD, requirements, and context above. Do NOT add generic setup, repo, or CI/CD milestones unless explicitly requested.
2. **ALIGN WITH USER PROMPT**: If the user asks for specific features, only those should appear as milestones.
3. **NO TEMPLATES**: Do NOT use templates or boilerplate unless the PRD or requirements demand it.
4. **REFERENCE USER DETAILS**: Reference the user's requirements and context in every milestone and sub-milestone.
5. **MATCH SCOPE**: The number and type of milestones should match the user's PRD and context, not a default structure.

Based on this comprehensive context, create a complete project roadmap with milestones and sub-milestones that PRECISELY matches what the user requested.`;
    return prompt;
  }
}

// Export singleton instance
export const aiOrchestrationService = new AIOrchestrationService();
