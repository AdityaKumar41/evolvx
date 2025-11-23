import { prisma } from '../lib/prisma.js';
import type { Prisma } from '@prisma/client';
import { SessionKeyService } from './session-key.service';
import { UserOpBuilderService } from './userop-builder.service';
import { BundlerService } from './bundler.service';

export enum PromptComplexity {
  SIMPLE = 'SIMPLE',
  MEDIUM = 'MEDIUM',
  COMPLEX = 'COMPLEX',
  VERY_COMPLEX = 'VERY_COMPLEX',
}

export interface CostCalculation {
  baseCredits: number;
  platformFeeCredits: number;
  totalCredits: number;
  complexity: PromptComplexity;
}

export interface DeductCreditsResult {
  success: boolean;
  micropaymentId: string;
  userOpHash?: string;
  newBalance: number;
  error?: string;
}

/**
 * Calculate AI prompt cost based on complexity
 * Platform takes 15% fee on top of base cost
 */
export function calculatePromptCost(promptText: string, estimatedTokens?: number): CostCalculation {
  let complexity: PromptComplexity;
  let baseCredits: number;

  // Determine complexity based on prompt length and estimated tokens
  const promptLength = promptText.length;
  const tokens = estimatedTokens || promptLength / 4; // Rough estimate: 1 token ≈ 4 characters

  if (tokens < 100 && promptLength < 400) {
    complexity = PromptComplexity.SIMPLE;
    baseCredits = 1;
  } else if (tokens < 500 && promptLength < 2000) {
    complexity = PromptComplexity.MEDIUM;
    baseCredits = 3;
  } else if (tokens < 2000 && promptLength < 8000) {
    complexity = PromptComplexity.COMPLEX;
    baseCredits = 5;
  } else {
    complexity = PromptComplexity.VERY_COMPLEX;
    baseCredits = 10;
  }

  // Platform fee: 15% of base cost
  const platformFeeCredits = Math.ceil(baseCredits * 0.15);
  const totalCredits = baseCredits + platformFeeCredits;

  return {
    baseCredits,
    platformFeeCredits,
    totalCredits,
    complexity,
  };
}

/**
 * Process micropayment for AI prompt (gasless via AA + Session Keys)
 * Flow:
 * 1. Calculate cost based on complexity
 * 2. Get active session key for user
 * 3. Build UserOperation with session key signature
 * 4. Submit to bundler (gas paid by Paymaster)
 * 5. Return userOpHash immediately (confirmation happens async)
 * 6. NO wallet popup - session key signs automatically
 */
export async function deductCreditsForPrompt(params: {
  userId: string;
  smartAccountAddress: string;
  promptText: string;
  estimatedTokens?: number;
}): Promise<DeductCreditsResult> {
  const { userId, smartAccountAddress, promptText, estimatedTokens } = params;

  try {
    // 1. Calculate cost
    const costCalc = calculatePromptCost(promptText, estimatedTokens);

    console.log('[Micropayment] Cost calculated:', {
      totalCredits: costCalc.totalCredits,
      complexity: costCalc.complexity,
    });

    // 2. Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // 3. Get active session key
    const sessionKey = await SessionKeyService.getActiveSessionKey(smartAccountAddress);

    if (!sessionKey) {
      throw new Error('No active session key found. Please register a session key first.');
    }

    // 4. Check session key spending limit
    const newTotalSpent = Number(sessionKey.totalSpent) + costCalc.totalCredits;

    if (newTotalSpent > Number(sessionKey.maxTotalSpend)) {
      throw new Error('Session key spending limit exceeded. Please register a new session key.');
    }

    if (costCalc.totalCredits > Number(sessionKey.maxCreditsPerPrompt)) {
      throw new Error(
        `Prompt cost (${costCalc.totalCredits} credits) exceeds session key limit (${sessionKey.maxCreditsPerPrompt} credits per prompt)`
      );
    }

    // 5. Create micropayment record (PENDING status)
    const micropayment = await prisma.aIMicropayment.create({
      data: {
        userId,
        smartAccountAddress,
        sessionKeyAddress: sessionKey.publicKey,
        credits: costCalc.baseCredits,
        platformFeeCredits: costCalc.platformFeeCredits,
        totalCredits: costCalc.totalCredits,
        costInWei: '0', // Will be set by smart contract
        promptComplexity: costCalc.complexity,
        promptText: promptText.substring(0, 1000), // Store first 1000 chars
        status: 'PENDING',
      },
    });

    console.log('[Micropayment] Created payment record:', micropayment.id);

    // 6. Get user's wallet address (owner) for initCode if needed
    const userWallet = await prisma.user.findUnique({
      where: { id: userId },
      select: { walletAddress: true },
    });

    const ownerAddress = userWallet?.walletAddress || undefined;

    // 7. Build UserOperation
    const userOpBuilder = new UserOpBuilderService();
    const userOp = await userOpBuilder.buildUserOperation(
      smartAccountAddress,
      costCalc.totalCredits,
      micropayment.id, // Use micropayment ID as promptId
      sessionKey.id,
      ownerAddress // Pass owner for initCode generation if account not deployed
    );

    console.log('[Micropayment] UserOperation built successfully');

    // 8. Submit to bundler (async confirmation)
    const bundler = new BundlerService();
    const userOpHash = await bundler.submitAndTrack(userOp, micropayment.id);

    console.log('[Micropayment] UserOperation submitted:', userOpHash);

    // 9. Record usage in session key
    await SessionKeyService.recordUsage(sessionKey.id, costCalc.totalCredits);

    // 10. Return immediately (confirmation happens in background)
    return {
      success: true,
      micropaymentId: micropayment.id,
      userOpHash,
      newBalance: 0, // No balance in pay-per-use model
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Micropayment] Error processing payment:', error);

    return {
      success: false,
      micropaymentId: '',
      newBalance: 0,
      error: errorMessage,
    };
  }
}

/**
 * Get micropayment history for a user
 */
export async function getMicropaymentHistory(userId: string, limit = 50) {
  return await prisma.aIMicropayment.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      credits: true,
      platformFeeCredits: true,
      totalCredits: true,
      promptComplexity: true,
      status: true,
      createdAt: true,
      settledAt: true,
    },
  });
}

/**
 * Store AI response after prompt execution
 */
export async function storeAIResponse(params: {
  micropaymentId: string;
  aiResponse: string;
  metadata?: Prisma.InputJsonValue;
}): Promise<void> {
  const { micropaymentId, aiResponse, metadata } = params;

  await prisma.aIMicropayment.update({
    where: { id: micropaymentId },
    data: {
      aiResponse: aiResponse.substring(0, 5000), // Store first 5000 chars
      metadata,
    },
  });
}
