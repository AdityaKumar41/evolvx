import { ethers } from 'ethers';
import { logger } from '../utils/logger';
import MerkleCommitStorageABI from '../../../contracts/abi/MerkleCommitStorage.json';

const MERKLE_STORAGE_ADDRESS = process.env.AA_MERKLE_COMMIT_STORAGE_ADDRESS!;
const RPC_URL = process.env.ARBITRUM_SEPOLIA_RPC_URL!;

export interface MilestoneCommitData {
  projectId: string;
  milestoneId: string;
  rootHash: string;
  totalAmount: bigint;
  submilestoneCount: number;
  metadataUri: string; // IPFS/Arweave URI
}

/**
 * Service for interacting with MerkleCommitStorage contract
 * Handles on-chain milestone commitments and verification
 */
export class MerkleCommitService {
  private provider: ethers.JsonRpcProvider;
  private contract: ethers.Contract;

  constructor() {
    this.provider = new ethers.JsonRpcProvider(RPC_URL);
    this.contract = new ethers.Contract(
      MERKLE_STORAGE_ADDRESS,
      MerkleCommitStorageABI,
      this.provider
    );
  }

  /**
   * Get contract instance with signer
   */
  private getContractWithSigner(privateKey: string): ethers.Contract {
    const wallet = new ethers.Wallet(privateKey, this.provider);
    return this.contract.connect(wallet) as ethers.Contract;
  }

  /**
   * Commit milestone to blockchain
   * @param commitData Milestone commit data
   * @param sponsorPrivateKey Sponsor's private key
   * @returns Transaction hash
   */
  async commitMilestone(
    commitData: MilestoneCommitData,
    sponsorPrivateKey: string
  ): Promise<string> {
    try {
      logger.info(`Committing milestone ${commitData.milestoneId} to blockchain`);

      const contractWithSigner = this.getContractWithSigner(sponsorPrivateKey);

      const tx = await contractWithSigner.commitMilestone(
        commitData.projectId,
        commitData.milestoneId,
        commitData.rootHash,
        commitData.totalAmount,
        commitData.submilestoneCount,
        commitData.metadataUri
      );

      logger.info(`Transaction sent: ${tx.hash}`);

      const receipt = await tx.wait();

      logger.info(`Milestone committed successfully. Gas used: ${receipt.gasUsed.toString()}`);

      return tx.hash;
    } catch (error) {
      logger.error(`Failed to commit milestone: ${error}`);
      throw error;
    }
  }

  /**
   * Finalize milestone (prevent further changes)
   */
  async finalizeMilestone(
    projectId: string,
    milestoneId: string,
    sponsorPrivateKey: string
  ): Promise<string> {
    try {
      logger.info(`Finalizing milestone ${milestoneId}`);

      const contractWithSigner = this.getContractWithSigner(sponsorPrivateKey);

      const tx = await contractWithSigner.finalizeMilestone(projectId, milestoneId);

      logger.info(`Finalization transaction sent: ${tx.hash}`);

      const receipt = await tx.wait();

      logger.info(`Milestone finalized. Gas used: ${receipt.gasUsed.toString()}`);

      return tx.hash;
    } catch (error) {
      logger.error(`Failed to finalize milestone: ${error}`);
      throw error;
    }
  }

  /**
   * Get milestone commit from blockchain
   */
  async getMilestoneCommit(
    projectId: string,
    milestoneId: string
  ): Promise<{
    rootHash: string;
    committer: string;
    totalAmount: bigint;
    submilestoneCount: number;
    committedAt: number;
    finalized: boolean;
    metadataUri: string;
  } | null> {
    try {
      const commit = await this.contract.getMilestoneCommit(projectId, milestoneId);

      // Check if commit exists
      if (commit.rootHash === ethers.ZeroHash) {
        return null;
      }

      return {
        rootHash: commit.rootHash,
        committer: commit.committer,
        totalAmount: commit.totalAmount,
        submilestoneCount: Number(commit.submilestoneCount),
        committedAt: Number(commit.committedAt),
        finalized: commit.finalized,
        metadataUri: commit.metadataUri,
      };
    } catch (error) {
      logger.error(`Failed to get milestone commit: ${error}`);
      throw error;
    }
  }

  /**
   * Verify submilestone against on-chain Merkle root
   */
  async verifySubmilestone(
    projectId: string,
    milestoneId: string,
    submilestoneId: string,
    amount: bigint,
    proof: string[]
  ): Promise<boolean> {
    try {
      const isValid = await this.contract.verifySubmilestone(
        projectId,
        milestoneId,
        submilestoneId,
        amount,
        proof
      );

      logger.info(`Submilestone ${submilestoneId} verification: ${isValid ? 'VALID' : 'INVALID'}`);

      return isValid;
    } catch (error) {
      logger.error(`Failed to verify submilestone: ${error}`);
      return false;
    }
  }

  /**
   * Get all milestones for a project
   */
  async getProjectMilestones(projectId: string): Promise<string[]> {
    try {
      const milestones = await this.contract.getProjectMilestones(projectId);
      return milestones;
    } catch (error) {
      logger.error(`Failed to get project milestones: ${error}`);
      throw error;
    }
  }

  /**
   * Check if milestone is committed
   */
  async isMilestoneCommitted(projectId: string, milestoneId: string): Promise<boolean> {
    const commit = await this.getMilestoneCommit(projectId, milestoneId);
    return commit !== null;
  }

  /**
   * Check if milestone is finalized
   */
  async isMilestoneFinalized(projectId: string, milestoneId: string): Promise<boolean> {
    const commit = await this.getMilestoneCommit(projectId, milestoneId);
    return commit?.finalized ?? false;
  }
}
