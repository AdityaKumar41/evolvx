// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title MerkleCommitStorage
 * @notice Stores Merkle root hashes for milestone verification
 * @dev Used to commit milestone/submilestone structure on-chain
 * 
 * Flow:
 * 1. Sponsor creates milestones/submilestones in frontend
 * 2. Backend generates Merkle tree from structure
 * 3. Sponsor signs transaction to commit root hash
 * 4. Root hash stored on-chain (immutable proof)
 * 5. Contributors can verify their work against committed structure
 */
contract MerkleCommitStorage is Ownable, ReentrancyGuard {
    constructor() Ownable(msg.sender) {}
    
    struct MilestoneCommit {
        bytes32 rootHash;           // Merkle root of milestone structure
        address committer;          // Who committed (sponsor)
        uint256 totalAmount;        // Total ARB locked for this milestone
        uint256 submilestoneCount;  // Number of submilestones
        uint256 committedAt;        // Timestamp
        bool finalized;             // Cannot be modified after finalization
        string metadataUri;         // IPFS/Arweave link to full structure
    }
    
    // projectId => milestoneId => commit data
    mapping(string => mapping(string => MilestoneCommit)) public commits;
    
    // Track all milestones for a project
    mapping(string => string[]) public projectMilestones;
    
    event MilestoneCommitted(
        string indexed projectId,
        string indexed milestoneId,
        bytes32 rootHash,
        address indexed committer,
        uint256 totalAmount,
        uint256 submilestoneCount,
        string metadataUri
    );
    
    event MilestoneFinalized(
        string indexed projectId,
        string indexed milestoneId,
        bytes32 rootHash
    );
    
    event MilestoneUpdated(
        string indexed projectId,
        string indexed milestoneId,
        bytes32 oldRootHash,
        bytes32 newRootHash
    );
    
    /**
     * @notice Commit milestone structure to blockchain
     * @param projectId Project identifier (UUID from database)
     * @param milestoneId Milestone identifier (UUID from database)
     * @param rootHash Merkle root hash of milestone structure
     * @param totalAmount Total ARB to be distributed
     * @param submilestoneCount Number of submilestones
     * @param metadataUri IPFS/Arweave URI with full milestone data
     */
    function commitMilestone(
        string calldata projectId,
        string calldata milestoneId,
        bytes32 rootHash,
        uint256 totalAmount,
        uint256 submilestoneCount,
        string calldata metadataUri
    ) external nonReentrant {
        require(rootHash != bytes32(0), "Invalid root hash");
        require(totalAmount > 0, "Amount must be positive");
        require(submilestoneCount > 0, "Must have submilestones");
        require(bytes(metadataUri).length > 0, "Metadata URI required");
        
        MilestoneCommit storage commit = commits[projectId][milestoneId];
        
        // If already committed, check if finalized
        if (commit.rootHash != bytes32(0)) {
            require(!commit.finalized, "Milestone already finalized");
            require(commit.committer == msg.sender, "Only original committer can update");
            
            bytes32 oldRootHash = commit.rootHash;
            
            // Update existing commit
            commit.rootHash = rootHash;
            commit.totalAmount = totalAmount;
            commit.submilestoneCount = submilestoneCount;
            commit.committedAt = block.timestamp;
            commit.metadataUri = metadataUri;
            
            emit MilestoneUpdated(projectId, milestoneId, oldRootHash, rootHash);
        } else {
            // New commit
            commits[projectId][milestoneId] = MilestoneCommit({
                rootHash: rootHash,
                committer: msg.sender,
                totalAmount: totalAmount,
                submilestoneCount: submilestoneCount,
                committedAt: block.timestamp,
                finalized: false,
                metadataUri: metadataUri
            });
            
            projectMilestones[projectId].push(milestoneId);
            
            emit MilestoneCommitted(
                projectId,
                milestoneId,
                rootHash,
                msg.sender,
                totalAmount,
                submilestoneCount,
                metadataUri
            );
        }
    }
    
    /**
     * @notice Finalize milestone (prevents further changes)
     * @dev Called after all submilestones defined and escrow funded
     */
    function finalizeMilestone(
        string calldata projectId,
        string calldata milestoneId
    ) external nonReentrant {
        MilestoneCommit storage commit = commits[projectId][milestoneId];
        
        require(commit.rootHash != bytes32(0), "Milestone not committed");
        require(!commit.finalized, "Already finalized");
        require(commit.committer == msg.sender, "Only committer can finalize");
        
        commit.finalized = true;
        
        emit MilestoneFinalized(projectId, milestoneId, commit.rootHash);
    }
    
    /**
     * @notice Verify a submilestone against committed Merkle root
     * @param projectId Project identifier
     * @param milestoneId Milestone identifier
     * @param submilestoneId Submilestone identifier
     * @param amount Payment amount for this submilestone
     * @param proof Merkle proof
     * @return bool True if valid
     */
    function verifySubmilestone(
        string calldata projectId,
        string calldata milestoneId,
        string calldata submilestoneId,
        uint256 amount,
        bytes32[] calldata proof
    ) external view returns (bool) {
        MilestoneCommit storage commit = commits[projectId][milestoneId];
        
        if (commit.rootHash == bytes32(0)) {
            return false;
        }
        
        // Create leaf hash: keccak256(abi.encodePacked(submilestoneId, amount))
        bytes32 leaf = keccak256(abi.encodePacked(submilestoneId, amount));
        
        return _verifyProof(proof, commit.rootHash, leaf);
    }
    
    /**
     * @notice Get milestone commit data
     */
    function getMilestoneCommit(
        string calldata projectId,
        string calldata milestoneId
    ) external view returns (MilestoneCommit memory) {
        return commits[projectId][milestoneId];
    }
    
    /**
     * @notice Get all milestones for a project
     */
    function getProjectMilestones(
        string calldata projectId
    ) external view returns (string[] memory) {
        return projectMilestones[projectId];
    }
    
    /**
     * @notice Verify Merkle proof
     * @dev Internal function using OpenZeppelin's algorithm
     */
    function _verifyProof(
        bytes32[] memory proof,
        bytes32 root,
        bytes32 leaf
    ) internal pure returns (bool) {
        bytes32 computedHash = leaf;
        
        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 proofElement = proof[i];
            
            if (computedHash <= proofElement) {
                computedHash = keccak256(abi.encodePacked(computedHash, proofElement));
            } else {
                computedHash = keccak256(abi.encodePacked(proofElement, computedHash));
            }
        }
        
        return computedHash == root;
    }
}
