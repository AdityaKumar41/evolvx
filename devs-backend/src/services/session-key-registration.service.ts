import { ethers } from 'ethers';
import { prisma } from '../lib/prisma';
import { SessionKeyService } from './session-key.service';

/**
 * Session Key Registration Service
 * Handles on-chain registration of session keys in SessionKeyRegistry contract
 */

const ARBITRUM_SEPOLIA_RPC =
  process.env.ARBITRUM_SEPOLIA_RPC || 'https://sepolia-rollup.arbitrum.io/rpc';
const SESSION_KEY_REGISTRY_ADDRESS = process.env.AA_SESSION_KEY_REGISTRY_ADDRESS || '';
const MICROPAYMENT_MANAGER_ADDRESS = process.env.AA_MICROPAYMENT_MANAGER_ADDRESS || '';
const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY || '';

interface RegisterSessionKeyParams {
  userId: string;
  smartAccountAddress: string;
  maxCreditsPerPrompt: number; // e.g., 10 X402
  maxTotalSpend: number; // e.g., 1000 X402
  validDuration: number; // seconds (e.g., 7 days = 604800)
}

export class SessionKeyRegistrationService {
  private provider: ethers.JsonRpcProvider;
  private relayerWallet: ethers.Wallet;
  private sessionKeyRegistry: ethers.Contract;
  private smartAccountInterface: ethers.Interface;

  constructor() {
    this.provider = new ethers.JsonRpcProvider(ARBITRUM_SEPOLIA_RPC);

    if (!RELAYER_PRIVATE_KEY) {
      throw new Error('RELAYER_PRIVATE_KEY not configured');
    }

    this.relayerWallet = new ethers.Wallet(RELAYER_PRIVATE_KEY, this.provider);

    // SessionKeyRegistry ABI
    const registryABI = [
      'function registerSessionKey(address _sessionKey, uint256 _maxSpendPerPrompt, uint256 _maxTotalSpend, uint256 _validDuration, address _allowedContract, bytes4 _allowedFunction) external',
      'function getSessionKey(address _smartAccount, address _sessionKey) external view returns (tuple(address sessionKeyAddress, uint256 maxSpendPerPrompt, uint256 maxTotalSpend, uint256 totalSpent, uint256 expiryTimestamp, address allowedContract, bytes4 allowedFunction, bool active, uint256 registeredAt))',
      'function isSessionKeyValid(address _smartAccount, address _sessionKey) external view returns (bool)',
    ];

    this.sessionKeyRegistry = new ethers.Contract(
      SESSION_KEY_REGISTRY_ADDRESS,
      registryABI,
      this.relayerWallet
    );

    // SmartAccountV2 ABI (for calling registerSessionKey on smart account)
    this.smartAccountInterface = new ethers.Interface([
      'function registerSessionKey(address _sessionKey, uint256 _maxSpendPerPrompt, uint256 _maxTotalSpend, uint256 _validDuration, address _allowedContract, bytes4 _allowedFunction) external',
    ]);
  }

  /**
   * Register session key on-chain
   * Called by SmartAccount owner (via relayer or direct call)
   *
   * Flow:
   * 1. Generate session key pair (off-chain)
   * 2. Store encrypted private key in DB
   * 3. Call SmartAccount.registerSessionKey (which calls SessionKeyRegistry.registerSessionKey)
   * 4. Mark as registeredOnChain in DB
   */
  async registerSessionKey(params: RegisterSessionKeyParams): Promise<{
    sessionKeyId: string;
    publicKey: string;
    txHash: string;
  }> {
    const { userId, smartAccountAddress, maxCreditsPerPrompt, maxTotalSpend, validDuration } =
      params;

    console.log('[SessionKeyRegistration] Starting registration for:', {
      userId,
      smartAccountAddress,
      maxCreditsPerPrompt,
      maxTotalSpend,
      validDuration,
    });

    // 1. Create session key in database (generates key pair, encrypts private key)
    const sessionKey = await SessionKeyService.createSessionKey(userId, smartAccountAddress, {
      maxCreditsPerPrompt,
      maxTotalSpend,
      validDuration,
    });

    console.log('[SessionKeyRegistration] Session key created in DB:', sessionKey.sessionKeyId);

    // 2. Calculate function selector for chargeX402
    const chargeX402Selector = ethers.id('chargeX402(uint256,string)').slice(0, 10); // 0x + 8 chars = bytes4

    // 3. Convert X402 amounts to wei (assuming 18 decimals)
    const maxSpendPerPromptWei = ethers.parseUnits(maxCreditsPerPrompt.toString(), 18);
    const maxTotalSpendWei = ethers.parseUnits(maxTotalSpend.toString(), 18);

    try {
      // 4. Build transaction to call SmartAccount.registerSessionKey
      // NOTE: In production, this should be called by the smart account owner
      // For now, we'll call it directly via relayer (assuming smart account has proper access control)

      const smartAccount = new ethers.Contract(
        smartAccountAddress,
        this.smartAccountInterface,
        this.relayerWallet
      );

      console.log('[SessionKeyRegistration] Calling registerSessionKey on-chain...');

      const tx = await smartAccount.registerSessionKey(
        sessionKey.publicKey,
        maxSpendPerPromptWei,
        maxTotalSpendWei,
        validDuration,
        MICROPAYMENT_MANAGER_ADDRESS,
        chargeX402Selector
      );

      console.log('[SessionKeyRegistration] Transaction sent:', tx.hash);

      // 5. Wait for confirmation
      const receipt = await tx.wait();

      console.log('[SessionKeyRegistration] Transaction confirmed:', {
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
      });

      // 6. Update database: mark as registered on-chain
      await prisma.sessionKey.update({
        where: { id: sessionKey.sessionKeyId },
        data: { registeredOnChain: true },
      });

      console.log('[SessionKeyRegistration] Session key registered successfully');

      return {
        sessionKeyId: sessionKey.sessionKeyId,
        publicKey: sessionKey.publicKey,
        txHash: tx.hash,
      };
    } catch (error) {
      // Registration failed - delete session key from DB
      await prisma.sessionKey.delete({
        where: { id: sessionKey.sessionKeyId },
      });

      console.error('[SessionKeyRegistration] Failed to register session key:', error);
      throw new Error(
        `Failed to register session key: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Check if session key is registered on-chain
   */
  async isSessionKeyRegistered(
    smartAccountAddress: string,
    sessionKeyAddress: string
  ): Promise<boolean> {
    try {
      const isValid = await this.sessionKeyRegistry.isSessionKeyValid(
        smartAccountAddress,
        sessionKeyAddress
      );
      return isValid;
    } catch (error) {
      console.error('[SessionKeyRegistration] Failed to check registration:', error);
      return false;
    }
  }

  /**
   * Get session key details from on-chain registry
   */
  async getSessionKeyOnChain(smartAccountAddress: string, sessionKeyAddress: string) {
    try {
      const sessionKey = await this.sessionKeyRegistry.getSessionKey(
        smartAccountAddress,
        sessionKeyAddress
      );
      return sessionKey;
    } catch (error) {
      console.error('[SessionKeyRegistration] Failed to get session key:', error);
      return null;
    }
  }

  /**
   * Auto-register session key if user has active smart account but no session key
   * Called when user first uses AI features
   */
  async autoRegisterSessionKey(userId: string, smartAccountAddress: string): Promise<string> {
    console.log('[SessionKeyRegistration] Auto-registering session key for user:', userId);

    // Check if user already has an active session key
    const existingKey = await SessionKeyService.getActiveSessionKey(smartAccountAddress);

    if (existingKey) {
      console.log('[SessionKeyRegistration] User already has active session key');
      return existingKey.id;
    }

    // Default session key config (7 days, 10 X402 per prompt, 1000 X402 total)
    const result = await this.registerSessionKey({
      userId,
      smartAccountAddress,
      maxCreditsPerPrompt: 10,
      maxTotalSpend: 1000,
      validDuration: 7 * 24 * 60 * 60, // 7 days
    });

    console.log('[SessionKeyRegistration] Auto-registration successful:', result.sessionKeyId);

    return result.sessionKeyId;
  }
}

export const sessionKeyRegistrationService = new SessionKeyRegistrationService();
