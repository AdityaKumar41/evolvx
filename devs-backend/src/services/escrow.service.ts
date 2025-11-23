import { ethers } from 'ethers';
import { logger } from '../utils/logger';
import { prisma } from '../lib/prisma';
import { MerkleTreeGenerator } from '../utils/merkle';
import { config } from '../config';

// Import ABIs
import EscrowAndYieldABI from '../../../contracts/abi/EscrowAndYield.json';
import MilestoneManagerABI from '../../../contracts/abi/MilestoneManager.json';
import MerkleCommitStorageABI from '../../../contracts/abi/MerkleCommitStorage.json';

// Contract addresses from config
const DEVSPONSOR_DEPLOYMENT = {
  MilestoneManager: config.blockchain.aa.milestoneManager,
  EscrowAndYield: config.blockchain.aa.escrowAndYield,
  MerkleCommitStorage: config.blockchain.aa.merkleCommitStorage,
  WPOL: config.blockchain.aa.wpolToken,
};

export interface EscrowDepositResult {
  txHash: string;
  escrowPoolId: string;
  totalDeposited: string;
}

export interface PaymentReleaseResult {
  txHash: string;
  amountReleased: string;
  contributor: string;
}

export class EscrowService {
  private provider: ethers.JsonRpcProvider;
  private wallet?: ethers.Wallet;
  private escrowContract?: ethers.Contract;
  private milestoneManager?: ethers.Contract;
  private merkleStorage?: ethers.Contract;

  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);

    if (config.blockchain.relayerPrivateKey) {
      this.wallet = new ethers.Wallet(config.blockchain.relayerPrivateKey, this.provider);

      this.escrowContract = new ethers.Contract(
        DEVSPONSOR_DEPLOYMENT.EscrowAndYield,
        EscrowAndYieldABI.abi,
        this.wallet
      );

      this.milestoneManager = new ethers.Contract(
        DEVSPONSOR_DEPLOYMENT.MilestoneManager,
        MilestoneManagerABI.abi,
        this.wallet
      );

      this.merkleStorage = new ethers.Contract(
        DEVSPONSOR_DEPLOYMENT.MerkleCommitStorage,
        MerkleCommitStorageABI.abi,
        this.wallet
      );
    }
  }

  /**
   * Deposit funds to escrow for project
   * @param projectId Project ID
   * @param milestoneId Optional milestone ID to link escrow to specific milestone
   * @param amount Amount in ETH/tokens
   * @param tokenAddress Token address (defaults to WPOL)
   * @param enableYield Whether to enable Aave yield farming
   * @param sponsorPrivateKey Sponsor's private key for signing
   */
  async depositToEscrow(
    projectId: string,
    milestoneId: string | null,
    amount: string,
    tokenAddress: string | undefined,
    enableYield: boolean,
    sponsorPrivateKey: string
  ): Promise<EscrowDepositResult> {
    try {
      logger.info(`Depositing ${amount} to escrow for project ${projectId}, yield: ${enableYield}`);

      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          milestones: {
            where: milestoneId ? { id: milestoneId } : undefined,
            include: {
              subMilestones: true,
            },
          },
        },
      });

      if (!project) {
        throw new Error('Project not found');
      }

      // Use project token or default to WPOL
      const token = tokenAddress || project.tokenAddress || DEVSPONSOR_DEPLOYMENT.WPOL;

      // Get contract with sponsor signer
      const sponsorWallet = new ethers.Wallet(sponsorPrivateKey, this.provider);
      const escrowWithSigner = new ethers.Contract(
        DEVSPONSOR_DEPLOYMENT.EscrowAndYield,
        EscrowAndYieldABI.abi,
        sponsorWallet
      );

      // Create escrow pool on-chain
      const tx = await escrowWithSigner.createEscrowPool(
        projectId,
        token,
        ethers.parseEther(amount),
        enableYield,
        {
          gasLimit: 300000,
        }
      );

      const receipt = await tx.wait();
      logger.info(`Escrow pool created: ${receipt.hash}`);

      // Get escrow pool ID from event
      const createEvent = receipt.logs
        .map((log: any) => {
          try {
            return escrowWithSigner.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((event: any) => event && event.name === 'EscrowPoolCreated');

      const escrowPoolId = createEvent ? createEvent.args.poolId : projectId;

      // Create escrow pool record in database
      const escrowPool = await prisma.escrowPool.create({
        data: {
          projectId,
          milestoneId: milestoneId || undefined,
          balance: amount,
          totalAmount: amount,
          lockedAmount: amount,
          availableAmount: '0',
          yieldGenerated: '0',
          tokenAddress: token,
          status: 'ACTIVE',
        },
      });

      // Update project with escrow info
      await prisma.project.update({
        where: { id: projectId },
        data: {
          status: 'ACTIVE',
          onchainContractAddress: DEVSPONSOR_DEPLOYMENT.EscrowAndYield,
          escrowTxHash: receipt.hash,
          escrowPoolId: escrowPoolId,
          isEscrowFunded: true,
          yieldEnabled: enableYield,
        },
      });

      return {
        txHash: receipt.hash,
        escrowPoolId: escrowPool.id,
        totalDeposited: amount,
      };
    } catch (error) {
      logger.error('Error depositing to escrow:', error);
      throw error;
    }
  }

  /**
   * Submit project to onchain with Merkle tree
   */
  async submitProjectOnchain(projectId: string): Promise<{
    txHash: string;
    merkleRoot: string;
    projectHash: string;
  }> {
    try {
      if (!this.milestoneManager || !this.merkleStorage) {
        throw new Error('Contracts not initialized');
      }

      logger.info(`Submitting project ${projectId} to onchain`);

      // Fetch project with all milestones
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          milestones: {
            include: {
              subMilestones: true,
            },
          },
        },
      });

      if (!project) {
        throw new Error('Project not found');
      }

      if (project.status !== 'DRAFT') {
        throw new Error('Only DRAFT projects can be submitted onchain');
      }

      // Generate project hash
      const projectHash = ethers.keccak256(
        ethers.toUtf8Bytes(`${project.id}-${project.title}-${Date.now()}`)
      );

      // Generate Merkle tree from milestones
      const merkleTree = MerkleTreeGenerator.generateProjectMerkleTree(
        project.milestones.map((m) => ({
          id: m.id,
          subMilestones: m.subMilestones.map((sm) => ({
            id: sm.id,
            checkpointAmount: sm.checkpointAmount.toString(),
            assignedTo: sm.assignedTo,
          })),
        }))
      );

      logger.info(`Generated Merkle root: ${merkleTree.root}`);

      // Step 1: Create project onchain
      const createProjectTx = await this.milestoneManager.createProject(projectHash, {
        gasLimit: 150000,
      });
      await createProjectTx.wait();

      logger.info(`Project created onchain: ${projectHash}`);

      // Step 2: Submit Merkle root
      const submitMerkleTx = await this.merkleStorage.submitMerkleRoot(
        projectHash,
        merkleTree.root,
        {
          gasLimit: 100000,
        }
      );
      const merkleReceipt = await submitMerkleTx.wait();

      logger.info(`Merkle root submitted: ${merkleReceipt.hash}`);

      // Store Merkle proofs in database for each submilestone
      for (const milestone of project.milestones) {
        for (const subMilestone of milestone.subMilestones) {
          if (subMilestone.assignedTo) {
            const leaf = MerkleTreeGenerator.hashProof({
              milestoneId: subMilestone.id,
              contributorAddress: subMilestone.assignedTo,
              amount: subMilestone.checkpointAmount.toString(),
              metadata: JSON.stringify({
                milestoneId: milestone.id,
                subMilestoneId: subMilestone.id,
              }),
            });

            const proof = merkleTree.proofs.get(leaf);

            await prisma.subMilestone.update({
              where: { id: subMilestone.id },
              data: {
                merkleRoot: Buffer.from(merkleTree.root.slice(2), 'hex'),
                metadata: {
                  ...(typeof subMilestone.metadata === 'object' && subMilestone.metadata !== null
                    ? subMilestone.metadata
                    : {}),
                  merkleProof: proof,
                  projectHash,
                },
              },
            });
          }
        }
      }

      return {
        txHash: merkleReceipt.hash,
        merkleRoot: merkleTree.root,
        projectHash,
      };
    } catch (error) {
      logger.error('Error submitting project onchain:', error);
      throw error;
    }
  }

  /**
   * Release payment from escrow to contributor
   */
  async releasePayment(
    contributionId: string,
    contributorAddress: string
  ): Promise<PaymentReleaseResult> {
    try {
      if (!this.escrowContract) {
        throw new Error('Escrow contract not initialized');
      }

      logger.info(`Releasing payment for contribution ${contributionId}`);

      const contribution = await prisma.contribution.findUnique({
        where: { id: contributionId },
        include: {
          subMilestone: {
            include: {
              milestone: {
                include: {
                  project: {
                    include: {
                      escrowPools: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!contribution || !contribution.subMilestone) {
        throw new Error('Contribution or submilestone not found');
      }

      const { subMilestone } = contribution;
      const project = subMilestone.milestone.project;

      if (!project.onchainContractAddress) {
        throw new Error('Project not submitted onchain');
      }

      const escrowPool = project.escrowPools[0];
      if (!escrowPool) {
        throw new Error('No escrow pool found for project');
      }

      // Get Merkle proof from metadata
      const metadata =
        typeof subMilestone.metadata === 'object' && subMilestone.metadata !== null
          ? (subMilestone.metadata as Record<string, unknown>)
          : {};
      const proof = (metadata?.merkleProof as string[]) || [];
      const projectHash = metadata?.projectHash as string;

      if (!projectHash || !proof || proof.length === 0) {
        throw new Error('Merkle proof not found. Project may not be submitted onchain.');
      }

      const amount = ethers.parseEther(subMilestone.checkpointAmount.toString());

      // Release payment from escrow
      const tx = await this.escrowContract.releasePayment(
        projectHash,
        contributorAddress,
        amount,
        proof,
        {
          gasLimit: 250000,
        }
      );

      const receipt = await tx.wait();
      logger.info(`Payment released: ${receipt.hash}`);

      // Update escrow pool
      await prisma.escrowPool.update({
        where: { id: escrowPool.id },
        data: {
          availableAmount: {
            increment: subMilestone.checkpointAmount,
          },
          balance: {
            decrement: subMilestone.checkpointAmount,
          },
        },
      });

      return {
        txHash: receipt.hash,
        amountReleased: subMilestone.checkpointAmount.toString(),
        contributor: contributorAddress,
      };
    } catch (error) {
      logger.error('Error releasing payment:', error);
      throw error;
    }
  }

  /**
   * Enable yield generation for project
   */
  async enableYield(projectId: string): Promise<string> {
    try {
      if (!this.escrowContract) {
        throw new Error('Escrow contract not initialized');
      }

      logger.info(`Enabling yield for project ${projectId}`);

      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { onchainContractAddress: true },
      });

      if (!project?.onchainContractAddress) {
        throw new Error('Project not submitted onchain');
      }

      // Enable yield (requires Aave/Compound integration on contract side)
      const tx = await this.escrowContract.enableYield(projectId, {
        gasLimit: 200000,
      });

      const receipt = await tx.wait();

      // Update project payment mode
      await prisma.project.update({
        where: { id: projectId },
        data: { paymentMode: 'YIELD' },
      });

      logger.info(`Yield enabled for project ${projectId}`);

      return receipt.hash;
    } catch (error) {
      logger.error('Error enabling yield:', error);
      throw error;
    }
  }

  /**
   * Get escrow balance for project
   */
  async getEscrowBalance(projectId: string): Promise<{
    totalAmount: string;
    lockedAmount: string;
    availableAmount: string;
    yieldGenerated: string;
  }> {
    try {
      const escrowPool = await prisma.escrowPool.findFirst({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
      });

      if (!escrowPool) {
        return {
          totalAmount: '0',
          lockedAmount: '0',
          availableAmount: '0',
          yieldGenerated: '0',
        };
      }

      return {
        totalAmount: escrowPool.totalAmount.toString(),
        lockedAmount: escrowPool.lockedAmount.toString(),
        availableAmount: escrowPool.availableAmount.toString(),
        yieldGenerated: escrowPool.yieldGenerated.toString(),
      };
    } catch (error) {
      logger.error('Error getting escrow balance:', error);
      throw error;
    }
  }
}

export const escrowService = new EscrowService();
