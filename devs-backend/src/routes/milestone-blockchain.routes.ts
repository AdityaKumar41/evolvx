/**
 * Milestone Blockchain Commitment API Endpoints
 */

import { Router } from 'express';
import { MerkleCommitService } from '../services/merkle-commit.service';
import { MerkleTreeBuilderService } from '../services/merkle-tree-builder.service';
import { MilestoneService } from '../services/milestone.service';
import { authenticate } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';

const router = Router();
const milestoneService = new MilestoneService();

/**
 * POST /api/milestones/:id/commit
 * Commit a milestone to blockchain via Merkle tree
 */
router.post(
  '/:id/commit',
  authenticate as any,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { sponsorPrivateKey, metadataUri = '' } = req.body;

    if (!sponsorPrivateKey) {
      throw new AppError('Sponsor private key required', 400);
    }

    const milestone = await milestoneService.getMilestoneById(id);

    if (!milestone) {
      throw new AppError('Milestone not found', 404);
    }

    if (milestone.project.sponsorId !== req.user!.id) {
      throw new AppError('Only project sponsor can commit milestones', 403);
    }

    if (milestone.merkleRoot) {
      throw new AppError('Milestone already committed to blockchain', 400);
    }

    // Build Merkle tree from submilestones
    const submilestones = milestone.subMilestones.map((sub) => ({
      submilestoneId: sub.id,
      amount: BigInt(sub.checkpointAmount?.toString() || '0'),
    }));

    const { rootHash } = MerkleTreeBuilderService.buildMilestoneTree(submilestones);

    // Commit to blockchain
    const merkleCommitService = new MerkleCommitService();
    const txHash = await merkleCommitService.commitMilestone(
      {
        projectId: milestone.projectId,
        milestoneId: id,
        rootHash,
        totalAmount: BigInt(milestone.points),
        submilestoneCount: milestone.subMilestones.length,
        metadataUri,
      },
      sponsorPrivateKey
    );

    // Update milestone in database
    await milestoneService.updateMilestone(id, {
      merkleRoot: rootHash,
      merkleCommitTxHash: txHash,
      isCommittedOnChain: true,
    });

    res.json({
      success: true,
      data: {
        milestoneId: id,
        merkleRoot: rootHash,
        commitTxHash: txHash,
        arbiscanUrl: `https://sepolia.arbiscan.io/tx/${txHash}`,
      },
    });
  })
);

/**
 * GET /api/milestones/:id/commitment-status
 * Get blockchain commitment status
 */
router.get(
  '/:id/commitment-status',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const milestone = await milestoneService.getMilestoneById(id);

    if (!milestone) {
      throw new AppError('Milestone not found', 404);
    }

    let onChainData = null;
    if (milestone.merkleRoot) {
      const merkleCommitService = new MerkleCommitService();
      onChainData = await merkleCommitService.getMilestoneCommit(milestone.projectId, id);
    }

    res.json({
      success: true,
      data: {
        milestoneId: id,
        isCommitted: !!milestone.merkleRoot,
        merkleRoot: milestone.merkleRoot,
        commitTxHash: milestone.commitTxHash,
        onChain: onChainData,
        submilestones: milestone.subMilestones,
      },
    });
  })
);

/**
 * POST /api/milestones/:id/finalize
 * Finalize milestone commitment
 */
router.post(
  '/:id/finalize',
  authenticate as any,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { sponsorPrivateKey } = req.body;

    if (!sponsorPrivateKey) {
      throw new AppError('Sponsor private key required', 400);
    }

    const milestone = await milestoneService.getMilestoneById(id);

    if (!milestone) {
      throw new AppError('Milestone not found', 404);
    }

    if (milestone.project.sponsorId !== req.user!.id) {
      throw new AppError('Only project sponsor can finalize milestones', 403);
    }

    if (!milestone.merkleRoot) {
      throw new AppError('Milestone must be committed before finalizing', 400);
    }

    const merkleCommitService = new MerkleCommitService();
    const txHash = await merkleCommitService.finalizeMilestone(
      milestone.projectId,
      id,
      sponsorPrivateKey
    );

    res.json({
      success: true,
      data: {
        milestoneId: id,
        finalizedTxHash: txHash,
        arbiscanUrl: `https://sepolia.arbiscan.io/tx/${txHash}`,
      },
    });
  })
);

export default router;
