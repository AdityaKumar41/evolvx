import { ethers } from 'ethers';
import { logger } from '../utils/logger';
import MilestoneManagerABI from '../../../contracts/abi/MilestoneManager.json';

const MILESTONE_MANAGER_ADDRESS = process.env.AA_MILESTONE_MANAGER_ADDRESS!;
const RPC_URL = process.env.ARBITRUM_SEPOLIA_RPC_URL!;

export interface PayoutRequestData {
  requestId: string;
  projectId: string;
  milestoneId: string;
  submilestoneId: string;
  contributor: string;
  amount: bigint;
  merkleProof: string[];
  prUrl: string;
}

/**
 * Service for interacting with MilestoneManager contract
 * Handles payout requests and AI verification workflow
 */
export class MilestonePayoutService {
  private provider: ethers.JsonRpcProvider;
  private contract: ethers.Contract;

  constructor() {
    this.provider = new ethers.JsonRpcProvider(RPC_URL);
    this.contract = new ethers.Contract(
      MILESTONE_MANAGER_ADDRESS,
      MilestoneManagerABI.abi,
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
   * Request payout for completed submilestone
   * @param requestData Payout request data
   * @param contributorPrivateKey Contributor's private key
   * @returns Transaction hash
   */
  async requestPayout(
    requestData: PayoutRequestData,
    contributorPrivateKey: string
  ): Promise<string> {
    try {
      logger.info(`Requesting payout for submilestone ${requestData.submilestoneId}`);
      logger.info(`Contributor: ${requestData.contributor}`);
      logger.info(`Amount: ${ethers.formatEther(requestData.amount)} WPOL`);
      logger.info(`PR URL: ${requestData.prUrl}`);

      const contractWithSigner = this.getContractWithSigner(contributorPrivateKey);

      const tx = await contractWithSigner.requestPayout(
        requestData.requestId,
        requestData.projectId,
        requestData.milestoneId,
        requestData.submilestoneId,
        requestData.contributor,
        requestData.amount,
        requestData.merkleProof,
        requestData.prUrl
      );

      logger.info(`Payout request transaction sent: ${tx.hash}`);

      const receipt = await tx.wait();

      logger.info(`Payout requested. Gas used: ${receipt.gasUsed.toString()}`);

      return tx.hash;
    } catch (error) {
      logger.error(`Failed to request payout: ${error}`);
      throw error;
    }
  }

  /**
   * Approve payout after AI verification
   * @param requestId Payout request ID
   * @param approved AI decision
   * @param verifierPrivateKey Backend verifier private key
   * @returns Transaction hash
   */
  async approvePayout(
    requestId: string,
    approved: boolean,
    verifierPrivateKey: string
  ): Promise<string> {
    try {
      logger.info(`${approved ? 'Approving' : 'Rejecting'} payout request ${requestId}`);

      const contractWithSigner = this.getContractWithSigner(verifierPrivateKey);

      const tx = await contractWithSigner.approvePayout(requestId, approved);

      logger.info(`Approval transaction sent: ${tx.hash}`);

      const receipt = await tx.wait();

      logger.info(
        `Payout ${approved ? 'approved' : 'rejected'}. Gas used: ${receipt.gasUsed.toString()}`
      );

      return tx.hash;
    } catch (error) {
      logger.error(`Failed to approve payout: ${error}`);
      throw error;
    }
  }

  /**
   * Reject payout with reason
   */
  async rejectPayout(
    requestId: string,
    reason: string,
    verifierPrivateKey: string
  ): Promise<string> {
    try {
      logger.info(`Rejecting payout request ${requestId}: ${reason}`);

      const contractWithSigner = this.getContractWithSigner(verifierPrivateKey);

      const tx = await contractWithSigner.rejectPayout(requestId, reason);

      logger.info(`Rejection transaction sent: ${tx.hash}`);

      const receipt = await tx.wait();

      logger.info(`Payout rejected. Gas used: ${receipt.gasUsed.toString()}`);

      return tx.hash;
    } catch (error) {
      logger.error(`Failed to reject payout: ${error}`);
      throw error;
    }
  }

  /**
   * Batch approve multiple payouts
   */
  async batchApprovePayout(
    requestIds: string[],
    approvals: boolean[],
    verifierPrivateKey: string
  ): Promise<string> {
    try {
      logger.info(`Batch processing ${requestIds.length} payout requests`);

      const contractWithSigner = this.getContractWithSigner(verifierPrivateKey);

      const tx = await contractWithSigner.batchApprovePayout(requestIds, approvals);

      logger.info(`Batch approval transaction sent: ${tx.hash}`);

      const receipt = await tx.wait();

      logger.info(`Batch processed. Gas used: ${receipt.gasUsed.toString()}`);

      return tx.hash;
    } catch (error) {
      logger.error(`Failed to batch approve payouts: ${error}`);
      throw error;
    }
  }

  /**
   * Get payout request details
   */
  async getPayoutRequest(requestId: string): Promise<{
    projectId: string;
    milestoneId: string;
    submilestoneId: string;
    contributor: string;
    amount: bigint;
    merkleProof: string[];
    prUrl: string;
    aiApproved: boolean;
    paid: boolean;
    requestedAt: number;
    processedAt: number;
  } | null> {
    try {
      const request = await this.contract.getPayoutRequest(requestId);

      // Check if request exists
      if (request.requestedAt === 0) {
        return null;
      }

      return {
        projectId: request.projectId,
        milestoneId: request.milestoneId,
        submilestoneId: request.submilestoneId,
        contributor: request.contributor,
        amount: request.amount,
        merkleProof: request.merkleProof,
        prUrl: request.prUrl,
        aiApproved: request.aiApproved,
        paid: request.paid,
        requestedAt: Number(request.requestedAt),
        processedAt: Number(request.processedAt),
      };
    } catch (error) {
      logger.error(`Failed to get payout request: ${error}`);
      throw error;
    }
  }

  /**
   * Get payout status
   */
  async getPayoutStatus(requestId: string): Promise<{
    requested: boolean;
    approved: boolean;
    paid: boolean;
    processedAt: number;
  }> {
    try {
      const status = await this.contract.getPayoutStatus(requestId);

      return {
        requested: status.requested,
        approved: status.approved,
        paid: status.paid,
        processedAt: Number(status.processedAt),
      };
    } catch (error) {
      logger.error(`Failed to get payout status: ${error}`);
      throw error;
    }
  }

  /**
   * Get all payout requests for a milestone
   */
  async getMilestonePayouts(projectId: string, milestoneId: string): Promise<string[]> {
    try {
      const payouts = await this.contract.getMilestonePayouts(projectId, milestoneId);
      return payouts;
    } catch (error) {
      logger.error(`Failed to get milestone payouts: ${error}`);
      throw error;
    }
  }

  /**
   * Add authorized verifier (must be contract owner)
   */
  async addVerifier(verifierAddress: string, ownerPrivateKey: string): Promise<string> {
    try {
      logger.info(`Adding verifier: ${verifierAddress}`);

      const contractWithSigner = this.getContractWithSigner(ownerPrivateKey);

      const tx = await contractWithSigner.addVerifier(verifierAddress);

      logger.info(`Add verifier transaction sent: ${tx.hash}`);

      const receipt = await tx.wait();

      logger.info(`Verifier added. Gas used: ${receipt.gasUsed.toString()}`);

      return tx.hash;
    } catch (error) {
      logger.error(`Failed to add verifier: ${error}`);
      throw error;
    }
  }

  /**
   * Check if address is authorized verifier
   */
  async isVerifier(address: string): Promise<boolean> {
    try {
      const isAuthorized = await this.contract.isVerifier(address);
      return isAuthorized;
    } catch (error) {
      logger.error(`Failed to check verifier status: ${error}`);
      return false;
    }
  }
}
