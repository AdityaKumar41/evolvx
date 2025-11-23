/**
 * Escrow Blockchain API Endpoints
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { prisma } from '../lib/prisma';

const router = Router();

/**
 * POST /api/escrow-blockchain/deposit
 * Deposit funds into an escrow pool
 */
router.post(
  '/deposit',
  authenticate as any,
  asyncHandler(async (req, res) => {
    const { projectId, milestoneId, amount, enableYield = false, sponsorPrivateKey } = req.body;

    if (!projectId || !milestoneId || !amount) {
      throw new AppError('Missing required fields: projectId, milestoneId, amount', 400);
    }

    if (!sponsorPrivateKey) {
      throw new AppError('Sponsor private key required', 400);
    }

    // Get project to verify sponsorship
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new AppError('Project not found', 404);
    }

    if (project.sponsorId !== req.user!.id) {
      throw new AppError('Only project sponsor can deposit to escrow', 403);
    }

    // TODO: Implement escrow deposit to blockchain using EscrowService
    // For now, return placeholder

    res.json({
      success: true,
      data: {
        txHash: '0x' + '0'.repeat(64), // Placeholder
        projectId,
        milestoneId,
        amount,
        yieldEnabled: enableYield,
        arbiscanUrl: `https://sepolia.arbiscan.io/tx/0x${'0'.repeat(64)}`,
      },
    });
  })
);

/**
 * GET /api/escrow-blockchain/pool/:projectId/:milestoneId
 * Get escrow pool information
 */
router.get(
  '/pool/:projectId/:milestoneId',
  asyncHandler(async (req, res) => {
    const { projectId, milestoneId } = req.params;

    const pool = await prisma.escrowPool.findFirst({
      where: {
        projectId,
        milestoneId,
      },
    });

    if (!pool) {
      throw new AppError('Escrow pool not found', 404);
    }

    res.json({
      success: true,
      data: {
        poolId: pool.id,
        totalDeposited: pool.totalDeposited.toString(),
        totalPaidOut: pool.totalPaidOut.toString(),
        remainingBalance: pool.totalDeposited.minus(pool.totalPaidOut).toString(),
        yieldEnabled: pool.yieldEnabled,
        status: pool.status,
      },
    });
  })
);

/**
 * GET /api/escrow-blockchain/balance/:projectId
 * Get total escrow balance for a project
 */
router.get(
  '/balance/:projectId',
  asyncHandler(async (req, res) => {
    const { projectId } = req.params;

    const pools = await prisma.escrowPool.findMany({
      where: { projectId },
    });

    const totalBalance = pools.reduce((sum, pool) => {
      return sum.add(pool.totalDeposited.minus(pool.totalPaidOut));
    }, new (require('@prisma/client').Prisma.Decimal)(0));

    res.json({
      success: true,
      data: {
        totalBalance: totalBalance.toString(),
        poolCount: pools.length,
      },
    });
  })
);

/**
 * POST /api/escrow-blockchain/withdraw
 * Withdraw funds from escrow pool
 */
router.post(
  '/withdraw',
  authenticate as any,
  asyncHandler(async (req, res) => {
    const { projectId, milestoneId, amount, sponsorPrivateKey } = req.body;

    if (!sponsorPrivateKey) {
      throw new AppError('Sponsor private key required', 400);
    }

    // Get project to verify sponsorship
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new AppError('Project not found', 404);
    }

    if (project.sponsorId !== req.user!.id) {
      throw new AppError('Only project sponsor can withdraw from escrow', 403);
    }

    // TODO: Implement escrow withdrawal using EscrowService

    res.json({
      success: true,
      data: {
        txHash: '0x' + '0'.repeat(64), // Placeholder
        amount,
        arbiscanUrl: `https://sepolia.arbiscan.io/tx/0x${'0'.repeat(64)}`,
      },
    });
  })
);

export default router;
