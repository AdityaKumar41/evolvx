import { ethers, Wallet, keccak256, solidityPacked } from 'ethers';
import { SessionKeyService } from './session-key.service';

/**
 * UserOperation Builder Service
 * Constructs ERC-4337 UserOperations for gasless micropayments
 *
 * UserOperation Flow:
 * 1. User sends prompt → Backend calculates cost
 * 2. Build UserOp with MicropaymentManager.chargeX402(amount, promptId)
 * 3. Sign with session key (NO user interaction)
 * 4. Submit to bundler with MicropaymentPaymaster sponsorship
 * 5. Store userOpHash and track confirmation
 */

const ARBITRUM_SEPOLIA_RPC =
  process.env.ARBITRUM_SEPOLIA_RPC || 'https://sepolia-rollup.arbitrum.io/rpc';
const ENTRY_POINT_ADDRESS = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'; // Standard ERC-4337
const MICROPAYMENT_MANAGER_ADDRESS = process.env.AA_MICROPAYMENT_MANAGER_ADDRESS || '';
const MICROPAYMENT_PAYMASTER_ADDRESS = process.env.AA_MICROPAYMENT_PAYMASTER_ADDRESS || '';
const SMART_ACCOUNT_FACTORY_ADDRESS =
  process.env.AA_SMART_ACCOUNT_FACTORY_ADDRESS || '0x7A8Dc375b57C4436Fb89041A089846f5a46B9415';
const SESSION_KEY_REGISTRY_ADDRESS = process.env.AA_SESSION_KEY_REGISTRY_ADDRESS || '';
const SMART_ACCOUNT_V2_IMPLEMENTATION = process.env.AA_SMART_ACCOUNT_V2_IMPLEMENTATION || '';

interface UserOperation {
  sender: string; // Smart account address
  nonce: string; // Nonce from EntryPoint
  initCode: string; // Empty for existing accounts
  callData: string; // Encoded function call
  callGasLimit: string; // Gas limit for execution
  verificationGasLimit: string; // Gas for verification
  preVerificationGas: string; // Gas for overhead
  maxFeePerGas: string; // Max fee per gas
  maxPriorityFeePerGas: string; // Max priority fee
  paymasterAndData: string; // Paymaster address + data
  signature: string; // Session key signature
}

export class UserOpBuilderService {
  private provider: ethers.JsonRpcProvider;
  private micropaymentManager: ethers.Interface;
  private smartAccount: ethers.Interface;

  constructor() {
    this.provider = new ethers.JsonRpcProvider(ARBITRUM_SEPOLIA_RPC);

    // MicropaymentManager.chargeX402(uint256 amount, string calldata promptId)
    this.micropaymentManager = new ethers.Interface([
      'function chargeX402(uint256 amount, string calldata promptId)',
    ]);

    // SmartAccountV2.execute(address target, uint256 value, bytes calldata data)
    this.smartAccount = new ethers.Interface([
      'function execute(address target, uint256 value, bytes calldata data) returns (bytes memory)',
    ]);
  }

  /**
   * Get nonce for smart account from EntryPoint
   * @param smartAccountAddress - Smart account address
   * @returns Nonce as BigInt
   */
  async getNonce(smartAccountAddress: string): Promise<bigint> {
    try {
      // Call EntryPoint.getNonce(sender, key)
      const entryPoint = new ethers.Contract(
        ENTRY_POINT_ADDRESS,
        ['function getNonce(address sender, uint192 key) view returns (uint256)'],
        this.provider
      );

      const nonce = await entryPoint.getNonce(smartAccountAddress, 0);
      return nonce;
    } catch (error) {
      console.error('[UserOpBuilder] Failed to get nonce:', error);
      return 0n;
    }
  }

  /**
   * Check if smart account is deployed on-chain
   * @param address - Smart account address
   * @returns True if deployed
   */
  async isAccountDeployed(address: string): Promise<boolean> {
    try {
      const code = await this.provider.getCode(address);
      return code !== '0x' && code !== '0x0';
    } catch (error) {
      console.error('[UserOpBuilder] Failed to check if account deployed:', error);
      return false;
    }
  }

  /**
   * Generate initCode for deploying smart account via SmartAccountFactory
   * Format: factoryAddress + encodedCreateCall
   * @param owner - Owner address for the smart account
   * @param salt - Salt for CREATE2 deterministic address
   * @returns Encoded initCode
   */
  generateInitCode(owner: string, salt: bigint = BigInt(0)): string {
    // SmartAccountFactory.createAccount(owner, salt)
    const factoryInterface = new ethers.Interface([
      'function createAccount(address owner, uint256 salt) returns (address)',
    ]);

    const createCallData = factoryInterface.encodeFunctionData('createAccount', [owner, salt]);

    // initCode = factoryAddress + createAccountCallData
    return SMART_ACCOUNT_FACTORY_ADDRESS + createCallData.slice(2);
  }

  /**
   * Estimate gas limits for UserOperation
   * @returns Gas limits
   */
  async estimateGasLimits(): Promise<{
    callGasLimit: bigint;
    verificationGasLimit: bigint;
    preVerificationGas: bigint;
  }> {
    // Conservative estimates for Arbitrum Sepolia
    return {
      callGasLimit: 100000n, // Gas for CreditManagerV2.deductCredits
      verificationGasLimit: 300000n, // Gas for session key verification
      preVerificationGas: 50000n, // Gas for bundler overhead
    };
  }

  /**
   * Get current gas prices from Arbitrum Sepolia
   * @returns Gas prices
   */
  async getGasPrices(): Promise<{
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
  }> {
    try {
      const feeData = await this.provider.getFeeData();

      return {
        maxFeePerGas: feeData.maxFeePerGas || ethers.parseUnits('0.1', 'gwei'),
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || ethers.parseUnits('0.01', 'gwei'),
      };
    } catch (error) {
      console.error('[UserOpBuilder] Failed to get gas prices:', error);
      // Fallback to default Arbitrum gas prices
      return {
        maxFeePerGas: ethers.parseUnits('0.1', 'gwei'),
        maxPriorityFeePerGas: ethers.parseUnits('0.01', 'gwei'),
      };
    }
  }

  /**
   * Build callData for SmartAccount.execute → MicropaymentManager.chargeX402
   * @param credits - Credits to deduct (X402 tokens)
   * @param promptId - Prompt ID for tracking
   * @returns Encoded callData for SmartAccount.execute
   */
  buildCallData(credits: number, promptId: string): string {
    if (!MICROPAYMENT_MANAGER_ADDRESS) {
      throw new Error('MICROPAYMENT_MANAGER_ADDRESS not configured');
    }

    // Convert credits to X402 wei (assuming 18 decimals)
    const creditsWei = ethers.parseUnits(credits.toString(), 18);

    // Encode: MicropaymentManager.chargeX402(uint256 amount, string calldata promptId)
    const innerCallData = this.micropaymentManager.encodeFunctionData('chargeX402', [
      creditsWei,
      promptId,
    ]);

    // Wrap in SmartAccount.execute(target, value, data)
    const callData = this.smartAccount.encodeFunctionData('execute', [
      MICROPAYMENT_MANAGER_ADDRESS, // target
      0, // value (no ETH sent)
      innerCallData, // data
    ]);

    return callData;
  }

  /**
   * Build paymasterAndData field
   * Format: paymasterAddress (20 bytes) + paymasterVerificationGasLimit (16 bytes) + postOpGasLimit (16 bytes) + paymasterData
   * @returns Encoded paymasterAndData
   */
  buildPaymasterAndData(): string {
    // If paymaster is deployed and configured, use it for gas sponsorship
    if (MICROPAYMENT_PAYMASTER_ADDRESS && MICROPAYMENT_PAYMASTER_ADDRESS !== '') {
      return MICROPAYMENT_PAYMASTER_ADDRESS;
    }

    // Otherwise user pays gas themselves
    return '0x';
  }

  /**
   * Calculate UserOperation hash (for signing)
   * @param userOp - UserOperation
   * @param chainId - Chain ID
   * @returns UserOperation hash
   */
  getUserOpHash(userOp: Omit<UserOperation, 'signature'>, chainId: number): string {
    // Pack UserOperation fields
    const packed = keccak256(
      solidityPacked(
        [
          'address',
          'uint256',
          'bytes32',
          'bytes32',
          'uint256',
          'uint256',
          'uint256',
          'uint256',
          'uint256',
          'bytes32',
        ],
        [
          userOp.sender,
          userOp.nonce,
          keccak256(userOp.initCode),
          keccak256(userOp.callData),
          userOp.callGasLimit,
          userOp.verificationGasLimit,
          userOp.preVerificationGas,
          userOp.maxFeePerGas,
          userOp.maxPriorityFeePerGas,
          keccak256(userOp.paymasterAndData),
        ]
      )
    );

    // Hash with EntryPoint and chainId
    const userOpHash = keccak256(
      solidityPacked(['bytes32', 'address', 'uint256'], [packed, ENTRY_POINT_ADDRESS, chainId])
    );

    return userOpHash;
  }

  /**
   * Sign UserOperation with session key
   * @param userOpHash - UserOperation hash
   * @param sessionWallet - Session key wallet
   * @returns Signature
   */
  async signUserOp(userOpHash: string, sessionWallet: Wallet): Promise<string> {
    const signature = await sessionWallet.signMessage(ethers.getBytes(userOpHash));
    return signature;
  }

  /**
   * Build complete UserOperation
   * @param smartAccountAddress - User's smart account address
   * @param credits - Credits to deduct
   * @param promptId - Prompt ID for tracking
   * @param sessionKeyId - Session key ID from database
   * @param ownerAddress - Owner address (needed for initCode if account not deployed)
   * @returns Complete UserOperation ready for submission
   */
  async buildUserOperation(
    smartAccountAddress: string,
    credits: number,
    promptId: string,
    sessionKeyId: string,
    ownerAddress?: string
  ): Promise<UserOperation> {
    // 1. Get nonce
    const nonce = await this.getNonce(smartAccountAddress);

    // 2. Check if account is deployed and generate initCode if needed
    const isDeployed = await this.isAccountDeployed(smartAccountAddress);
    let initCode = '0x';

    if (!isDeployed) {
      if (!ownerAddress) {
        throw new Error('Owner address required for deploying smart account');
      }
      console.log(
        '[UserOpBuilder] Account not deployed, generating initCode for:',
        smartAccountAddress
      );
      initCode = this.generateInitCode(ownerAddress);
    }

    // 3. Build callData (SmartAccount.execute → MicropaymentManager.chargeX402)
    const callData = this.buildCallData(credits, promptId);

    // 4. Estimate gas
    const gasLimits = await this.estimateGasLimits();
    const gasPrices = await this.getGasPrices();

    // 5. Build paymaster data
    const paymasterAndData = this.buildPaymasterAndData();

    // 6. Build UserOp (without signature)
    const userOpWithoutSig: Omit<UserOperation, 'signature'> = {
      sender: smartAccountAddress,
      nonce: `0x${nonce.toString(16)}`,
      initCode, // Will deploy account on first use if not deployed
      callData,
      callGasLimit: `0x${gasLimits.callGasLimit.toString(16)}`,
      verificationGasLimit: `0x${gasLimits.verificationGasLimit.toString(16)}`,
      preVerificationGas: `0x${gasLimits.preVerificationGas.toString(16)}`,
      maxFeePerGas: `0x${gasPrices.maxFeePerGas.toString(16)}`,
      maxPriorityFeePerGas: `0x${gasPrices.maxPriorityFeePerGas.toString(16)}`,
      paymasterAndData,
    };

    // 7. Calculate UserOp hash
    const chainId = 421614; // Arbitrum Sepolia
    const userOpHash = this.getUserOpHash(userOpWithoutSig, chainId);

    // 7. Get session key wallet and sign
    const sessionWallet = await SessionKeyService.getSessionKeyWallet(sessionKeyId);

    if (!sessionWallet) {
      throw new Error('Session key not found or expired');
    }

    const signature = await this.signUserOp(userOpHash, sessionWallet);

    // 8. Complete UserOperation
    const userOp: UserOperation = {
      ...userOpWithoutSig,
      signature,
    };

    console.log('[UserOpBuilder] Built UserOperation:', {
      sender: userOp.sender,
      nonce: userOp.nonce,
      credits,
      promptId,
      userOpHash,
    });

    return userOp;
  }

  /**
   * Calculate UserOperation hash after building
   * @param userOp - Complete UserOperation
   * @returns UserOperation hash
   */
  calculateUserOpHash(userOp: UserOperation): string {
    const chainId = 421614; // Arbitrum Sepolia
    return this.getUserOpHash(userOp, chainId);
  }
}
