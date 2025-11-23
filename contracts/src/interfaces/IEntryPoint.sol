// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title PackedUserOperation
 * @notice ERC-4337 UserOperation structure (packed version)
 */
struct PackedUserOperation {
    address sender;
    uint256 nonce;
    bytes initCode;
    bytes callData;
    bytes32 accountGasLimits;
    uint256 preVerificationGas;
    bytes32 gasFees;
    bytes paymasterAndData;
    bytes signature;
}

/**
 * @title IEntryPoint
 * @notice ERC-4337 EntryPoint interface
 */
interface IEntryPoint {
    function handleOps(
        PackedUserOperation[] calldata ops,
        address payable beneficiary
    ) external;
    
    function handleAggregatedOps(
        UserOpsPerAggregator[] calldata opsPerAggregator,
        address payable beneficiary
    ) external;
    
    function getUserOpHash(PackedUserOperation calldata userOp) external view returns (bytes32);
    
    function depositTo(address account) external payable;
    
    function withdrawTo(address payable withdrawAddress, uint256 withdrawAmount) external;
    
    function balanceOf(address account) external view returns (uint256);
    
    function getNonce(address sender, uint192 key) external view returns (uint256 nonce);
}

struct UserOpsPerAggregator {
    PackedUserOperation[] userOps;
    address aggregator;
    bytes signature;
}
