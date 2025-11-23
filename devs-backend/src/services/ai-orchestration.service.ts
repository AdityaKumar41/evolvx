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
  description: z.string().describe('Brief task summary (1-2 sentences)'),
  detailedDescription: z
    .string()
    .describe(
      'Comprehensive task description with implementation approach, technical details, and expected outcome (3-5 paragraphs)'
    ),
  points: z.number().min(1).max(100).describe('Point value representing complexity (1-100)'),
  estimatedHours: z.number().min(1).describe('Estimated hours to complete this task'),
  taskType: z
    .enum(['UI', 'CODE', 'FEATURE', 'BUG', 'DOCS', 'TEST', 'REFACTOR', 'INFRASTRUCTURE'])
    .describe('Type of task'),
  technicalRequirements: z
    .array(z.string())
    .describe('Technical requirements, libraries, APIs, tools, or patterns needed'),
  acceptanceCriteria: z
    .array(z.string())
    .min(1)
    .describe('Specific, testable criteria for completion'),
  suggestedFiles: z
    .array(z.string())
    .optional()
    .describe('Files that may need to be created or modified'),
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

## 3. IN-DEPTH SUB-MILESTONES (Build Tasks that Make Sense)
Each milestone should have 8-15 PRACTICAL, BUILD-READY sub-milestones that follow a logical implementation order:

### 🏗️ **SUB-MILESTONE STRUCTURE** (Follow this flow for each milestone):

1. **Foundation First** (Setup/Configuration):
   - Example: "Set up database schema for user authentication"
   - Example: "Create API route structure for auth endpoints"
   - Example: "Configure environment variables for OAuth providers"

2. **Core Implementation** (Main functionality):
   - Example: "Implement user registration with email validation"
   - Example: "Build JWT token generation and refresh logic"
   - Example: "Create protected route middleware"

3. **Integration Points** (Connect components):
   - Example: "Integrate auth service with user profile API"
   - Example: "Connect frontend login form to backend API"
   - Example: "Link authentication state to Redux store"

4. **UI/UX Components** (If applicable):
   - Example: "Design and implement login form component"
   - Example: "Create password reset flow UI"
   - Example: "Add loading states and error handling to auth forms"

5. **Testing & Validation**:
   - Example: "Write unit tests for authentication service"
   - Example: "Add integration tests for login/logout flow"
   - Example: "Test token refresh mechanism"

6. **Polish & Edge Cases**:
   - Example: "Add rate limiting to login endpoint"
   - Example: "Implement account lockout after failed attempts"
   - Example: "Add logging and monitoring for auth events"

### 📝 **REQUIRED FIELDS FOR EACH SUB-MILESTONE**:

- **Title**: Actionable task starting with a verb (max 80 chars)
  ✅ Good: "Implement JWT token refresh mechanism with Redis cache"
  ❌ Bad: "Authentication" or "Tokens"

- **Description**: 1-2 sentences summarizing the task
  Example: "Build the token refresh endpoint that validates refresh tokens and issues new access tokens."

- **Detailed Description**: 3-5 paragraphs covering:
  * What needs to be built and why
  * Step-by-step implementation approach
  * Technical considerations and edge cases
  * Expected behavior and user experience
  * Integration points with other components

- **Task Type**: Choose the PRIMARY type
  * UI - User interface components and styling
  * CODE - Backend logic, services, utilities
  * FEATURE - End-to-end feature spanning multiple layers
  * BUG - Fixing issues or bugs
  * DOCS - Documentation, README, API docs
  * TEST - Writing tests (unit, integration, e2e)
  * REFACTOR - Code improvement without new features
  * INFRASTRUCTURE - DevOps, deployment, configs

- **Points** (Complexity scoring):
  * 5-10 points: Simple tasks (2-4 hours) - Basic CRUD, simple components, config files
  * 15-25 points: Standard tasks (4-8 hours) - API endpoints, form components, service integration
  * 30-45 points: Complex tasks (1-2 days) - Auth systems, payment integration, real-time features
  * 50-70 points: Major features (2-4 days) - Complete modules, complex workflows, multi-step processes
  * 75-100 points: Architectural work (4-7 days) - Core infrastructure, major refactors, system design

- **Estimated Hours**: Realistic time including research, coding, testing, code review

- **Technical Requirements**: Be SPECIFIC
  ✅ Good: ["jsonwebtoken ^9.0.0", "bcrypt for password hashing", "express-rate-limit middleware", "Redis for token blacklist"]
  ❌ Bad: ["JWT", "security", "database"]

- **Acceptance Criteria**: 4-7 TESTABLE conditions
  ✅ Good: 
    * "User can login with valid email/password and receive access + refresh tokens"
    * "Access token expires after 15 minutes"
    * "Refresh token can be used to get new access token"
    * "Invalid credentials return 401 with error message"
    * "Rate limit of 5 attempts per minute per IP address"
  ❌ Bad: ["Login works", "Tokens are secure", "User can authenticate"]

- **Suggested Files**: Actual file paths in the project
  Example: [
    "src/services/auth/token.service.ts",
    "src/routes/auth/refresh.route.ts",
    "src/middleware/auth.middleware.ts",
    "tests/auth/token.test.ts"
  ]

### 🎯 **LOGICAL TASK ORDERING RULES**:

1. **Dependencies First**: Database schema before API routes, services before controllers
2. **Bottom-Up**: Build foundational pieces before combining them
3. **Test After Build**: Unit tests after service implementation, integration tests after API routes
4. **Progressive Enhancement**: Core functionality first, then optimizations and edge cases
5. **Parallel-Ready**: Group independent tasks that can be worked on simultaneously

### 💡 **PRACTICAL EXAMPLES OF GOOD SUB-MILESTONES**:

**Bad** (too vague):
- "Build user authentication" (what exactly? too broad)
- "Add database" (no context, no details)

**Good** (specific, actionable):
- "Create Prisma schema for User and Session tables with proper indexes"
- "Implement POST /auth/register endpoint with email validation and password hashing"
- "Build React login form component with form validation using react-hook-form"
- "Write integration tests for complete registration flow including email verification"

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

    prompt += `\n---\n\n🎯 **CRITICAL INSTRUCTIONS FOR MILESTONE GENERATION**:

1. **CREATE PRACTICAL, BUILD-READY SUB-MILESTONES**:
   - Each sub-milestone must be a CONCRETE task that a developer can pick up and complete
   - Follow logical build order: schema → services → API → UI → tests
   - Break down complex features into 8-15 granular, actionable tasks
   - Each task should take 2-8 hours maximum (if longer, break it down further)

2. **AVOID VAGUE OR GENERIC TASKS**:
   ❌ DON'T: "Build user system", "Add database", "Create frontend"
   ✅ DO: "Create Prisma User schema with email, password, and profile fields"
   ✅ DO: "Implement POST /api/users endpoint with validation and error handling"
   ✅ DO: "Build UserProfileForm component with real-time validation"

3. **FOLLOW DEPENDENCY ORDER**:
   - Database schemas before services
   - Services before API routes
   - API routes before frontend integration
   - Core functionality before optimizations
   - Features before tests

4. **INCLUDE ALL LAYERS** (when applicable):
   - Database: Schema, migrations, indexes
   - Backend: Services, controllers, routes, middleware
   - Frontend: Components, hooks, state management, forms
   - Testing: Unit tests, integration tests, E2E tests
   - DevOps: Environment configs, deployment scripts (only if mentioned)

5. **BE SPECIFIC WITH TECHNICAL REQUIREMENTS**:
   - Mention exact library names with versions when possible
   - Specify API endpoints being created/used
   - List actual file paths that will be modified
   - Include configuration details (e.g., "JWT expires in 15min")

6. **WRITE DETAILED DESCRIPTIONS**:
   - Explain WHAT needs to be built
   - Explain HOW it should be implemented
   - Mention WHY it's important
   - Note integration points with other components
   - Include expected behavior and edge cases

7. **STRICT CONTEXT USAGE**: 
   - Only generate milestones based on the PRD and requirements provided above
   - Do NOT add generic setup tasks unless explicitly mentioned
   - Reference specific technologies and patterns from the context
   - Match the exact scope described by the user

8. **QUALITY OVER QUANTITY**:
   - It's better to have 10 highly detailed, actionable sub-milestones than 20 vague ones
   - Each sub-milestone should have clear acceptance criteria that can be tested
   - Points should accurately reflect complexity (simple config = 5-10, complex feature = 40-60)

Based on this comprehensive context, create a complete project roadmap with milestones and sub-milestones that PRECISELY matches what the user requested. Make each sub-milestone so detailed that a developer can start coding immediately without asking questions.`;
    return prompt;
  }
}

// Export singleton instance
export const aiOrchestrationService = new AIOrchestrationService();
