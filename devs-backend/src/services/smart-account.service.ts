import { ethers } from 'ethers';
import { logger } from '../utils/logger';
import { prisma } from '../lib/prisma';
import { SessionKeyRegistrationService } from './session-key-registration.service';
import { config } from '../config';

// ABIs commented out - AA contracts not yet deployed
// import EvolvxRootManagerABI from '../../../contracts/abi/EvolvxRootManager.json';
// import SessionKeyRegistryABI from '../../../contracts/abi/SessionKeyRegistry.json';
// import CreditManagerV2ABI from '../../../contracts/abi/CreditManagerV2.json';

// Contract addresses commented out - not needed in virtual mode
// const AA_DEPLOYMENT = {
//   RootManager: config.blockchain.aa.rootManager,
//   SmartAccountFactory: config.blockchain.aa.smartAccountFactory,
//   CreditManagerV2: config.blockchain.aa.creditManager,
//   SessionKeyRegistry: config.blockchain.aa.sessionKeyRegistry,
//   EntryPoint: config.blockchain.aa.entryPoint,
// };

export interface SmartAccountInfo {
  smartAccountAddress: string;
  sessionKeys: Array<{
    key: string;
    expiresAt: number;
    spendingLimit: string;
  }>;
}

export class SmartAccountService {
  private provider: ethers.JsonRpcProvider;
  private wallet?: ethers.Wallet;
  // Contracts - will be used when AA contracts are deployed
  // private rootManager?: ethers.Contract;
  // private creditManager?: ethers.Contract;
  // private sessionRegistry?: ethers.Contract;

  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);

    if (config.blockchain.relayerPrivateKey) {
      this.wallet = new ethers.Wallet(config.blockchain.relayerPrivateKey, this.provider);

      // Contract initialization commented out until AA contracts are deployed
      // this.rootManager = new ethers.Contract(
      //   AA_DEPLOYMENT.RootManager,
      //   EvolvxRootManagerABI.abi,
      //   this.wallet
      // );

      // this.creditManager = new ethers.Contract(
      //   AA_DEPLOYMENT.CreditManagerV2,
      //   CreditManagerV2ABI.abi,
      //   this.wallet
      // );

      // this.sessionRegistry = new ethers.Contract(
      //   AA_DEPLOYMENT.SessionKeyRegistry,
      //   SessionKeyRegistryABI.abi,
      //   this.wallet
      // );

      logger.info('✓ Smart Account Service initialized (virtual mode - no on-chain contracts)');
      logger.info('  Relayer wallet:', this.wallet.address);
    } else {
      logger.info('✓ Smart Account Service initialized (virtual mode - no relayer needed)');
    }
  }

  /**
   * Get user's smart account from database
   */
  async getUserSmartAccount(userId: string): Promise<SmartAccountInfo | null> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { smartAccountAddress: true },
      });

      if (!user?.smartAccountAddress) {
        return null;
      }

      return this.getSmartAccountInfo(user.smartAccountAddress);
    } catch (error) {
      logger.error('Error getting user smart account:', error);
      throw error;
    }
  }

  /**
   * Create smart account via RootManager (Web2-like, gasless)
   *
   * NOTE: Currently creates virtual smart accounts (database only)
   * When AA contracts are deployed, this will call on-chain functions
   */
  async createSmartAccountViaRootManager(userId: string): Promise<SmartAccountInfo> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { walletAddress: true },
      });

      if (!user?.walletAddress) {
        // Generate a temporary wallet for the user if they don't have one
        const tempWallet = ethers.Wallet.createRandom();
        const tempAddress = tempWallet.address;

        logger.info(`Creating temporary wallet for user ${userId}: ${tempAddress}`);

        // Update user with temp wallet
        await prisma.user.update({
          where: { id: userId },
          data: { walletAddress: tempAddress },
        });

        return this.onboardUser(userId, tempAddress);
      }

      // Use existing wallet address
      return this.onboardUser(userId, user.walletAddress);
    } catch (error) {
      logger.error('Error creating smart account via root manager:', error);
      throw error;
    }
  }

  /**
   * Execute gasless transaction via bundler/paymaster
   */
  async executeGaslessTransaction(
    userId: string,
    tx: { to: string; data: string; value: string }
  ): Promise<{ txHash: string }> {
    try {
      if (!this.wallet) {
        throw new Error('Relayer wallet not initialized');
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { smartAccountAddress: true },
      });

      if (!user?.smartAccountAddress) {
        throw new Error('User does not have a smart account');
      }

      logger.info(
        `Executing gasless transaction for user ${userId} from ${user.smartAccountAddress}`
      );

      // In production, this would:
      // 1. Create UserOperation with tx.to, tx.data, tx.value
      // 2. Sign with session key or user signature
      // 3. Send to bundler
      // 4. Paymaster sponsors gas
      //
      // For now, relayer executes directly (simulating gasless)
      const transaction = await this.wallet.sendTransaction({
        to: tx.to,
        data: tx.data,
        value: ethers.parseEther(tx.value),
        gasLimit: 300000,
      });

      const receipt = await transaction.wait();

      logger.info(`Gasless transaction confirmed: ${receipt!.hash}`);

      return {
        txHash: receipt!.hash,
      };
    } catch (error) {
      logger.error('Error executing gasless transaction:', error);
      throw error;
    }
  }

  /**
   * Onboard user and create smart account
   */
  async onboardUser(userId: string, userAddress: string): Promise<SmartAccountInfo> {
    try {
      logger.info(`Onboarding user ${userId} with address ${userAddress}`);

      // Generate deterministic salt from userId
      const salt = ethers.keccak256(ethers.toUtf8Bytes(userId));

      // Calculate smart account address (deterministic)
      const smartAccountAddress = await this.predictSmartAccountAddress(userAddress, salt);

      // Check if already onboarded
      const existingUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { smartAccountAddress: true },
      });

      if (existingUser?.smartAccountAddress) {
        logger.info(
          `User ${userId} already has smart account: ${existingUser.smartAccountAddress}`
        );
        return this.getSmartAccountInfo(existingUser.smartAccountAddress);
      }

      // NOTE: AA contracts not yet deployed on-chain
      // For now, we just create the smart account record in the database
      // When contracts are deployed, this will call RootManager.onboardUser()

      logger.info(`Creating virtual smart account for user ${userId}: ${smartAccountAddress}`);

      // Update user in database
      await prisma.user.update({
        where: { id: userId },
        data: {
          smartAccountAddress: smartAccountAddress.toLowerCase(),
          walletAddress: userAddress.toLowerCase(),
        },
      });

      logger.info(`Smart account created successfully: ${smartAccountAddress}`);

      // Automatically register a session key for AI micropayments
      try {
        const sessionKeyService = new SessionKeyRegistrationService();
        const sessionKeyResult = await sessionKeyService.registerSessionKey({
          userId,
          smartAccountAddress,
          maxCreditsPerPrompt: 10, // 10 X402 per prompt
          maxTotalSpend: 1000, // 1000 X402 total
          validDuration: 30 * 24 * 60 * 60, // 30 days
        });

        logger.info(
          `Session key registered for smart account ${smartAccountAddress}: ${sessionKeyResult.sessionKeyId}`
        );

        return {
          smartAccountAddress,
          sessionKeys: [sessionKeyResult.sessionKeyId],
        };
      } catch (sessionKeyError) {
        logger.error('Failed to register session key:', sessionKeyError);
        logger.warn(
          'Smart account created but session key registration failed. User may need to register manually.'
        );

        return {
          smartAccountAddress,
          sessionKeys: [],
        };
      }
    } catch (error) {
      logger.error('Error onboarding user:', error);
      throw error;
    }
  }

  /**
   * Predict smart account address (deterministic)
   *
   * NOTE: Since AA contracts are not yet deployed, we generate a deterministic
   * address based on userId that will be used when contracts are deployed.
   */
  async predictSmartAccountAddress(owner: string, salt: string): Promise<string> {
    try {
      // For now, generate a deterministic address from userId and owner
      // This will be replaced with actual CREATE2 prediction when contracts are deployed
      const hash = ethers.keccak256(
        ethers.solidityPacked(
          ['string', 'address', 'bytes32'],
          ['DEVSPONSOR_SMART_ACCOUNT', owner, salt]
        )
      );

      // Convert hash to address format (take first 20 bytes)
      const address = ethers.getAddress('0x' + hash.slice(26));

      logger.info(`Generated deterministic address for owner ${owner}: ${address}`);
      return address;
    } catch (error) {
      logger.error('Error predicting smart account address:', error);
      throw error;
    }
  }

  /**
   * Get smart account info
   */
  /**
   * Get smart account info
   *
   * NOTE: Currently reads from database
   * When AA contracts are deployed, this will read on-chain balances
   */
  async getSmartAccountInfo(smartAccountAddress: string): Promise<SmartAccountInfo> {
    try {
      // Get user from database (normalize to lowercase for case-insensitive query)
      const user = await prisma.user.findFirst({
        where: { smartAccountAddress: smartAccountAddress.toLowerCase() },
        select: {
          sessionKeys: true,
        },
      });

      if (!user) {
        throw new Error('Smart account not found');
      }

      type SessionKey = {
        key: string;
        expiresAt: number;
        spendingLimit: string;
      };

      const sessionKeys = (
        Array.isArray(user?.sessionKeys) ? user.sessionKeys : []
      ) as SessionKey[];

      return {
        smartAccountAddress,
        sessionKeys,
      };
    } catch (error) {
      logger.error('Error getting smart account info:', error);
      throw error;
    }
  }

  /**
   * Register session key for gasless operations
   * NOTE: Deprecated - Use AARegistryService instead
   */
  async registerSessionKey(
    _smartAccountAddress: string,
    _sessionKey: string,
    _validUntil: number,
    _spendingLimit: string
  ): Promise<string> {
    // This method is deprecated - use AARegistryService.registerSessionKey instead
    logger.warn('SmartAccountService.registerSessionKey is deprecated - use AARegistryService');
    throw new Error('This method is deprecated - use AARegistryService.registerSessionKey instead');

    /* Commented out - sessionRegistry is not initialized
    try {
      if (!this.sessionRegistry) {
        throw new Error('Session registry not initialized');
      }

      logger.info(`Registering session key for ${smartAccountAddress}`);

      const tx = await this.sessionRegistry.registerKey(
        smartAccountAddress,
        sessionKey,
        validUntil,
        ethers.parseEther(spendingLimit),
        {
          gasLimit: 100000,
        }
      );

      const receipt = await tx.wait();

      // Store in database (normalize address for case-insensitive query)
      const user = await prisma.user.findFirst({
        where: { smartAccountAddress: smartAccountAddress.toLowerCase() },
        select: { sessionKeys: true, id: true },
      });

      type SessionKey = {
        key: string;
        expiresAt: number;
        spendingLimit: string;
        createdAt?: number;
      };

      const sessionKeys = (
        Array.isArray(user?.sessionKeys) ? user.sessionKeys : []
      ) as SessionKey[];
      sessionKeys.push({
        key: sessionKey,
        expiresAt: validUntil,
        spendingLimit,
        createdAt: Date.now(),
      });

      await prisma.user.update({
        where: { id: user?.id },
        data: { sessionKeys },
      });

      return receipt.hash;
    } catch (error) {
      logger.error('Error registering session key:', error);
      throw error;
    }
    */
  }

  /**
   * Register smart account address for user (called after frontend deployment)
   */
  async registerSmartAccountAddress(userId: string, smartAccountAddress: string) {
    try {
      logger.info(`Registering smart account ${smartAccountAddress} for user ${userId}`);

      // Update user with smart account address (normalize to lowercase)
      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          smartAccountAddress: smartAccountAddress.toLowerCase(),
        },
      });

      return user;
    } catch (error) {
      logger.error('Error registering smart account address:', error);
      throw error;
    }
  }
}

export const smartAccountService = new SmartAccountService();
