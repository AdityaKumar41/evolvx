import { Prisma, $Enums } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';

// Use Prisma enum types
type AIWorkflowType = $Enums.AIWorkflowType;
type BillingMethod = $Enums.BillingMethod;

// Enum value constants for comparisons
const AIWorkflowTypeEnum = {
  MILESTONE_GENERATION: 'MILESTONE_GENERATION' as AIWorkflowType,
  PR_REVIEW: 'PR_REVIEW' as AIWorkflowType,
  UI_ANALYSIS: 'UI_ANALYSIS' as AIWorkflowType,
  CHAT: 'CHAT' as AIWorkflowType,
  CODE_ANALYSIS: 'CODE_ANALYSIS' as AIWorkflowType,
};

const BillingMethodEnum = {
  MICROPAYMENT: 'MICROPAYMENT' as BillingMethod,
  FREE: 'FREE' as BillingMethod,
};

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
}

export interface BillingConfig {
  model: string;
  inputCostPer1K: number; // in USD
  outputCostPer1K: number; // in USD
}

export interface UsageFilters {
  projectId?: string;
  model?: string;
  workflow?: AIWorkflowType;
  startDate?: Date;
  endDate?: Date;
}

export interface AIUsageLog {
  id: string;
  userId: string;
  projectId: string | null;
  workflow: AIWorkflowType;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  billedVia: BillingMethod;
  metadata?: unknown;
  createdAt: Date;
}

class AIBillingService {
  // Cost per 1K tokens for different models (in USD)
  private readonly MODEL_RATES: Record<string, BillingConfig> = {
    'gpt-4': {
      model: 'gpt-4',
      inputCostPer1K: 0.03,
      outputCostPer1K: 0.06,
    },
    'gpt-3.5-turbo': {
      model: 'gpt-3.5-turbo',
      inputCostPer1K: 0.001,
      outputCostPer1K: 0.002,
    },
    'claude-3-opus': {
      model: 'claude-3-opus',
      inputCostPer1K: 0.015,
      outputCostPer1K: 0.075,
    },
    'claude-3-sonnet': {
      model: 'claude-3-sonnet',
      inputCostPer1K: 0.003,
      outputCostPer1K: 0.015,
    },
    'openrouter-default': {
      model: 'openrouter-default',
      inputCostPer1K: 0.002,
      outputCostPer1K: 0.004,
    },
    llama: {
      model: 'llama',
      inputCostPer1K: 0.0, // Free for self-hosted
      outputCostPer1K: 0.0,
    },
  };

  /**
   * Calculate cost in USD for given tokens
   */
  calculateCost(inputTokens: number, outputTokens: number, model: string = 'gpt-4'): number {
    const rates = this.MODEL_RATES[model] || this.MODEL_RATES['gpt-4'];
    const inputCost = (inputTokens / 1000) * rates.inputCostPer1K;
    const outputCost = (outputTokens / 1000) * rates.outputCostPer1K;
    return parseFloat((inputCost + outputCost).toFixed(6));
  }

  /**
   * Calculate contextual multiplier based on complexity
   */
  calculateMultiplier(context?: {
    isHighPriority?: boolean;
    isComplexWorkflow?: boolean;
    promptLength?: number;
  }): number {
    let multiplier = 1.0;

    if (!context) return multiplier;

    // Priority multiplier
    if (context.isHighPriority) {
      multiplier *= 1.2;
    }

    // Workflow complexity
    if (context.isComplexWorkflow) {
      multiplier *= 1.5;
    }

    // Prompt complexity
    if (context.promptLength && context.promptLength > 5000) {
      multiplier *= 1.2;
    } else if (context.promptLength && context.promptLength > 2000) {
      multiplier *= 1.1;
    }

    return multiplier;
  }

  /**
   * Track AI usage and create log entry
   * All usage is billed via micropayment (pay-per-use) except FREE workflows
   */
  async trackUsage(
    userId: string,
    projectId: string | null,
    workflow: AIWorkflowType,
    model: string,
    inputTokens: number,
    outputTokens: number,
    metadata?: Record<string, unknown>
  ): Promise<string> {
    const totalTokens = inputTokens + outputTokens;
    const cost = this.calculateCost(inputTokens, outputTokens, model);

    // Simple billing logic: CHAT uses FREE (OpenRouter), everything else uses MICROPAYMENT
    let billedVia: BillingMethod;
    if (workflow === AIWorkflowTypeEnum.CHAT) {
      billedVia = BillingMethodEnum.FREE;
    } else {
      billedVia = BillingMethodEnum.MICROPAYMENT;
    }

    // Create usage log
    const usageLog = await prisma.aIUsageLog.create({
      data: {
        userId,
        projectId,
        workflow,
        model,
        inputTokens,
        outputTokens,
        totalTokens,
        cost: cost,
        billedVia,
        metadata: metadata ? (metadata as unknown as Prisma.InputJsonValue) : undefined,
      },
    });

    // Trigger micropayment if needed
    if (billedVia === BillingMethodEnum.MICROPAYMENT) {
      await this.triggerMicropayment(userId, projectId, cost);
    }

    return usageLog.id;
  }

  /**
   * Trigger micropayment for AI usage
   */
  async triggerMicropayment(
    userId: string,
    projectId: string | null,
    amount: number
  ): Promise<void> {
    // Create a pending micropayment record
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { walletAddress: true },
    });

    if (!user?.walletAddress) {
      throw new Error('User wallet address not found');
    }

    // TODO: Integrate with blockchain service to trigger actual payment
    // For now, just log the requirement
    logger.info(`Micropayment required: User ${userId}, Amount: $${amount}, Project: ${projectId}`);

    // Create notification for user
    await prisma.notification.create({
      data: {
        userId,
        type: 'PAYMENT_SENT',
        title: 'AI Usage Payment Required',
        message: `Payment of $${amount.toFixed(4)} required for AI usage. Please complete the payment to continue.`,
      },
    });
  }

  /**
   * Get usage logs for a user
   */
  async getUsageLog(userId: string, filters?: UsageFilters) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { userId };
    const { projectId, startDate, endDate } = filters || {};

    if (projectId) {
      where.projectId = projectId;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    return await prisma.aIUsageLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        project: {
          select: { id: true, title: true },
        },
      },
    });
  }

  /**
   * Get usage summary for a user or project
   */
  async getUsageSummary(userId: string, projectId?: string) {
    const where: { userId: string; projectId?: string } = { userId };
    if (projectId) where.projectId = projectId;

    const logs = await prisma.aIUsageLog.findMany({ where });

    const summary = {
      totalCost: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      byWorkflow: {} as Record<
        string,
        {
          count: number;
          cost: number;
          tokens: number;
        }
      >,
      byModel: {} as Record<
        string,
        {
          count: number;
          cost: number;
          tokens: number;
        }
      >,
      byBillingMethod: {} as Record<
        string,
        {
          count: number;
          cost: number;
        }
      >,
    };

    for (const log of logs) {
      const cost = parseFloat(log.cost.toString());
      summary.totalCost += cost;
      summary.totalInputTokens += log.inputTokens;
      summary.totalOutputTokens += log.outputTokens;
      summary.totalTokens += log.totalTokens;

      // By workflow
      if (!summary.byWorkflow[log.workflow]) {
        summary.byWorkflow[log.workflow] = { count: 0, cost: 0, tokens: 0 };
      }
      summary.byWorkflow[log.workflow].count++;
      summary.byWorkflow[log.workflow].cost += cost;
      summary.byWorkflow[log.workflow].tokens += log.totalTokens;

      // By model
      if (!summary.byModel[log.model]) {
        summary.byModel[log.model] = { count: 0, cost: 0, tokens: 0 };
      }
      summary.byModel[log.model].count++;
      summary.byModel[log.model].cost += cost;
      summary.byModel[log.model].tokens += log.totalTokens;

      // By billing method
      if (!summary.byBillingMethod[log.billedVia]) {
        summary.byBillingMethod[log.billedVia] = { count: 0, cost: 0 };
      }
      summary.byBillingMethod[log.billedVia].count++;
      summary.byBillingMethod[log.billedVia].cost += cost;
    }

    return summary;
  }

  /**
   * Get model rate configuration
   */
  getModelRates(): Record<string, BillingConfig> {
    return this.MODEL_RATES;
  }

  /**
   * Estimate cost for a given token count
   */
  estimateCost(inputTokens: number, outputTokens: number, model: string = 'gpt-4'): number {
    return this.calculateCost(inputTokens, outputTokens, model);
  }
}

export const aiBillingService = new AIBillingService();
