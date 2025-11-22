import axios from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';

export interface MilestoneGenerationRequest {
  prompt: string;
  documentUrl?: string;
  projectContext?: string;
}

export interface GeneratedMilestone {
  title: string;
  description: string;
  order: number;
  subMilestones: GeneratedSubMilestone[];
}

export interface GeneratedSubMilestone {
  description: string;
  acceptanceCriteria: {
    tests: string[];
    requirements: string[];
    codeSnippets?: string[];
  };
  checkpointAmount: string;
  checkpointsCount: number;
  estimateHours: number;
  verificationRules: {
    testCommand?: string;
    lintCommand?: string;
    coverage?: number;
  };
}

export class AIOrchestrator {
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor() {
    this.apiKey = config.ai.openRouterApiKey;
    this.baseUrl = config.ai.openRouterBaseUrl;
    this.model = config.ai.claudeModel;
  }

  async generateMilestones(request: MilestoneGenerationRequest): Promise<GeneratedMilestone[]> {
    try {
      const systemPrompt = `You are an expert software project manager and architect. Your task is to break down a project into clear, achievable milestones and sub-milestones with specific acceptance criteria.

For each sub-milestone, provide:
1. Clear description
2. Acceptance criteria with specific tests
3. Recommended checkpoint amount (in USD) for micropayments
4. Number of checkpoints (payment intervals)
5. Estimated hours
6. Verification rules (test commands, lint commands, coverage requirements)

Return the response as a JSON array of milestones.`;

      const userPrompt = `Project Request: ${request.prompt}

${request.projectContext ? `Context: ${request.projectContext}` : ''}

Please generate detailed milestones and sub-milestones for this project. Each sub-milestone should be small enough to complete in 2-8 hours and should have automated verification criteria.`;

      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.7,
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const content = response.data.choices[0].message.content;
      const parsed = JSON.parse(content);

      logger.info('AI milestones generated successfully');
      return parsed.milestones || [];
    } catch (error) {
      logger.error('Failed to generate milestones with AI:', error);
      throw error;
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      // Using OpenAI embedding endpoint
      const response = await axios.post(
        'https://api.openai.com/v1/embeddings',
        {
          input: text,
          model: 'text-embedding-ada-002',
        },
        {
          headers: {
            Authorization: `Bearer ${config.ai.openaiApiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data.data[0].embedding;
    } catch (error) {
      logger.error('Failed to generate embedding:', error);
      throw error;
    }
  }

  async analyzePR(
    prDiff: string,
    acceptanceCriteria: any
  ): Promise<{
    meetsRequirements: boolean;
    analysis: string;
    suggestions: string[];
  }> {
    try {
      const prompt = `Analyze the following PR diff against the acceptance criteria:

Acceptance Criteria:
${JSON.stringify(acceptanceCriteria, null, 2)}

PR Diff:
${prDiff}

Determine if the PR meets the acceptance criteria and provide feedback.`;

      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: this.model,
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const result = JSON.parse(response.data.choices[0].message.content);
      return result;
    } catch (error) {
      logger.error('Failed to analyze PR:', error);
      throw error;
    }
  }
}

export const aiOrchestrator = new AIOrchestrator();
