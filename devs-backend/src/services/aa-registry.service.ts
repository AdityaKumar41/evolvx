import { ethers, Contract, Wallet } from 'ethers';
import SessionKeyRegistryABI from '../../../contracts/abi/SessionKeyRegistry.json';
import { SessionKeyService } from './session-key.service';

/**
 * Account Abstraction Registry Service
 * Handles on-chain registration of session keys in SessionKeyRegistry
 */

const ARBITRUM_SEPOLIA_RPC =
  process.env.ARBITRUM_SEPOLIA_RPC || 'https://sepolia-rollup.arbitrum.io/rpc';
const SESSION_KEY_REGISTRY_ADDRESS = '0x0Af4E01864234543B55788b80e07b31D9657F49B';
const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY || '';

if (!RELAYER_PRIVATE_KEY) {
  console.warn('WARNING: RELAYER_PRIVATE_KEY not set - session key registration will fail');
}

export class AARegistryService {
  private provider: ethers.JsonRpcProvider;
  private registry: Contract;
  private relayerWallet: Wallet;

  constructor() {
    this.provider = new ethers.JsonRpcProvider(ARBITRUM_SEPOLIA_RPC);
    this.relayerWallet = new Wallet(RELAYER_PRIVATE_KEY, this.provider);
    this.registry = new Contract(
      SESSION_KEY_REGISTRY_ADDRESS,
      SessionKeyRegistryABI.abi,
      this.relayerWallet
    );
  }

  /**
   * Register a session key on-chain
   * @param smartAccountAddress - User's smart account address
   * @param sessionKeyAddress - Public key of session key (address)
   * @param maxCredits - Max credits per transaction
   * @param maxTotalSpend - Max total credits that can be spent
   * @param validDuration - Duration in seconds
   * @returns Transaction hash
   */
  async registerSessionKey(
    smartAccountAddress: string,
    sessionKeyAddress: string,
    maxCredits: number,
    maxTotalSpend: number,
    validDuration: number
  ): Promise<string> {
    try {
      console.log(`[AARegistry] Registering session key for ${smartAccountAddress}`);
      console.log(`[AARegistry] Session key: ${sessionKeyAddress}`);
      console.log(`[AARegistry] Max credits per prompt: ${maxCredits}`);
      console.log(`[AARegistry] Max total spend: ${maxTotalSpend}`);
      console.log(`[AARegistry] Valid for: ${validDuration} seconds`);

      // Convert to on-chain format (credits as uint256 - multiply by 1e8 for precision)
      const maxCreditsWei = ethers.parseUnits(maxCredits.toString(), 8);
      const maxTotalSpendWei = ethers.parseUnits(maxTotalSpend.toString(), 8);

      const tx = await this.registry.registerSessionKey(
        smartAccountAddress,
        sessionKeyAddress,
        maxCreditsWei,
        maxTotalSpendWei,
        validDuration
      );

      console.log(`[AARegistry] Transaction sent: ${tx.hash}`);

      const receipt = await tx.wait();

      console.log(`[AARegistry] Transaction confirmed in block ${receipt.blockNumber}`);

      return tx.hash;
    } catch (error: unknown) {
      console.error('[AARegistry] Failed to register session key:', error);
      throw new Error(
        `Failed to register session key: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Revoke a session key on-chain
   * @param smartAccountAddress - User's smart account address
   * @param sessionKeyAddress - Session key to revoke
   * @returns Transaction hash
   */
  async revokeSessionKey(smartAccountAddress: string, sessionKeyAddress: string): Promise<string> {
    try {
      console.log(
        `[AARegistry] Revoking session key ${sessionKeyAddress} for ${smartAccountAddress}`
      );

      const tx = await this.registry.revokeSessionKey(smartAccountAddress, sessionKeyAddress);

      console.log(`[AARegistry] Revocation transaction sent: ${tx.hash}`);

      const receipt = await tx.wait();

      console.log(`[AARegistry] Revocation confirmed in block ${receipt.blockNumber}`);

      return tx.hash;
    } catch (error: unknown) {
      console.error('[AARegistry] Failed to revoke session key:', error);
      throw new Error(
        `Failed to revoke session key: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Check if session key is valid on-chain
   * @param smartAccountAddress - User's smart account address
   * @param sessionKeyAddress - Session key address
   * @param creditsToUse - Credits to use
   * @returns Boolean indicating if valid
   */
  async isSessionKeyValid(
    smartAccountAddress: string,
    sessionKeyAddress: string,
    creditsToUse: number
  ): Promise<boolean> {
    try {
      const creditsWei = ethers.parseUnits(creditsToUse.toString(), 8);

      const valid = await this.registry.isSessionKeyValid(
        smartAccountAddress,
        sessionKeyAddress,
        creditsWei
      );

      return valid;
    } catch (error: unknown) {
      console.error('[AARegistry] Failed to check session key validity:', error);
      return false;
    }
  }

  /**
   * Get session key details from on-chain
   * @param smartAccountAddress - User's smart account address
   * @param sessionKeyAddress - Session key address
   * @returns Session key details
   */
  async getSessionKeyDetails(smartAccountAddress: string, sessionKeyAddress: string) {
    try {
      const details = await this.registry.getSessionKey(smartAccountAddress, sessionKeyAddress);

      return {
        key: details.key,
        maxCredits: ethers.formatUnits(details.maxCredits, 8),
        maxTotalSpend: ethers.formatUnits(details.maxTotalSpend, 8),
        totalSpent: ethers.formatUnits(details.totalSpent, 8),
        expiresAt: new Date(Number(details.expiresAt) * 1000),
        active: details.active,
      };
    } catch (error: unknown) {
      console.error('[AARegistry] Failed to get session key details:', error);
      throw new Error(
        `Failed to get session key details: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get remaining credits for session key
   * @param smartAccountAddress - User's smart account address
   * @param sessionKeyAddress - Session key address
   * @returns Remaining credits
   */
  async getRemainingCredits(
    smartAccountAddress: string,
    sessionKeyAddress: string
  ): Promise<number> {
    try {
      const remaining = await this.registry.getRemainingCredits(
        smartAccountAddress,
        sessionKeyAddress
      );

      return Number(ethers.formatUnits(remaining, 8));
    } catch (error: unknown) {
      console.error('[AARegistry] Failed to get remaining credits:', error);
      return 0;
    }
  }

  /**
   * Register session key with database sync
   * Creates session key in database, registers on-chain, then marks as registered
   */
  static async registerWithDatabaseSync(
    userId: string,
    smartAccountAddress: string,
    config: {
      maxCreditsPerPrompt: number;
      maxTotalSpend: number;
      validDuration: number;
    }
  ) {
    // 1. Create session key in database
    const sessionKey = await SessionKeyService.createSessionKey(
      userId,
      smartAccountAddress,
      config
    );

    // 2. Register on-chain
    const aaRegistry = new AARegistryService();
    const txHash = await aaRegistry.registerSessionKey(
      smartAccountAddress,
      sessionKey.publicKey,
      config.maxCreditsPerPrompt,
      config.maxTotalSpend,
      config.validDuration
    );

    // 3. Mark as registered in database
    await SessionKeyService.markAsRegistered(sessionKey.sessionKeyId, txHash);

    return {
      ...sessionKey,
      onChainTxHash: txHash,
      registeredOnChain: true,
    };
  }
}
