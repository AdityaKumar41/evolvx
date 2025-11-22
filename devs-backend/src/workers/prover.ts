import { logger } from '../utils/logger';
import { prisma } from '../lib/prisma';
import { uploadToS3 } from '../lib/s3';
import { publishEvent, KAFKA_TOPICS } from '../lib/kafka';
import { blockchainService } from '../services/blockchain.service';
import crypto from 'crypto';

// Simplified prover - in production, use snarkjs or other ZK proving library
class ProverWorker {
  async start() {
    logger.info('🔐 Prover Worker starting...');

    // Subscribe to proof generation requests
    // await subscribeToTopic(KAFKA_TOPICS.PROOF_GENERATION_REQUESTED, async (payload) => {
    //   const message = JSON.parse(payload.message.value?.toString() || '{}');
    //   await this.generateProof(message);
    // });

    logger.info('✅ Prover Worker ready');
  }

  async generateProof(contributionId: string) {
    try {
      logger.info(`Generating proof for contribution: ${contributionId}`);

      const contribution = await prisma.contribution.findUnique({
        where: { id: contributionId },
        include: {
          subMilestone: {
            include: {
              milestone: {
                include: {
                  project: true,
                },
              },
            },
          },
          contributor: true,
        },
      });

      if (!contribution) {
        throw new Error('Contribution not found');
      }

      // Create job
      const job = await prisma.job.create({
        data: {
          type: 'proof_generation',
          status: 'RUNNING',
          payload: {
            contributionId,
          },
        },
      });

      // Generate proof data (simplified - in production, use actual ZK circuits)
      const proofData = await this.buildProof(contribution);

      // Store proof to S3
      const proofKey = `proofs/${contribution.id}/proof.json`;
      const proofUrl = await uploadToS3(proofKey, JSON.stringify(proofData), 'application/json');

      // Create proof record
      const proof = await prisma.proof.create({
        data: {
          contributionId: contribution.id,
          proofBytesUrl: proofUrl,
          publicSignals: proofData.publicSignals,
          circuitVersion: '1.0.0',
        },
      });

      // Update job
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: 'SUCCEEDED',
          result: { proofId: proof.id },
          completedAt: new Date(),
        },
      });

      // Publish proof generated event
      await publishEvent(KAFKA_TOPICS.PROOF_GENERATED, {
        proofId: proof.id,
        contributionId: contribution.id,
        timestamp: new Date().toISOString(),
      });

      // Submit proof to blockchain
      await this.submitProofToChain(proof.id);

      logger.info(`✅ Proof generated: ${proof.id}`);
    } catch (error) {
      logger.error('Failed to generate proof:', error);
      throw error;
    }
  }

  private async buildProof(contribution: any) {
    // Simplified proof generation
    // In production, this would:
    // 1. Build witness from contribution data
    // 2. Run snarkjs or circom prover
    // 3. Generate PLONK/Groth16 proof

    const projectId = contribution.subMilestone.milestone.project.id;
    const subMilestoneId = contribution.subMilestone.id;
    const contributorAddr = contribution.contributor.walletAddress || '0x0';
    const amount = contribution.amountPaid.toString();
    const merkleRoot = contribution.subMilestone.merkleRoot || Buffer.from('0'.repeat(64), 'hex');

    // Generate nullifier (poseidon hash in production)
    const nullifier = crypto
      .createHash('sha256')
      .update(`${projectId}${subMilestoneId}${contributorAddr}${amount}`)
      .digest();

    // Update contribution with nullifier
    await prisma.contribution.update({
      where: { id: contribution.id },
      data: { nullifier },
    });

    return {
      proof: {
        pi_a: ['0', '0'],
        pi_b: [
          ['0', '0'],
          ['0', '0'],
        ],
        pi_c: ['0', '0'],
      },
      publicSignals: [
        projectId,
        subMilestoneId,
        contributorAddr,
        amount,
        merkleRoot.toString('hex'),
        nullifier.toString('hex'),
      ],
    };
  }

  private async submitProofToChain(proofId: string) {
    try {
      const proof = await prisma.proof.findUnique({
        where: { id: proofId },
      });

      if (!proof) {
        throw new Error('Proof not found');
      }

      // Submit to blockchain
      const result = await blockchainService.submitProof(
        proof.proofBytesUrl, // In production, parse and format proof correctly
        proof.publicSignals as string[]
      );

      // Update proof with tx hash
      await prisma.proof.update({
        where: { id: proofId },
        data: {
          verifiedOnChain: result.verified,
          txHash: result.txHash,
        },
      });

      // Publish event
      await publishEvent(KAFKA_TOPICS.PROOF_VERIFIED, {
        proofId,
        txHash: result.txHash,
        verified: result.verified,
        timestamp: new Date().toISOString(),
      });

      logger.info(`✅ Proof submitted to chain: ${result.txHash}`);
    } catch (error) {
      logger.error('Failed to submit proof to chain:', error);
      throw error;
    }
  }
}

// Start worker if run directly
if (require.main === module) {
  const worker = new ProverWorker();
  worker.start().catch((error) => {
    logger.error('Failed to start Prover Worker:', error);
    process.exit(1);
  });
}

export default ProverWorker;
