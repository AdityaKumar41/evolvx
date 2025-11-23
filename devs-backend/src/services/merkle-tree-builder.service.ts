import { MerkleTree } from 'merkletreejs';
import { keccak256 } from 'ethers';
import { logger } from '../utils/logger';

export interface SubMilestoneLeaf {
  submilestoneId: string;
  amount: bigint;
}

export interface MerkleTreeData {
  rootHash: string;
  leaves: SubMilestoneLeaf[];
  tree: MerkleTree;
}

/**
 * Service for building Merkle trees from milestone/submilestone structure
 * Used to commit milestone structure on-chain efficiently
 */
export class MerkleTreeBuilderService {
  /**
   * Build Merkle tree from submilestones
   * @param submilestones Array of submilestones with IDs and amounts
   * @returns Merkle tree data including root hash and tree object
   */
  static buildMilestoneTree(submilestones: SubMilestoneLeaf[]): MerkleTreeData {
    if (!submilestones || submilestones.length === 0) {
      throw new Error('Cannot build Merkle tree from empty submilestones');
    }

    logger.info(`Building Merkle tree for ${submilestones.length} submilestones`);

    // Create leaves: keccak256(abi.encodePacked(submilestoneId, amount))
    const leaves = submilestones.map((sub) => {
      // Convert amount to hex string (32 bytes)
      const amountHex = sub.amount.toString(16).padStart(64, '0');

      // Create leaf hash
      const leaf = keccak256(
        Buffer.concat([Buffer.from(sub.submilestoneId, 'utf8'), Buffer.from(amountHex, 'hex')])
      );

      return leaf;
    });

    // Build Merkle tree
    const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
    const rootHash = tree.getHexRoot();

    logger.info(`Merkle tree built successfully. Root hash: ${rootHash}`);

    return {
      rootHash,
      leaves: submilestones,
      tree,
    };
  }

  /**
   * Generate Merkle proof for a specific submilestone
   * @param tree Merkle tree object
   * @param submilestone Submilestone to generate proof for
   * @returns Array of proof hashes
   */
  static generateProof(tree: MerkleTree, submilestone: SubMilestoneLeaf): string[] {
    // Create leaf hash (same as in buildMilestoneTree)
    const amountHex = submilestone.amount.toString(16).padStart(64, '0');
    const leaf = keccak256(
      Buffer.concat([
        Buffer.from(submilestone.submilestoneId, 'utf8'),
        Buffer.from(amountHex, 'hex'),
      ])
    );

    // Generate proof
    const proof = tree.getHexProof(leaf);

    logger.info(`Generated Merkle proof for submilestone ${submilestone.submilestoneId}`);
    logger.debug(`Proof: ${JSON.stringify(proof)}`);

    return proof;
  }

  /**
   * Verify Merkle proof locally (before on-chain verification)
   * @param proof Merkle proof
   * @param rootHash Merkle root hash
   * @param submilestone Submilestone to verify
   * @returns True if proof is valid
   */
  static verifyProof(proof: string[], rootHash: string, submilestone: SubMilestoneLeaf): boolean {
    // Create leaf hash
    const amountHex = submilestone.amount.toString(16).padStart(64, '0');
    const leaf = keccak256(
      Buffer.concat([
        Buffer.from(submilestone.submilestoneId, 'utf8'),
        Buffer.from(amountHex, 'hex'),
      ])
    );

    // Verify proof
    const tree = new MerkleTree([], keccak256, { sortPairs: true });
    const isValid = tree.verify(proof, leaf, rootHash);

    logger.info(
      `Merkle proof verification for ${submilestone.submilestoneId}: ${isValid ? 'VALID' : 'INVALID'}`
    );

    return isValid;
  }

  /**
   * Build tree and store metadata (for database storage)
   * @param projectId Project ID
   * @param milestoneId Milestone ID
   * @param submilestones Array of submilestones
   * @returns Object with root hash and serialized tree data
   */
  static async buildAndSerialize(
    projectId: string,
    milestoneId: string,
    submilestones: SubMilestoneLeaf[]
  ): Promise<{
    rootHash: string;
    treeData: string; // JSON serialized tree for storage
    leafCount: number;
  }> {
    const merkleData = this.buildMilestoneTree(submilestones);

    // Serialize tree data for database storage
    const treeData = JSON.stringify({
      projectId,
      milestoneId,
      rootHash: merkleData.rootHash,
      leaves: submilestones.map((sub) => ({
        submilestoneId: sub.submilestoneId,
        amount: sub.amount.toString(), // BigInt can't be JSON.stringified directly
      })),
      createdAt: new Date().toISOString(),
    });

    return {
      rootHash: merkleData.rootHash,
      treeData,
      leafCount: submilestones.length,
    };
  }

  /**
   * Deserialize tree data from database
   * @param treeDataJson Serialized tree data
   * @returns Merkle tree data
   */
  static deserialize(treeDataJson: string): MerkleTreeData {
    const data = JSON.parse(treeDataJson);

    const submilestones: SubMilestoneLeaf[] = data.leaves.map((leaf: any) => ({
      submilestoneId: leaf.submilestoneId,
      amount: BigInt(leaf.amount),
    }));

    return this.buildMilestoneTree(submilestones);
  }

  /**
   * Calculate total amount from submilestones
   */
  static calculateTotalAmount(submilestones: SubMilestoneLeaf[]): bigint {
    return submilestones.reduce((sum, sub) => sum + sub.amount, 0n);
  }

  /**
   * Validate submilestone amounts
   */
  static validateAmounts(submilestones: SubMilestoneLeaf[]): boolean {
    if (!submilestones || submilestones.length === 0) {
      return false;
    }

    // Check all amounts are positive
    for (const sub of submilestones) {
      if (sub.amount <= 0n) {
        logger.error(`Invalid amount for submilestone ${sub.submilestoneId}: ${sub.amount}`);
        return false;
      }
    }

    return true;
  }
}
