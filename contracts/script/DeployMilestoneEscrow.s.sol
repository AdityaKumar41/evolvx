// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/MerkleCommitStorage.sol";
import "../src/EscrowAndYield.sol";
import "../src/MilestoneManager.sol";

contract DeployMilestoneEscrow is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("RELAYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        console.log("Deploying contracts with account:", deployer);
        console.log("Account balance:", deployer.balance);
        
        // Contract addresses
        address AAVE_LENDING_POOL = address(0); // Will be updated later
        
        vm.startBroadcast(deployerPrivateKey);
        
        console.log("\n=== Deploying Milestone & Escrow System ===\n");
        
        // 1. Deploy MerkleCommitStorage
        console.log("1. Deploying MerkleCommitStorage...");
        MerkleCommitStorage merkleStorage = new MerkleCommitStorage();
        console.log("MerkleCommitStorage deployed to:", address(merkleStorage));
        
        // 2. Deploy EscrowAndYield
        console.log("\n2. Deploying EscrowAndYield...");
        EscrowAndYield escrow = new EscrowAndYield(
            address(merkleStorage),
            AAVE_LENDING_POOL
        );
        console.log("EscrowAndYield deployed to:", address(escrow));
        
        // 3. Deploy MilestoneManager
        console.log("\n3. Deploying MilestoneManager...");
        MilestoneManager milestoneManager = new MilestoneManager(
            address(merkleStorage),
            address(escrow)
        );
        console.log("MilestoneManager deployed to:", address(milestoneManager));
        
        vm.stopBroadcast();
        
        console.log("\n=== Deployment Summary ===");
        console.log("MerkleCommitStorage:", address(merkleStorage));
        console.log("EscrowAndYield:", address(escrow));
        console.log("MilestoneManager:", address(milestoneManager));
        
        console.log("\n=== Update your .env file ===");
        console.log('AA_MERKLE_COMMIT_STORAGE_ADDRESS="%s"', address(merkleStorage));
        console.log('AA_ESCROW_AND_YIELD_ADDRESS="%s"', address(escrow));
        console.log('AA_MILESTONE_MANAGER_ADDRESS="%s"', address(milestoneManager));
    }
}
