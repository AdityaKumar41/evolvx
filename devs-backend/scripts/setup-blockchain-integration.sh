#!/bin/bash

# DevSponsor Blockchain Integration - Setup Script
# This script completes the remaining setup steps for blockchain integration

set -e

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 DevSponsor Blockchain Integration Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Change to backend directory
cd "$(dirname "$0")/.."

# Check if .env exists
if [ ! -f .env ]; then
  echo "❌ Error: .env file not found"
  echo "💡 Copy .env.example to .env and configure it first"
  exit 1
fi

# Source environment variables
source .env

echo "📋 Checking prerequisites..."
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "❌ Node.js not found. Please install Node.js first."
  exit 1
fi
echo "✅ Node.js: $(node --version)"

# Check pnpm
if ! command -v pnpm &> /dev/null; then
  echo "❌ pnpm not found. Install with: npm install -g pnpm"
  exit 1
fi
echo "✅ pnpm: $(pnpm --version)"

# Check Docker
if ! command -v docker &> /dev/null; then
  echo "❌ Docker not found. Please install Docker first."
  exit 1
fi
echo "✅ Docker: $(docker --version)"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 1: Install Dependencies"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

pnpm install

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 2: Start Database"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Start only PostgreSQL
docker-compose up -d postgres

echo "⏳ Waiting for PostgreSQL to be ready..."
sleep 5

# Check if PostgreSQL is ready
until docker-compose exec -T postgres pg_isready -U devsponsor &> /dev/null; do
  echo "   Waiting for database..."
  sleep 2
done

echo "✅ PostgreSQL is ready"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 3: Run Database Migration"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

npx prisma migrate dev --name add_merkle_and_escrow_blockchain_fields

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 4: Check Verifier Wallet"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if VERIFIER_PRIVATE_KEY is set
if [ -z "$VERIFIER_PRIVATE_KEY" ]; then
  echo "⚠️  VERIFIER_PRIVATE_KEY not set in .env"
  echo ""
  read -p "Generate verifier wallet now? (y/n) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    node scripts/generate-verifier-wallet.js
    echo ""
    echo "⚠️  Please add VERIFIER_PRIVATE_KEY to .env and run this script again"
    exit 0
  fi
else
  echo "✅ VERIFIER_PRIVATE_KEY is set"
  
  # Extract verifier address from private key
  VERIFIER_ADDRESS=$(node -e "
    const { ethers } = require('ethers');
    const wallet = new ethers.Wallet('$VERIFIER_PRIVATE_KEY');
    console.log(wallet.address);
  " 2>/dev/null || echo "")
  
  if [ -n "$VERIFIER_ADDRESS" ]; then
    echo "   Verifier Address: $VERIFIER_ADDRESS"
  fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 5: Authorize Verifier (Optional)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ -z "$DEPLOYER_PRIVATE_KEY" ]; then
  echo "⚠️  DEPLOYER_PRIVATE_KEY not set - cannot auto-authorize"
  echo ""
  echo "To authorize verifier manually:"
  echo "1. Set DEPLOYER_PRIVATE_KEY in .env (the wallet that deployed contracts)"
  echo "2. Run: node scripts/authorize-verifier.js"
  echo ""
  echo "Or use Foundry cast command (see FRONTEND_INTEGRATION_COMPLETE.md)"
else
  echo "📋 DEPLOYER_PRIVATE_KEY found"
  echo ""
  read -p "Authorize verifier on MilestoneManager now? (y/n) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    node scripts/authorize-verifier.js
  else
    echo "⏭️  Skipped - run manually: node scripts/authorize-verifier.js"
  fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Setup Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🎯 Next Steps:"
echo ""
echo "1. Start backend server:"
echo "   pnpm dev"
echo ""
echo "2. Implement API endpoints (see FRONTEND_INTEGRATION_COMPLETE.md):"
echo "   - POST /api/milestones/:id/commit"
echo "   - POST /api/escrow/deposit"
echo "   - GET /api/escrow/pool"
echo "   - POST /api/micropayment/charge"
echo ""
echo "3. Implement UI components (see FRONTEND_INTEGRATION_COMPLETE.md):"
echo "   - MilestoneCommitButton"
echo "   - EscrowFundingForm"
echo "   - EscrowPoolDisplay"
echo "   - AIChatMicropaymentDisplay"
echo ""
echo "4. Fund verifier wallet with Arbitrum Sepolia ETH:"
echo "   Address: $VERIFIER_ADDRESS"
echo "   Faucet: https://faucet.quicknode.com/arbitrum/sepolia"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
