const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * Deploy Micropayment System Contracts
 * Deploys: SessionKeyRegistry, MicropaymentManager, MicropaymentPaymaster, SmartAccountV2
 */

async function main() {
  console.log("🚀 Deploying Micropayment System to Arbitrum Sepolia...\n");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer address:", deployer.address);
  console.log(
    "Deployer balance:",
    hre.ethers.formatEther(
      await hre.ethers.provider.getBalance(deployer.address)
    ),
    "ETH\n"
  );

  // Configuration
  const ENTRY_POINT_ADDRESS = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789"; // Standard ERC-4337
  const X402_TOKEN_ADDRESS =
    process.env.WPOL_TOKEN_ADDRESS ||
    "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73"; // WETH on Arbitrum Sepolia for testing
  const TREASURY_ADDRESS = deployer.address; // Platform treasury (change to multisig in production)
  const MIN_PAYMENT = hre.ethers.parseUnits("0.001", 18); // 0.001 X402 min
  const MAX_PAYMENT = hre.ethers.parseUnits("100", 18); // 100 X402 max

  const deployments = {};

  // 1. Deploy SessionKeyRegistry
  console.log("📝 Deploying SessionKeyRegistry...");
  const SessionKeyRegistry = await hre.ethers.getContractFactory(
    "SessionKeyRegistry"
  );
  const sessionKeyRegistry = await SessionKeyRegistry.deploy();
  await sessionKeyRegistry.waitForDeployment();
  const sessionKeyRegistryAddress = await sessionKeyRegistry.getAddress();
  console.log("✅ SessionKeyRegistry deployed to:", sessionKeyRegistryAddress);
  deployments.sessionKeyRegistry = sessionKeyRegistryAddress;

  // 2. Deploy MicropaymentManager
  console.log("\n📝 Deploying MicropaymentManager...");
  const MicropaymentManager = await hre.ethers.getContractFactory(
    "MicropaymentManager"
  );
  const micropaymentManager = await MicropaymentManager.deploy(
    X402_TOKEN_ADDRESS,
    TREASURY_ADDRESS,
    MIN_PAYMENT,
    MAX_PAYMENT
  );
  await micropaymentManager.waitForDeployment();
  const micropaymentManagerAddress = await micropaymentManager.getAddress();
  console.log(
    "✅ MicropaymentManager deployed to:",
    micropaymentManagerAddress
  );
  deployments.micropaymentManager = micropaymentManagerAddress;

  // 3. Deploy MicropaymentPaymaster
  console.log("\n📝 Deploying MicropaymentPaymaster...");
  const MicropaymentPaymaster = await hre.ethers.getContractFactory(
    "MicropaymentPaymaster"
  );
  const micropaymentPaymaster = await MicropaymentPaymaster.deploy(
    ENTRY_POINT_ADDRESS,
    micropaymentManagerAddress
  );
  await micropaymentPaymaster.waitForDeployment();
  const micropaymentPaymasterAddress = await micropaymentPaymaster.getAddress();
  console.log(
    "✅ MicropaymentPaymaster deployed to:",
    micropaymentPaymasterAddress
  );
  deployments.micropaymentPaymaster = micropaymentPaymasterAddress;

  // 4. Deploy SmartAccountV2 Implementation
  console.log("\n📝 Deploying SmartAccountV2 Implementation...");
  const SmartAccountV2 = await hre.ethers.getContractFactory("SmartAccountV2");
  const smartAccountV2 = await SmartAccountV2.deploy(ENTRY_POINT_ADDRESS);
  await smartAccountV2.waitForDeployment();
  const smartAccountV2Address = await smartAccountV2.getAddress();
  console.log("✅ SmartAccountV2 deployed to:", smartAccountV2Address);
  deployments.smartAccountV2 = smartAccountV2Address;

  // 5. Fund Paymaster with ETH
  console.log("\n💰 Funding Paymaster with 0.1 ETH...");
  const fundTx = await deployer.sendTransaction({
    to: micropaymentPaymasterAddress,
    value: hre.ethers.parseEther("0.1"),
  });
  await fundTx.wait();
  console.log("✅ Paymaster funded with 0.1 ETH");

  // Get paymaster deposit balance
  const depositBalance = await micropaymentPaymaster.getDeposit();
  console.log(
    "Paymaster deposit in EntryPoint:",
    hre.ethers.formatEther(depositBalance),
    "ETH"
  );

  // 6. Save deployment addresses
  const deploymentFile = path.join(
    __dirname,
    "../deployments/micropayment-system-deployment.json"
  );
  const deploymentData = {
    network: "arbitrum-sepolia",
    chainId: 421614,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      entryPoint: ENTRY_POINT_ADDRESS,
      sessionKeyRegistry: sessionKeyRegistryAddress,
      micropaymentManager: micropaymentManagerAddress,
      micropaymentPaymaster: micropaymentPaymasterAddress,
      smartAccountV2Implementation: smartAccountV2Address,
      x402Token: X402_TOKEN_ADDRESS,
      treasury: TREASURY_ADDRESS,
    },
    config: {
      minPaymentPerPrompt: hre.ethers.formatUnits(MIN_PAYMENT, 18),
      maxPaymentPerPrompt: hre.ethers.formatUnits(MAX_PAYMENT, 18),
      paymasterFunded: "0.1 ETH",
    },
  };

  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentData, null, 2));
  console.log("\n📄 Deployment data saved to:", deploymentFile);

  // 7. Print summary
  console.log("\n" + "=".repeat(80));
  console.log("🎉 Deployment Complete!");
  console.log("=".repeat(80));
  console.log("\n📋 Contract Addresses:\n");
  console.log("SessionKeyRegistry:         ", sessionKeyRegistryAddress);
  console.log("MicropaymentManager:        ", micropaymentManagerAddress);
  console.log("MicropaymentPaymaster:      ", micropaymentPaymasterAddress);
  console.log("SmartAccountV2 (impl):      ", smartAccountV2Address);
  console.log("EntryPoint:                 ", ENTRY_POINT_ADDRESS);
  console.log("X402 Token:                 ", X402_TOKEN_ADDRESS);
  console.log("Treasury:                   ", TREASURY_ADDRESS);

  console.log("\n🔧 Update your .env file:\n");
  console.log(`AA_SESSION_KEY_REGISTRY_ADDRESS="${sessionKeyRegistryAddress}"`);
  console.log(
    `AA_MICROPAYMENT_MANAGER_ADDRESS="${micropaymentManagerAddress}"`
  );
  console.log(
    `AA_MICROPAYMENT_PAYMASTER_ADDRESS="${micropaymentPaymasterAddress}"`
  );
  console.log(`AA_SMART_ACCOUNT_V2_IMPLEMENTATION="${smartAccountV2Address}"`);

  console.log("\n✅ Next Steps:\n");
  console.log("1. Update devs-backend/.env with the addresses above");
  console.log("2. Restart your backend server");
  console.log(
    "3. Test session key registration: POST /api/session-keys/auto-create"
  );
  console.log("4. Send an AI prompt to test micropayment flow");
  console.log("5. Monitor transactions on Arbiscan");
  console.log("\n" + "=".repeat(80) + "\n");

  // 8. Verify contracts on Arbiscan (optional)
  if (process.env.ETHERSCAN_API_KEY) {
    console.log(
      "🔍 Waiting 30 seconds before verifying contracts on Arbiscan..."
    );
    await new Promise((resolve) => setTimeout(resolve, 30000));

    console.log("\n📝 Verifying SessionKeyRegistry...");
    try {
      await hre.run("verify:verify", {
        address: sessionKeyRegistryAddress,
        constructorArguments: [],
      });
    } catch (error) {
      console.log("⚠️  Verification failed:", error.message);
    }

    console.log("\n📝 Verifying MicropaymentManager...");
    try {
      await hre.run("verify:verify", {
        address: micropaymentManagerAddress,
        constructorArguments: [
          X402_TOKEN_ADDRESS,
          TREASURY_ADDRESS,
          MIN_PAYMENT,
          MAX_PAYMENT,
        ],
      });
    } catch (error) {
      console.log("⚠️  Verification failed:", error.message);
    }

    console.log("\n📝 Verifying MicropaymentPaymaster...");
    try {
      await hre.run("verify:verify", {
        address: micropaymentPaymasterAddress,
        constructorArguments: [ENTRY_POINT_ADDRESS, micropaymentManagerAddress],
      });
    } catch (error) {
      console.log("⚠️  Verification failed:", error.message);
    }

    console.log("\n📝 Verifying SmartAccountV2...");
    try {
      await hre.run("verify:verify", {
        address: smartAccountV2Address,
        constructorArguments: [ENTRY_POINT_ADDRESS],
      });
    } catch (error) {
      console.log("⚠️  Verification failed:", error.message);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
