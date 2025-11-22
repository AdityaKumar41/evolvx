import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

export class ContributionController {
  /**
   * Get contributions for a project
   */
  static async getProjectContributions(req: AuthRequest, res: Response) {
    const { projectId } = req.params;
    const { status, contributorId } = req.query;

    const contributions = await prisma.contribution.findMany({
      where: {
        subMilestone: {
          milestone: {
            projectId,
          },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(status && { status: status as any }),
        ...(contributorId && { contributorId: contributorId as string }),
      },
      include: {
        contributor: {
          select: {
            id: true,
            githubUsername: true,
            avatarUrl: true,
          },
        },
        subMilestone: {
          select: {
            id: true,
            description: true,
            milestone: {
              select: {
                id: true,
                title: true,
              },
            },
          },
        },
        proof: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json({ contributions });
  }

  /**
   * Get contribution by ID
   */
  static async getContributionById(req: AuthRequest, res: Response) {
    const { id } = req.params;

    const contribution = await prisma.contribution.findUnique({
      where: { id },
      include: {
        contributor: {
          select: {
            id: true,
            githubUsername: true,
            avatarUrl: true,
            walletAddress: true,
          },
        },
        subMilestone: {
          include: {
            milestone: {
              include: {
                project: {
                  include: {
                    sponsor: {
                      select: {
                        id: true,
                        githubUsername: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        proof: true,
      },
    });

    if (!contribution) {
      throw new AppError('Contribution not found', 404);
    }

    res.json({ contribution });
  }

  /**
   * Get user earnings (contributor view)
   */
  static async getUserEarnings(req: AuthRequest, res: Response) {
    const { userId } = req.params;

    // Check if requesting own earnings or admin
    if (userId !== req.user!.id && req.user!.role !== 'ADMIN') {
      throw new AppError('You can only view your own earnings', 403);
    }

    const contributions = await prisma.contribution.findMany({
      where: {
        contributorId: userId,
        status: 'PAID',
      },
      include: {
        subMilestone: {
          include: {
            milestone: {
              include: {
                project: {
                  select: {
                    id: true,
                    title: true,
                    tokenAddress: true,
                  },
                },
              },
            },
          },
        },
        proof: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Calculate totals by token
    const earningsByToken: Record<string, { total: number; count: number }> = {};

    for (const contrib of contributions) {
      const token = contrib.subMilestone.milestone.project.tokenAddress || 'NATIVE';
      const amount = Number(contrib.amountPaid);

      if (!earningsByToken[token]) {
        earningsByToken[token] = { total: 0, count: 0 };
      }

      earningsByToken[token].total += amount;
      earningsByToken[token].count += 1;
    }

    res.json({
      userId,
      contributions,
      summary: {
        totalEarned: contributions.reduce((sum, c) => sum + Number(c.amountPaid), 0),
        totalContributions: contributions.length,
        byToken: earningsByToken,
      },
    });
  }

  /**
   * Get micropayment history for a user
   */
  static async getMicropaymentHistory(req: AuthRequest, res: Response) {
    const { userId } = req.params;

    // Check permissions
    if (userId !== req.user!.id && req.user!.role !== 'ADMIN') {
      throw new AppError('You can only view your own payment history', 403);
    }

    const contributions = await prisma.contribution.findMany({
      where: {
        contributorId: userId,
      },
      include: {
        subMilestone: {
          select: {
            id: true,
            description: true,
            milestone: {
              select: {
                title: true,
                project: {
                  select: {
                    title: true,
                    tokenAddress: true,
                  },
                },
              },
            },
          },
        },
        proof: {
          select: {
            id: true,
            verifiedOnChain: true,
            txHash: true,
            createdAt: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json({ history: contributions });
  }

  /**
   * Get available balance (pending withdrawals)
   */
  static async getAvailableBalance(req: AuthRequest, res: Response) {
    const userId = req.user!.id;

    // Get all PAID contributions that haven't been withdrawn
    const paidContributions = await prisma.contribution.findMany({
      where: {
        contributorId: userId,
        status: 'PAID',
      },
      include: {
        subMilestone: {
          include: {
            milestone: {
              include: {
                project: {
                  select: {
                    tokenAddress: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    // Group by token
    const balancesByToken: Record<string, number> = {};

    for (const contrib of paidContributions) {
      const token = contrib.subMilestone.milestone.project.tokenAddress || 'NATIVE';
      const amount = Number(contrib.amountPaid);

      balancesByToken[token] = (balancesByToken[token] || 0) + amount;
    }

    res.json({
      userId,
      balances: Object.entries(balancesByToken).map(([token, amount]) => ({
        token,
        amount: amount.toString(),
      })),
    });
  }

  /**
   * Request withdrawal (off-chain balance to on-chain)
   */
  static async requestWithdrawal(req: AuthRequest, res: Response) {
    const { token, amount } = req.body;

    // TODO: Implement withdrawal logic
    // 1. Check available balance
    // 2. Create withdrawal request
    // 3. Trigger blockchain transaction
    // 4. Update contribution records

    res.json({
      message: 'Withdrawal request submitted',
      status: 'PENDING',
      token,
      amount,
    });
  }
}
