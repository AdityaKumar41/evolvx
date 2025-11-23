#!/usr/bin/env node

/**
 * Authorize Verifier Wallet on MilestoneManager Contract
 *
 * This script authorizes the generated verifier wallet to approve payouts
 * on the MilestoneManager contract.
 *
 * Prerequisites:
 * - DEPLOYER_PRIVATE_KEY set in .env (the address that deployed MilestoneManager)
 * - VERIFIER_PRIVATE_KEY set in .env (generated via generate-verifier-wallet.js)
 * - Deployer wallet must have Arbitrum Sepolia ETH for gas
 *
 * Usage:
 *   node scripts/authorize-verifier.js
 */

require('dotenv').config();
const { ethers } = require('ethers');

// Contract addresses
const MILESTONE_MANAGER_ADDRESS = process.env.AA_MILESTONE_MANAGER_ADDRESS;
const RPC_URL = process.env.ARBITRUM_SEPOLIA_RPC || 'https://sepolia-rollup.arbitrum.io/rpc';

// Minimal ABI for addVerifier function
const MILESTONE_MANAGER_ABI = [
  'function addVerifier(address verifier) external',
  'function isVerifier(address verifier) external view returns (bool)',
  'function owner() external view returns (address)',
];

async function main() {
  console.log('\n🔐 Authorizing Verifier on MilestoneManager...\n');

  // Validate environment variables
  if (!process.env.DEPLOYER_PRIVATE_KEY) {
    console.error('❌ Error: DEPLOYER_PRIVATE_KEY not set in .env');
    console.log('💡 This should be the private key of the address that deployed the contracts');
    process.exit(1);
  }

  if (!process.env.VERIFIER_PRIVATE_KEY) {
    console.error('❌ Error: VERIFIER_PRIVATE_KEY not set in .env');
    console.log('💡 Run: node scripts/generate-verifier-wallet.js first');
    process.exit(1);
  }

  if (!MILESTONE_MANAGER_ADDRESS) {
    console.error('❌ Error: AA_MILESTONE_MANAGER_ADDRESS not set in .env');
    process.exit(1);
  }

  try {
    // Setup provider and signer
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const deployerWallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
    const verifierWallet = new ethers.Wallet(process.env.VERIFIER_PRIVATE_KEY, provider);

    console.log('📋 Configuration:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Network:           Arbitrum Sepolia`);
    console.log(`RPC URL:           ${RPC_URL}`);
    console.log(`MilestoneManager:  ${MILESTONE_MANAGER_ADDRESS}`);
    console.log(`Deployer:          ${deployerWallet.address}`);
    console.log(`Verifier:          ${verifierWallet.address}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Check deployer balance
    const deployerBalance = await provider.getBalance(deployerWallet.address);
    console.log(`💰 Deployer Balance: ${ethers.formatEther(deployerBalance)} ETH`);

    if (deployerBalance === 0n) {
      console.error('\n❌ Error: Deployer wallet has no ETH for gas');
      console.log(
        '💡 Get Arbitrum Sepolia ETH from: https://faucet.quicknode.com/arbitrum/sepolia'
      );
      process.exit(1);
    }

    // Connect to contract
    const milestoneManager = new ethers.Contract(
      MILESTONE_MANAGER_ADDRESS,
      MILESTONE_MANAGER_ABI,
      deployerWallet
    );

    // Check contract owner
    const owner = await milestoneManager.owner();
    console.log(`📄 Contract Owner:   ${owner}\n`);

    if (owner.toLowerCase() !== deployerWallet.address.toLowerCase()) {
      console.error('❌ Error: Deployer wallet is not the contract owner');
      console.log(`   Expected: ${deployerWallet.address}`);
      console.log(`   Actual:   ${owner}`);
      process.exit(1);
    }

    // Check if already authorized
    const isAlreadyVerifier = await milestoneManager.isVerifier(verifierWallet.address);

    if (isAlreadyVerifier) {
      console.log('✅ Verifier is already authorized!');
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🎉 No action needed - verifier is ready to approve payouts');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      return;
    }

    // Authorize verifier
    console.log('📤 Sending authorization transaction...');
    const tx = await milestoneManager.addVerifier(verifierWallet.address);
    console.log(`   TX Hash: ${tx.hash}`);
    console.log(`   Arbiscan: https://sepolia.arbiscan.io/tx/${tx.hash}\n`);

    console.log('⏳ Waiting for confirmation...');
    const receipt = await tx.wait();

    if (receipt.status === 1) {
      console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}\n`);

      // Verify authorization
      const isVerifierNow = await milestoneManager.isVerifier(verifierWallet.address);

      if (isVerifierNow) {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🎉 SUCCESS! Verifier authorized on MilestoneManager');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`\n✅ ${verifierWallet.address} can now approve payouts\n`);
        console.log('Next steps:');
        console.log('  1. Fund verifier wallet with small amount of ETH for gas');
        console.log('  2. Backend can now use MilestonePayoutService.approvePayout()');
        console.log('  3. Test with a PR verification → payout flow\n');
      } else {
        console.error('❌ Verification failed - verifier not showing as authorized');
        process.exit(1);
      }
    } else {
      console.error('❌ Transaction failed');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Error authorizing verifier:');
    console.error(error.message);

    if (error.code === 'CALL_EXCEPTION') {
      console.log('\n💡 Possible issues:');
      console.log('  - Contract may not be deployed at this address');
      console.log('  - RPC URL may be incorrect');
      console.log('  - Network mismatch');
    } else if (error.code === 'INSUFFICIENT_FUNDS') {
      console.log('\n💡 Deployer wallet needs more ETH for gas');
      console.log('   Get funds: https://faucet.quicknode.com/arbitrum/sepolia');
    }

    process.exit(1);
  }
}

main().catch(console.error);
