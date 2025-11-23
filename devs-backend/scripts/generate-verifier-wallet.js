#!/usr/bin/env node

/**
 * Generate Verifier Wallet for MilestoneManager
 *
 * This script generates a new wallet to be used as the verifier
 * for approving contributor payouts in the MilestoneManager contract.
 *
 * Usage:
 *   node generate-verifier-wallet.js
 *
 * Output:
 *   - Verifier address
 *   - Verifier private key (add to backend .env as VERIFIER_PRIVATE_KEY)
 *   - Command to authorize verifier on MilestoneManager contract
 */

const { ethers } = require('ethers');

// Contract addresses
const MILESTONE_MANAGER_ADDRESS = '0x1D33EEF773b93a1d02c00676909F6be3fA5fC020';
const RPC_URL = 'https://sepolia-rollup.arbitrum.io/rpc';

async function main() {
  console.log('\n🔐 Generating Verifier Wallet...\n');

  // Generate random wallet
  const wallet = ethers.Wallet.createRandom();

  console.log('✅ Verifier wallet generated!\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 WALLET DETAILS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Address:     ${wallet.address}`);
  console.log(`Private Key: ${wallet.privateKey}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('📝 SETUP INSTRUCTIONS:\n');
  console.log('1. Add to backend .env file:');
  console.log(`   VERIFIER_PRIVATE_KEY="${wallet.privateKey}"\n`);

  console.log('2. Fund the verifier wallet with Arbitrum Sepolia ETH:');
  console.log(`   Address: ${wallet.address}`);
  console.log('   Faucet: https://faucet.quicknode.com/arbitrum/sepolia\n');

  console.log('3. Authorize verifier on MilestoneManager contract:');
  console.log('\n   Option A - Using cast (Foundry):\n');
  console.log(`   cast send ${MILESTONE_MANAGER_ADDRESS} \\`);
  console.log(`     "addVerifier(address)" \\`);
  console.log(`     ${wallet.address} \\`);
  console.log(`     --rpc-url ${RPC_URL} \\`);
  console.log(`     --private-key <DEPLOYER_PRIVATE_KEY>\n`);

  console.log('   Option B - Using Node.js script:\n');
  console.log('   See: scripts/authorize-verifier.js\n');

  console.log('4. Verify verifier is authorized:');
  console.log('\n   cast call', MILESTONE_MANAGER_ADDRESS, '\\');
  console.log(`     "isVerifier(address)" ${wallet.address} \\`);
  console.log(`     --rpc-url ${RPC_URL}\n`);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('⚠️  SECURITY WARNING');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔒 Keep the private key secure and NEVER commit it to git!');
  console.log('🔒 Only add it to .env file (which should be in .gitignore)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Check if deployer key is set
  if (process.env.DEPLOYER_PRIVATE_KEY) {
    console.log('📤 Attempting to authorize verifier on-chain...\n');

    try {
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const deployer = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);

      const MilestoneManagerABI = [
        'function addVerifier(address _verifier) external',
        'function isVerifier(address _verifier) external view returns (bool)',
      ];

      const milestoneManager = new ethers.Contract(
        MILESTONE_MANAGER_ADDRESS,
        MilestoneManagerABI,
        deployer
      );

      console.log(`Calling addVerifier(${wallet.address})...`);
      const tx = await milestoneManager.addVerifier(wallet.address);
      console.log(`Transaction sent: ${tx.hash}`);

      const receipt = await tx.wait();
      console.log(`✅ Verifier authorized! Gas used: ${receipt.gasUsed.toString()}\n`);

      // Verify
      const isVerifier = await milestoneManager.isVerifier(wallet.address);
      console.log(`Verification check: ${isVerifier ? '✅ Confirmed' : '❌ Failed'}\n`);
    } catch (error) {
      console.error('❌ Failed to authorize verifier:', error.message);
      console.log('\nPlease authorize manually using the commands above.\n');
    }
  } else {
    console.log('ℹ️  Set DEPLOYER_PRIVATE_KEY environment variable to auto-authorize\n');
  }
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
