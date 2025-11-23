#!/usr/bin/env node

/**
 * Check Verifier Authorization Status
 *
 * This script checks if the verifier wallet is authorized on the MilestoneManager contract
 * and provides instructions for authorization if needed.
 */

require('dotenv').config();
const { ethers } = require('ethers');

const MILESTONE_MANAGER_ADDRESS = process.env.AA_MILESTONE_MANAGER_ADDRESS;
const RPC_URL = process.env.ARBITRUM_SEPOLIA_RPC || 'https://sepolia-rollup.arbitrum.io/rpc';
const VERIFIER_PRIVATE_KEY = process.env.VERIFIER_PRIVATE_KEY;

const MILESTONE_MANAGER_ABI = [
  'function isVerifier(address verifier) external view returns (bool)',
  'function owner() external view returns (address)',
];

async function main() {
  console.log('\n🔍 Checking Verifier Authorization Status...\n');

  if (!MILESTONE_MANAGER_ADDRESS) {
    console.error('❌ Error: AA_MILESTONE_MANAGER_ADDRESS not set in .env');
    process.exit(1);
  }

  if (!VERIFIER_PRIVATE_KEY) {
    console.error('❌ Error: VERIFIER_PRIVATE_KEY not set in .env');
    console.log('💡 Run: node scripts/generate-verifier-wallet.js first');
    process.exit(1);
  }

  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const verifierWallet = new ethers.Wallet(VERIFIER_PRIVATE_KEY, provider);
    const milestoneManager = new ethers.Contract(
      MILESTONE_MANAGER_ADDRESS,
      MILESTONE_MANAGER_ABI,
      provider
    );

    console.log('📋 Configuration:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`MilestoneManager:  ${MILESTONE_MANAGER_ADDRESS}`);
    console.log(`Verifier Address:  ${verifierWallet.address}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Check if verifier is authorized
    const isAuthorized = await milestoneManager.isVerifier(verifierWallet.address);

    if (isAuthorized) {
      console.log('✅ VERIFIER IS AUTHORIZED! ✅\n');
      console.log('🎉 The verifier wallet is ready to approve payouts.\n');

      // Check balance
      const balance = await provider.getBalance(verifierWallet.address);
      console.log(`💰 Verifier Balance: ${ethers.formatEther(balance)} ETH`);

      if (balance === 0n) {
        console.log('\n⚠️  Warning: Verifier has no ETH for gas fees');
        console.log('💡 Fund verifier wallet: https://faucet.quicknode.com/arbitrum/sepolia');
      } else {
        console.log('✅ Verifier has ETH for gas fees\n');
      }

      return;
    }

    console.log('❌ VERIFIER IS NOT AUTHORIZED\n');
    console.log('The verifier wallet needs to be authorized on the MilestoneManager contract.\n');

    // Get contract owner
    const owner = await milestoneManager.owner();
    console.log(`📄 Contract Owner: ${owner}\n`);

    // Check if DEPLOYER_PRIVATE_KEY is set
    if (process.env.DEPLOYER_PRIVATE_KEY) {
      console.log('✅ DEPLOYER_PRIVATE_KEY found in .env\n');
      console.log('🚀 Run authorization script:');
      console.log('   node scripts/authorize-verifier.js\n');
    } else {
      console.log('⚠️  DEPLOYER_PRIVATE_KEY not set in .env\n');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📝 MANUAL AUTHORIZATION OPTIONS:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      console.log('Option 1 - Automated (Recommended):');
      console.log('  1. Get the deployer private key (wallet that deployed contracts)');
      console.log('  2. Add to .env: DEPLOYER_PRIVATE_KEY="0x..."');
      console.log('  3. Run: node scripts/authorize-verifier.js\n');

      console.log('Option 2 - Using Foundry Cast:');
      console.log(`  cast send ${MILESTONE_MANAGER_ADDRESS} \\`);
      console.log(`    "addVerifier(address)" \\`);
      console.log(`    ${verifierWallet.address} \\`);
      console.log(`    --rpc-url ${RPC_URL} \\`);
      console.log(`    --private-key <DEPLOYER_PRIVATE_KEY>\n`);

      console.log('Option 3 - Using Hardhat/Ethers Script:');
      console.log('  // In your deployment environment:');
      console.log('  const milestone = await ethers.getContractAt(');
      console.log(`    "MilestoneManager",`);
      console.log(`    "${MILESTONE_MANAGER_ADDRESS}"`);
      console.log('  );');
      console.log(`  await milestone.addVerifier("${verifierWallet.address}");`);
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    }
  } catch (error) {
    console.error('\n❌ Error checking authorization:');
    console.error(error.message);
    process.exit(1);
  }
}

main().catch(console.error);
