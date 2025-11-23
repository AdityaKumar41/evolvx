// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/SessionKeyRegistry.sol";
import "../src/MicropaymentManager.sol";
import "../src/MicropaymentPaymaster.sol";
import "../src/SmartAccountV2.sol";

contract DeployMicropaymentSystem is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("RELAYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        console.log("Deploying contracts with account:", deployer);
        console.log("Account balance:", deployer.balance);
        
        // Contract addresses
        address ENTRY_POINT = 0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789; // ERC-4337 EntryPoint
        address WPOL_TOKEN = 0x980B62Da83eFf3D4576C647993b0c1D7faf17c73; // X402/WPOL token
        address TREASURY = deployer; // Use deployer as treasury for now
        uint256 MIN_PAYMENT = 0.001 ether; // 0.001 WPOL minimum
        uint256 MAX_PAYMENT = 10 ether; // 10 WPOL maximum
        
        vm.startBroadcast(deployerPrivateKey);
        
        console.log("\n=== Deploying Micropayment System ===\n");
        
        // 1. Deploy SessionKeyRegistry
        console.log("1. Deploying SessionKeyRegistry...");
        SessionKeyRegistry sessionKeyRegistry = new SessionKeyRegistry();
        console.log("SessionKeyRegistry deployed to:", address(sessionKeyRegistry));
        
        // 2. Deploy MicropaymentManager
        console.log("\n2. Deploying MicropaymentManager...");
        MicropaymentManager micropaymentManager = new MicropaymentManager(
            WPOL_TOKEN,
            TREASURY,
            MIN_PAYMENT,
            MAX_PAYMENT
        );
        console.log("MicropaymentManager deployed to:", address(micropaymentManager));
        
        // 3. Deploy SmartAccountV2 Implementation
        console.log("\n3. Deploying SmartAccountV2 Implementation...");
        SmartAccountV2 smartAccountImpl = new SmartAccountV2(ENTRY_POINT);
        console.log("SmartAccountV2 Implementation deployed to:", address(smartAccountImpl));
        
        // 4. Deploy MicropaymentPaymaster
        console.log("\n4. Deploying MicropaymentPaymaster...");
        MicropaymentPaymaster paymaster = new MicropaymentPaymaster(
            ENTRY_POINT,
            address(micropaymentManager)
        );
        console.log("MicropaymentPaymaster deployed to:", address(paymaster));
        
        // 5. Fund paymaster with ETH for gas sponsorship
        console.log("\n5. Funding paymaster with 0.01 ETH...");
        (bool success,) = address(paymaster).call{value: 0.01 ether}("");
        require(success, "Failed to fund paymaster");
        console.log("Paymaster funded successfully");
        
        vm.stopBroadcast();
        
        console.log("\n=== Deployment Summary ===");
        console.log("SessionKeyRegistry:", address(sessionKeyRegistry));
        console.log("MicropaymentManager:", address(micropaymentManager));
        console.log("SmartAccountV2 Implementation:", address(smartAccountImpl));
        console.log("MicropaymentPaymaster:", address(paymaster));
        console.log("EntryPoint (existing):", ENTRY_POINT);
        console.log("WPOL Token (existing):", WPOL_TOKEN);
        
        console.log("\n=== Update your .env file ===");
        console.log('AA_SESSION_KEY_REGISTRY_ADDRESS="%s"', address(sessionKeyRegistry));
        console.log('AA_MICROPAYMENT_MANAGER_ADDRESS="%s"', address(micropaymentManager));
        console.log('AA_SMART_ACCOUNT_V2_IMPLEMENTATION="%s"', address(smartAccountImpl));
        console.log('AA_MICROPAYMENT_PAYMASTER_ADDRESS="%s"', address(paymaster));
    }
}
