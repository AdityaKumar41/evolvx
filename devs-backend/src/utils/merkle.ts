import { ethers } from 'ethers';
import { logger } from './logger';

export interface MilestoneProof {
  milestoneId: string;
  contributorAddress: string;
  amount: string;
  metadata: string;
}

export interface MerkleProofResult {
  root: string;
  proofs: Map<string, string[]>;
  leaves: string[];
}

/**
 * Generate Merkle tree for milestone proofs
 */
export class MerkleTreeGenerator {
  /**
   * Hash a milestone proof into a leaf
   */
  static hashProof(proof: MilestoneProof): string {
    const encoded = ethers.solidityPacked(
      ['string', 'address', 'uint256', 'string'],
      [proof.milestoneId, proof.contributorAddress, proof.amount, proof.metadata]
    );
    return ethers.keccak256(encoded);
  }

  /**
   * Build Merkle tree from proofs
   */
  static buildTree(proofs: MilestoneProof[]): MerkleProofResult {
    if (proofs.length === 0) {
      throw new Error('Cannot build Merkle tree from empty proofs');
    }

    // Hash all leaves
    const leaves = proofs.map((proof) => this.hashProof(proof));
    logger.info(`Building Merkle tree with ${leaves.length} leaves`);

    // Build tree layers
    const layers: string[][] = [leaves];
    let currentLayer = leaves;

    while (currentLayer.length > 1) {
      const nextLayer: string[] = [];

      for (let i = 0; i < currentLayer.length; i += 2) {
        const left = currentLayer[i];
        const right = i + 1 < currentLayer.length ? currentLayer[i + 1] : left;

        // Sort before hashing (standard Merkle tree practice)
        const [sortedLeft, sortedRight] = [left, right].sort();
        const combined = ethers.solidityPacked(['bytes32', 'bytes32'], [sortedLeft, sortedRight]);
        const hash = ethers.keccak256(combined);
        nextLayer.push(hash);
      }

      layers.push(nextLayer);
      currentLayer = nextLayer;
    }

    const root = currentLayer[0];

    // Generate proofs for each leaf
    const proofsMap = new Map<string, string[]>();

    for (let i = 0; i < leaves.length; i++) {
      const proof = this.getProof(layers, i);
      proofsMap.set(leaves[i], proof);
    }

    logger.info(`Merkle tree built. Root: ${root}`);

    return {
      root,
      proofs: proofsMap,
      leaves,
    };
  }

  /**
   * Get Merkle proof for a specific leaf index
   */
  private static getProof(layers: string[][], leafIndex: number): string[] {
    const proof: string[] = [];
    let index = leafIndex;

    for (let i = 0; i < layers.length - 1; i++) {
      const layer = layers[i];
      const isRightNode = index % 2 === 1;
      const siblingIndex = isRightNode ? index - 1 : index + 1;

      if (siblingIndex < layer.length) {
        proof.push(layer[siblingIndex]);
      }

      index = Math.floor(index / 2);
    }

    return proof;
  }

  /**
   * Verify a Merkle proof
   */
  static verifyProof(leaf: string, proof: string[], root: string): boolean {
    let computedHash = leaf;

    for (const proofElement of proof) {
      // Sort before hashing (same as build)
      const [sortedLeft, sortedRight] = [computedHash, proofElement].sort();
      const combined = ethers.solidityPacked(['bytes32', 'bytes32'], [sortedLeft, sortedRight]);
      computedHash = ethers.keccak256(combined);
    }

    return computedHash === root;
  }

  /**
   * Generate Merkle tree for project milestones
   */
  static generateProjectMerkleTree(
    milestones: Array<{
      id: string;
      subMilestones: Array<{
        id: string;
        checkpointAmount: string | number;
        assignedTo: string | null;
      }>;
    }>
  ): MerkleProofResult {
    const proofs: MilestoneProof[] = [];

    for (const milestone of milestones) {
      for (const subMilestone of milestone.subMilestones) {
        // Only include assigned submilestones
        if (subMilestone.assignedTo) {
          proofs.push({
            milestoneId: subMilestone.id,
            contributorAddress: subMilestone.assignedTo,
            amount: subMilestone.checkpointAmount.toString(),
            metadata: JSON.stringify({
              milestoneId: milestone.id,
              subMilestoneId: subMilestone.id,
            }),
          });
        }
      }
    }

    if (proofs.length === 0) {
      throw new Error('No assigned submilestones found for Merkle tree generation');
    }

    return this.buildTree(proofs);
  }
}
