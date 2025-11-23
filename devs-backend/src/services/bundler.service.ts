import axios from 'axios';
import { ethers } from 'ethers';
import { prisma } from '../lib/prisma';

/**
 * Bundler Service
 * Submits ERC-4337 UserOperations to Arbitrum Sepolia bundler
 * Handles userOpHash tracking and receipt polling
 */

// Arbitrum Sepolia Bundler (Alchemy, Pimlico, or Stackup)
const BUNDLER_RPC_URL =
  process.env.BUNDLER_RPC_URL || 'https://api.pimlico.io/v2/421614/rpc?apikey=YOUR_API_KEY';

const ENTRY_POINT_ADDRESS = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789';

interface UserOperation {
  sender: string;
  nonce: string;
  initCode: string;
  callData: string;
  callGasLimit: string;
  verificationGasLimit: string;
  preVerificationGas: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  paymasterAndData: string;
  signature: string;
}

interface UserOperationReceipt {
  userOpHash: string;
  entryPoint: string;
  sender: string;
  nonce: string;
  paymaster: string;
  actualGasCost: string;
  actualGasUsed: string;
  success: boolean;
  reason?: string;
  logs: Array<{
    address: string;
    topics: string[];
    data: string;
  }>;
  receipt: {
    transactionHash: string;
    blockNumber: number;
    status: number;
  };
}

export class BundlerService {
  private rpcUrl: string;

  constructor(rpcUrl?: string) {
    this.rpcUrl = rpcUrl || BUNDLER_RPC_URL;

    if (!this.rpcUrl || this.rpcUrl.includes('YOUR_API_KEY')) {
      console.warn('WARNING: BUNDLER_RPC_URL not properly configured');
    }
  }

  /**
   * Send UserOperation to bundler
   * @param userOp - Complete UserOperation
   * @returns UserOperation hash
   */
  async sendUserOperation(userOp: UserOperation): Promise<string> {
    try {
      console.log('[Bundler] Submitting UserOperation to bundler...');

      const response = await axios.post(
        this.rpcUrl,
        {
          jsonrpc: '2.0',
          method: 'eth_sendUserOperation',
          params: [userOp, ENTRY_POINT_ADDRESS],
          id: 1,
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.data.error) {
        console.error('[Bundler] Error from bundler:', response.data.error);
        throw new Error(`Bundler error: ${response.data.error.message}`);
      }

      const userOpHash = response.data.result;

      console.log('[Bundler] UserOperation submitted successfully');
      console.log('[Bundler] UserOpHash:', userOpHash);

      return userOpHash;
    } catch (error: unknown) {
      const err = error as { message?: string };
      console.error('[Bundler] Failed to send UserOperation:', err.message);
      throw new Error(`Failed to send UserOperation: ${err.message}`);
    }
  }

  /**
   * Get UserOperation receipt (check if mined)
   * @param userOpHash - UserOperation hash
   * @returns UserOperation receipt or null if not mined yet
   */
  async getUserOperationReceipt(userOpHash: string): Promise<UserOperationReceipt | null> {
    try {
      const response = await axios.post(
        this.rpcUrl,
        {
          jsonrpc: '2.0',
          method: 'eth_getUserOperationReceipt',
          params: [userOpHash],
          id: 1,
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.data.error) {
        console.error('[Bundler] Error getting receipt:', response.data.error);
        return null;
      }

      const receipt = response.data.result;

      if (!receipt) {
        // Not mined yet
        return null;
      }

      return receipt;
    } catch (error: unknown) {
      const err = error as { message?: string };
      console.error('[Bundler] Failed to get receipt:', err.message);
      return null;
    }
  }

  /**
   * Poll for UserOperation receipt with timeout
   * @param userOpHash - UserOperation hash
   * @param timeoutMs - Timeout in milliseconds (default 60s)
   * @param intervalMs - Poll interval in milliseconds (default 2s)
   * @returns UserOperation receipt or null if timeout
   */
  async waitForReceipt(
    userOpHash: string,
    timeoutMs: number = 60000,
    intervalMs: number = 2000
  ): Promise<UserOperationReceipt | null> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const receipt = await this.getUserOperationReceipt(userOpHash);

      if (receipt) {
        console.log('[Bundler] Receipt received for userOpHash:', userOpHash);
        console.log('[Bundler] Transaction hash:', receipt.receipt.transactionHash);
        console.log('[Bundler] Success:', receipt.success);

        return receipt;
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    console.log('[Bundler] Timeout waiting for receipt:', userOpHash);
    return null;
  }

  /**
   * Submit UserOperation and update database with userOpHash
   * @param userOp - UserOperation
   * @param micropaymentId - AIMicropayment ID from database
   * @returns UserOperation hash
   */
  async submitAndTrack(userOp: UserOperation, micropaymentId: string): Promise<string> {
    // 1. Submit to bundler
    const userOpHash = await this.sendUserOperation(userOp);

    // 2. Update database with userOpHash
    await prisma.aIMicropayment.update({
      where: { id: micropaymentId },
      data: {
        userOpHash,
        status: 'PENDING',
        updatedAt: new Date(),
      },
    });

    // 3. Start background polling for receipt (don't await)
    this.pollForConfirmation(userOpHash, micropaymentId).catch((error) => {
      console.error('[Bundler] Error polling for confirmation:', error);
    });

    return userOpHash;
  }

  /**
   * Background polling for UserOperation confirmation
   * Updates database when transaction is mined
   * @param userOpHash - UserOperation hash
   * @param micropaymentId - AIMicropayment ID
   */
  private async pollForConfirmation(userOpHash: string, micropaymentId: string): Promise<void> {
    console.log('[Bundler] Starting background polling for', userOpHash);

    // Poll for up to 5 minutes
    const receipt = await this.waitForReceipt(userOpHash, 300000, 3000);

    if (!receipt) {
      // Timeout - mark as failed
      await prisma.aIMicropayment.update({
        where: { id: micropaymentId },
        data: {
          status: 'FAILED',
          failureReason: 'UserOperation confirmation timeout',
          updatedAt: new Date(),
        },
      });

      console.log('[Bundler] UserOperation timed out:', userOpHash);
      return;
    }

    // Success or failure based on receipt
    if (receipt.success) {
      await prisma.aIMicropayment.update({
        where: { id: micropaymentId },
        data: {
          status: 'SUCCESS',
          transactionHash: receipt.receipt.transactionHash,
          settledAt: new Date(),
          updatedAt: new Date(),
          metadata: {
            blockNumber: receipt.receipt.blockNumber,
            actualGasCost: receipt.actualGasCost,
            actualGasUsed: receipt.actualGasUsed,
          },
        },
      });

      console.log('[Bundler] UserOperation confirmed successfully:', {
        userOpHash,
        transactionHash: receipt.receipt.transactionHash,
        blockNumber: receipt.receipt.blockNumber,
      });
    } else {
      await prisma.aIMicropayment.update({
        where: { id: micropaymentId },
        data: {
          status: 'FAILED',
          failureReason: receipt.reason || 'UserOperation execution failed',
          transactionHash: receipt.receipt.transactionHash,
          updatedAt: new Date(),
        },
      });

      console.log('[Bundler] UserOperation failed:', {
        userOpHash,
        reason: receipt.reason,
      });
    }
  }

  /**
   * Estimate UserOperation gas (optional - for gas limit estimation)
   * @param userOp - UserOperation without gas limits
   * @returns Estimated gas limits
   */
  async estimateUserOperationGas(userOp: Partial<UserOperation>): Promise<{
    preVerificationGas: string;
    verificationGasLimit: string;
    callGasLimit: string;
  }> {
    try {
      const response = await axios.post(
        this.rpcUrl,
        {
          jsonrpc: '2.0',
          method: 'eth_estimateUserOperationGas',
          params: [userOp, ENTRY_POINT_ADDRESS],
          id: 1,
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.data.error) {
        console.error('[Bundler] Error estimating gas:', response.data.error);
        throw new Error(`Gas estimation failed: ${response.data.error.message}`);
      }

      return response.data.result;
    } catch (error: unknown) {
      const err = error as { message?: string };
      console.error('[Bundler] Failed to estimate gas:', err.message);

      // Return default values
      return {
        preVerificationGas: ethers.toBeHex(50000),
        verificationGasLimit: ethers.toBeHex(300000),
        callGasLimit: ethers.toBeHex(100000),
      };
    }
  }
}
