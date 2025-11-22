import { ethers } from 'ethers';
import { config } from '../config';
import { logger } from '../utils/logger';

// ABI fragments for the contracts
const PAYMENT_MANAGER_ABI = [
  'function submitProof(bytes memory proof, uint256[6] memory publicSignals) external',
  'function deposit(address token, uint256 amount) external',
  'function withdraw(address token, uint256 amount) external',
  'event ProofVerified(bytes32 indexed proofHash, address indexed contributor, uint256 amount)',
  'event PaymentReleased(address indexed contributor, address indexed token, uint256 amount)',
];

const VERIFIER_ABI = [
  'function verifyProof(uint256[2] memory a, uint256[2][2] memory b, uint256[2] memory c, uint256[6] memory input) external view returns (bool)',
];

export class BlockchainService {
  private provider: ethers.JsonRpcProvider;
  private wallet?: ethers.Wallet;
  private paymentContract?: ethers.Contract;
  private verifierContract?: ethers.Contract;

  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);

    if (config.blockchain.relayerPrivateKey) {
      this.wallet = new ethers.Wallet(config.blockchain.relayerPrivateKey, this.provider);
    }

    if (config.blockchain.paymentContractAddress && this.wallet) {
      this.paymentContract = new ethers.Contract(
        config.blockchain.paymentContractAddress,
        PAYMENT_MANAGER_ABI,
        this.wallet
      );
    }

    if (config.blockchain.verifierContractAddress && this.wallet) {
      this.verifierContract = new ethers.Contract(
        config.blockchain.verifierContractAddress,
        VERIFIER_ABI,
        this.wallet
      );
    }
  }

  async submitProof(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    proof: any,
    publicSignals: string[]
  ): Promise<{ txHash: string; verified: boolean }> {
    if (!this.paymentContract) {
      throw new Error('Payment contract not initialized');
    }

    try {
      logger.info('Submitting proof to blockchain...');

      const tx = await this.paymentContract.submitProof(proof, publicSignals, {
        gasLimit: config.blockchain.gasLimit,
      });

      const receipt = await tx.wait();
      logger.info(`Proof submitted successfully: ${receipt.hash}`);

      return {
        txHash: receipt.hash,
        verified: true,
      };
    } catch (error) {
      logger.error('Failed to submit proof:', error);
      throw error;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async verifyProof(a: any, b: any, c: any, publicInputs: string[]): Promise<boolean> {
    if (!this.verifierContract) {
      throw new Error('Verifier contract not initialized');
    }

    try {
      const verified = await this.verifierContract.verifyProof(a, b, c, publicInputs);
      return verified;
    } catch (error) {
      logger.error('Failed to verify proof onchain:', error);
      return false;
    }
  }

  async getTransactionReceipt(txHash: string) {
    try {
      const receipt = await this.provider.getTransactionReceipt(txHash);
      return receipt;
    } catch (error) {
      logger.error('Failed to get transaction receipt:', error);
      throw error;
    }
  }

  async getBlockNumber(): Promise<number> {
    return await this.provider.getBlockNumber();
  }

  async estimateGas(to: string, data: string): Promise<bigint> {
    return await this.provider.estimateGas({ to, data });
  }

  /**
   * Verify a transaction exists and is confirmed
   */
  async verifyTransaction(txHash: string): Promise<boolean> {
    try {
      const receipt = await this.provider.getTransactionReceipt(txHash);
      if (!receipt) {
        logger.warn(`Transaction ${txHash} not found`);
        return false;
      }

      // Check if transaction was successful (status 1)
      if (receipt.status === 0) {
        logger.warn(`Transaction ${txHash} failed`);
        return false;
      }

      // Check confirmations (require at least 1)
      const currentBlock = await this.provider.getBlockNumber();
      const confirmations = currentBlock - receipt.blockNumber;

      if (confirmations < 1) {
        logger.warn(`Transaction ${txHash} has insufficient confirmations: ${confirmations}`);
        return false;
      }

      logger.info(`Transaction ${txHash} verified with ${confirmations} confirmations`);
      return true;
    } catch (error) {
      logger.error(`Error verifying transaction ${txHash}:`, error);
      return false;
    }
  }
}

export const blockchainService = new BlockchainService();
