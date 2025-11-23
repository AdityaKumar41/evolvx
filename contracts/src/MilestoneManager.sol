// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./MerkleCommitStorage.sol";
import "./EscrowAndYield.sol";

/**
 * @title MilestoneManager
 * @notice Orchestrates milestone lifecycle and contributor payouts
 * @dev Coordinates between Merkle verification and Escrow payments
 * 
 * Flow:
 * 1. Sponsor creates milestone → commits Merkle root
 * 2. Sponsor funds escrow (with/without yield)
 * 3. Contributors work on submilestones
 * 4. Contributors submit PR via platform
 * 5. AI analyzes PR → decides if should merge
 * 6. Backend calls approvePayout() if AI approves
 * 7. Contributor receives payment from escrow
 */
contract MilestoneManager is Ownable, ReentrancyGuard {
    MerkleCommitStorage public merkleStorage;
    EscrowAndYield public escrow;
    
    struct PayoutRequest {
        string projectId;
        string milestoneId;
        string submilestoneId;
        address contributor;
        uint256 amount;
        bytes32[] merkleProof;
        string prUrl;               // GitHub PR URL
        bool aiApproved;            // AI verification status
        bool paid;                  // Payment completed
        uint256 requestedAt;
        uint256 processedAt;
    }
    
    // Payout request ID => request data
    mapping(string => PayoutRequest) public payoutRequests;
    
    // Track all payout requests for a milestone
    mapping(string => mapping(string => string[])) public milestonePayouts; // projectId => milestoneId => requestIds
    
    // Authorized AI verifier addresses (backend services)
    mapping(address => bool) public authorizedVerifiers;
    
    event PayoutRequested(
        string indexed requestId,
        string indexed projectId,
        string indexed milestoneId,
        string submilestoneId,
        address contributor,
        uint256 amount,
        string prUrl
    );
    
    event PayoutApproved(
        string indexed requestId,
        address indexed verifier,
        bool approved
    );
    
    event PayoutCompleted(
        string indexed requestId,
        string indexed projectId,
        string indexed milestoneId,
        string submilestoneId,
        address contributor,
        uint256 amount
    );
    
    event PayoutRejected(
        string indexed requestId,
        address indexed verifier,
        string reason
    );
    
    modifier onlyVerifier() {
        require(authorizedVerifiers[msg.sender], "Not authorized verifier");
        _;
    }
    
    constructor(
        address _merkleStorage,
        address _escrow
    ) Ownable(msg.sender) {
        require(_merkleStorage != address(0), "Invalid Merkle storage");
        require(_escrow != address(0), "Invalid escrow");
        
        merkleStorage = MerkleCommitStorage(_merkleStorage);
        escrow = EscrowAndYield(_escrow);
    }
    
    /**
     * @notice Request payout for completed submilestone
     * @param requestId Unique request identifier (UUID from backend)
     * @param projectId Project identifier
     * @param milestoneId Milestone identifier
     * @param submilestoneId Submilestone identifier
     * @param contributor Contributor wallet address
     * @param amount Payment amount (must match Merkle tree)
     * @param merkleProof Merkle proof for verification
     * @param prUrl GitHub PR URL
     */
    function requestPayout(
        string calldata requestId,
        string calldata projectId,
        string calldata milestoneId,
        string calldata submilestoneId,
        address contributor,
        uint256 amount,
        bytes32[] calldata merkleProof,
        string calldata prUrl
    ) external nonReentrant {
        require(bytes(requestId).length > 0, "Invalid request ID");
        require(contributor != address(0), "Invalid contributor");
        require(amount > 0, "Amount must be positive");
        require(bytes(prUrl).length > 0, "PR URL required");
        
        // Verify request doesn't already exist
        require(
            payoutRequests[requestId].requestedAt == 0,
            "Request already exists"
        );
        
        // Verify submilestone against Merkle root
        bool valid = merkleStorage.verifySubmilestone(
            projectId,
            milestoneId,
            submilestoneId,
            amount,
            merkleProof
        );
        require(valid, "Invalid Merkle proof");
        
        // Check contributor not already paid for this submilestone
        require(
            !escrow.isContributorPaid(projectId, milestoneId, submilestoneId, contributor),
            "Already paid"
        );
        
        // Create payout request
        payoutRequests[requestId] = PayoutRequest({
            projectId: projectId,
            milestoneId: milestoneId,
            submilestoneId: submilestoneId,
            contributor: contributor,
            amount: amount,
            merkleProof: merkleProof,
            prUrl: prUrl,
            aiApproved: false,
            paid: false,
            requestedAt: block.timestamp,
            processedAt: 0
        });
        
        milestonePayouts[projectId][milestoneId].push(requestId);
        
        emit PayoutRequested(
            requestId,
            projectId,
            milestoneId,
            submilestoneId,
            contributor,
            amount,
            prUrl
        );
    }
    
    /**
     * @notice Approve payout after AI verification
     * @dev Called by authorized backend service after AI analyzes PR
     * @param requestId Payout request identifier
     * @param approved AI decision (true = merge PR, false = reject)
     */
    function approvePayout(
        string calldata requestId,
        bool approved
    ) external onlyVerifier nonReentrant {
        PayoutRequest storage request = payoutRequests[requestId];
        
        require(request.requestedAt > 0, "Request not found");
        require(!request.paid, "Already paid");
        require(request.processedAt == 0, "Already processed");
        
        request.aiApproved = approved;
        request.processedAt = block.timestamp;
        
        emit PayoutApproved(requestId, msg.sender, approved);
        
        if (approved) {
            // Execute payment from escrow
            _executePayout(requestId);
        }
    }
    
    /**
     * @notice Reject payout with reason
     */
    function rejectPayout(
        string calldata requestId,
        string calldata reason
    ) external onlyVerifier nonReentrant {
        PayoutRequest storage request = payoutRequests[requestId];
        
        require(request.requestedAt > 0, "Request not found");
        require(!request.paid, "Already paid");
        require(request.processedAt == 0, "Already processed");
        
        request.aiApproved = false;
        request.processedAt = block.timestamp;
        
        emit PayoutRejected(requestId, msg.sender, reason);
    }
    
    /**
     * @notice Execute payout from escrow
     * @dev Internal function called after AI approval
     */
    function _executePayout(string calldata requestId) internal {
        PayoutRequest storage request = payoutRequests[requestId];
        
        require(request.aiApproved, "Not approved");
        require(!request.paid, "Already paid");
        
        // Call escrow to pay contributor
        escrow.payContributor(
            request.projectId,
            request.milestoneId,
            request.submilestoneId,
            request.contributor,
            request.amount,
            request.merkleProof
        );
        
        request.paid = true;
        
        emit PayoutCompleted(
            requestId,
            request.projectId,
            request.milestoneId,
            request.submilestoneId,
            request.contributor,
            request.amount
        );
    }
    
    /**
     * @notice Batch approve multiple payouts
     * @dev Gas-efficient for processing multiple PRs at once
     */
    function batchApprovePayout(
        string[] calldata requestIds,
        bool[] calldata approvals
    ) external onlyVerifier nonReentrant {
        require(requestIds.length == approvals.length, "Array length mismatch");
        require(requestIds.length > 0, "Empty batch");
        
        for (uint256 i = 0; i < requestIds.length; i++) {
            PayoutRequest storage request = payoutRequests[requestIds[i]];
            
            if (request.requestedAt == 0 || request.paid || request.processedAt != 0) {
                continue; // Skip invalid/processed requests
            }
            
            request.aiApproved = approvals[i];
            request.processedAt = block.timestamp;
            
            emit PayoutApproved(requestIds[i], msg.sender, approvals[i]);
            
            if (approvals[i]) {
                _executePayout(requestIds[i]);
            }
        }
    }
    
    /**
     * @notice Get payout request details
     */
    function getPayoutRequest(
        string calldata requestId
    ) external view returns (PayoutRequest memory) {
        return payoutRequests[requestId];
    }
    
    /**
     * @notice Get all payout requests for a milestone
     */
    function getMilestonePayouts(
        string calldata projectId,
        string calldata milestoneId
    ) external view returns (string[] memory) {
        return milestonePayouts[projectId][milestoneId];
    }
    
    /**
     * @notice Get payout status
     */
    function getPayoutStatus(
        string calldata requestId
    ) external view returns (
        bool requested,
        bool approved,
        bool paid,
        uint256 processedAt
    ) {
        PayoutRequest storage request = payoutRequests[requestId];
        return (
            request.requestedAt > 0,
            request.aiApproved,
            request.paid,
            request.processedAt
        );
    }
    
    /**
     * @notice Add authorized verifier (backend service)
     */
    function addVerifier(address verifier) external onlyOwner {
        require(verifier != address(0), "Invalid verifier");
        authorizedVerifiers[verifier] = true;
    }
    
    /**
     * @notice Remove authorized verifier
     */
    function removeVerifier(address verifier) external onlyOwner {
        authorizedVerifiers[verifier] = false;
    }
    
    /**
     * @notice Check if address is authorized verifier
     */
    function isVerifier(address verifier) external view returns (bool) {
        return authorizedVerifiers[verifier];
    }
}
