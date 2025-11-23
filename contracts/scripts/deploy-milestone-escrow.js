const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("Deploying contracts with account:", deployer.address);
  console.log(
    "Account balance:",
    (await deployer.provider.getBalance(deployer.address)).toString()
  );

  // Contract addresses
  const WPOL_TOKEN = "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73"; // X402/WPOL on Arbitrum Sepolia
  const AAVE_LENDING_POOL = "0x0000000000000000000000000000000000000000"; // TODO: Add Aave v3 address for Arbitrum

  console.log("\n=== Deploying Milestone & Escrow System ===\n");

  // 1. Deploy MerkleCommitStorage
  console.log("1. Deploying MerkleCommitStorage...");
  const MerkleCommitStorage = await hre.ethers.getContractFactory(
    "MerkleCommitStorage"
  );
  const merkleStorage = await MerkleCommitStorage.deploy();
  await merkleStorage.waitForDeployment();
  const merkleStorageAddress = await merkleStorage.getAddress();
  console.log("✅ MerkleCommitStorage deployed to:", merkleStorageAddress);

  // 2. Deploy EscrowAndYield
  console.log("\n2. Deploying EscrowAndYield...");
  const EscrowAndYield = await hre.ethers.getContractFactory("EscrowAndYield");
  const escrow = await EscrowAndYield.deploy(
    merkleStorageAddress,
    AAVE_LENDING_POOL
  );
  await escrow.waitForDeployment();
  const escrowAddress = await escrow.getAddress();
  console.log("✅ EscrowAndYield deployed to:", escrowAddress);

  // 3. Deploy MilestoneManager
  console.log("\n3. Deploying MilestoneManager...");
  const MilestoneManager = await hre.ethers.getContractFactory(
    "MilestoneManager"
  );
  const milestoneManager = await MilestoneManager.deploy(
    merkleStorageAddress,
    escrowAddress
  );
  await milestoneManager.waitForDeployment();
  const milestoneManagerAddress = await milestoneManager.getAddress();
  console.log("✅ MilestoneManager deployed to:", milestoneManagerAddress);

  console.log("\n=== Deployment Summary ===");
  console.log("MerkleCommitStorage:", merkleStorageAddress);
  console.log("EscrowAndYield:", escrowAddress);
  console.log("MilestoneManager:", milestoneManagerAddress);

  console.log("\n=== Update your .env file ===");
  console.log(`AA_MERKLE_COMMIT_STORAGE_ADDRESS="${merkleStorageAddress}"`);
  console.log(`AA_ESCROW_AND_YIELD_ADDRESS="${escrowAddress}"`);
  console.log(`AA_MILESTONE_MANAGER_ADDRESS="${milestoneManagerAddress}"`);

  // Save deployment info
  const deploymentInfo = {
    network: hre.network.name,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      MerkleCommitStorage: merkleStorageAddress,
      EscrowAndYield: escrowAddress,
      MilestoneManager: milestoneManagerAddress,
    },
    configuration: {
      wpolToken: WPOL_TOKEN,
      aaveLendingPool: AAVE_LENDING_POOL,
    },
  };

  const fs = require("fs");
  const path = require("path");

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir);
  }

  const filename = `milestone-escrow-${hre.network.name}-${Date.now()}.json`;
  fs.writeFileSync(
    path.join(deploymentsDir, filename),
    JSON.stringify(deploymentInfo, null, 2)
  );

  console.log(`\n✅ Deployment info saved to: deployments/${filename}`);

  // Verify on Arbiscan if on real network
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    console.log("\n⏳ Waiting 60 seconds before verification...");
    await new Promise((resolve) => setTimeout(resolve, 60000));

    console.log("\n=== Verifying Contracts ===");

    try {
      await hre.run("verify:verify", {
        address: merkleStorageAddress,
        constructorArguments: [],
      });
      console.log("✅ MerkleCommitStorage verified");
    } catch (error) {
      console.log("❌ MerkleCommitStorage verification failed:", error.message);
    }

    try {
      await hre.run("verify:verify", {
        address: escrowAddress,
        constructorArguments: [merkleStorageAddress, AAVE_LENDING_POOL],
      });
      console.log("✅ EscrowAndYield verified");
    } catch (error) {
      console.log("❌ EscrowAndYield verification failed:", error.message);
    }

    try {
      await hre.run("verify:verify", {
        address: milestoneManagerAddress,
        constructorArguments: [merkleStorageAddress, escrowAddress],
      });
      console.log("✅ MilestoneManager verified");
    } catch (error) {
      console.log("❌ MilestoneManager verification failed:", error.message);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
