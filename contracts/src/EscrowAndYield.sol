// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./MerkleCommitStorage.sol";

/**
 * @title EscrowAndYield
 * @notice Escrow contract with optional Aave yield farming
 * @dev Holds milestone payments and optionally generates yield via Aave
 * 
 * Flow:
 * 1. Sponsor deposits ARB tokens for milestone
 * 2. Option A: Simple escrow (just hold tokens)
 * 3. Option B: Yield farming (deposit to Aave, earn interest)
 * 4. Contributors complete work → verified → paid from escrow
 * 5. Unclaimed funds returned to sponsor after deadline
 */
contract EscrowAndYield is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    
    struct EscrowPool {
        address sponsor;            // Who funded this escrow
        address token;              // ARB token address
        uint256 totalDeposited;     // Total ARB deposited
        uint256 totalPaid;          // Total ARB paid to contributors
        uint256 yieldGenerated;     // Yield earned from Aave
        bool yieldEnabled;          // Using Aave yield farming?
        uint256 createdAt;          // Timestamp
        uint256 deadline;           // After this, sponsor can withdraw unclaimed
        bool active;                // Can accept payments
    }
    
    // projectId => milestoneId => escrow pool
    mapping(string => mapping(string => EscrowPool)) public escrowPools;
    
    // Track payments to contributors
    // projectId => milestoneId => submilestoneId => contributor => paid amount
    mapping(string => mapping(string => mapping(string => mapping(address => uint256)))) public contributorPayments;
    
    // Merkle commit storage for verification
    MerkleCommitStorage public merkleStorage;
    
    // Aave lending pool (Arbitrum address)
    address public aaveLendingPool;
    
    event EscrowCreated(
        string indexed projectId,
        string indexed milestoneId,
        address indexed sponsor,
        address token,
        uint256 amount,
        bool yieldEnabled
    );
    
    event FundsDeposited(
        string indexed projectId,
        string indexed milestoneId,
        address indexed sponsor,
        uint256 amount
    );
    
    event ContributorPaid(
        string indexed projectId,
        string indexed milestoneId,
        string submilestoneId,
        address indexed contributor,
        uint256 amount
    );
    
    event YieldHarvested(
        string indexed projectId,
        string indexed milestoneId,
        uint256 yieldAmount
    );
    
    event EscrowClosed(
        string indexed projectId,
        string indexed milestoneId,
        uint256 remainingAmount
    );
    
    constructor(
        address _merkleStorage,
        address _aaveLendingPool
    ) Ownable(msg.sender) {
        require(_merkleStorage != address(0), "Invalid Merkle storage");
        merkleStorage = MerkleCommitStorage(_merkleStorage);
        aaveLendingPool = _aaveLendingPool; // Can be 0x0 if yield disabled
    }
    
    /**
     * @notice Create escrow pool for milestone
     * @param projectId Project identifier
     * @param milestoneId Milestone identifier
     * @param token ARB token address
     * @param amount Initial deposit amount
     * @param yieldEnabled Enable Aave yield farming?
     * @param deadlineDays Days until sponsor can withdraw unclaimed funds
     */
    function createEscrow(
        string calldata projectId,
        string calldata milestoneId,
        address token,
        uint256 amount,
        bool yieldEnabled,
        uint256 deadlineDays
    ) external nonReentrant {
        require(amount > 0, "Amount must be positive");
        require(token != address(0), "Invalid token");
        require(deadlineDays > 0, "Deadline required");
        
        // Verify milestone committed on-chain
        MerkleCommitStorage.MilestoneCommit memory commit = merkleStorage.getMilestoneCommit(
            projectId,
            milestoneId
        );
        require(commit.rootHash != bytes32(0), "Milestone not committed");
        require(commit.committer == msg.sender, "Only milestone creator can fund");
        
        // Create escrow pool
        escrowPools[projectId][milestoneId] = EscrowPool({
            sponsor: msg.sender,
            token: token,
            totalDeposited: amount,
            totalPaid: 0,
            yieldGenerated: 0,
            yieldEnabled: yieldEnabled,
            createdAt: block.timestamp,
            deadline: block.timestamp + (deadlineDays * 1 days),
            active: true
        });
        
        // Transfer tokens from sponsor
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        
        // If yield enabled, deposit to Aave
        if (yieldEnabled && aaveLendingPool != address(0)) {
            _depositToAave(token, amount);
        }
        
        emit EscrowCreated(projectId, milestoneId, msg.sender, token, amount, yieldEnabled);
    }
    
    /**
     * @notice Add more funds to existing escrow
     */
    function depositToEscrow(
        string calldata projectId,
        string calldata milestoneId,
        uint256 amount
    ) external nonReentrant {
        EscrowPool storage pool = escrowPools[projectId][milestoneId];
        
        require(pool.active, "Escrow not active");
        require(pool.sponsor == msg.sender, "Only sponsor can deposit");
        require(amount > 0, "Amount must be positive");
        
        pool.totalDeposited += amount;
        
        // Transfer tokens
        IERC20(pool.token).safeTransferFrom(msg.sender, address(this), amount);
        
        // Deposit to Aave if enabled
        if (pool.yieldEnabled && aaveLendingPool != address(0)) {
            _depositToAave(pool.token, amount);
        }
        
        emit FundsDeposited(projectId, milestoneId, msg.sender, amount);
    }
    
    /**
     * @notice Pay contributor for completed submilestone
     * @param projectId Project identifier
     * @param milestoneId Milestone identifier
     * @param submilestoneId Submilestone identifier
     * @param contributor Contributor address
     * @param amount Payment amount
     * @param proof Merkle proof
     */
    function payContributor(
        string calldata projectId,
        string calldata milestoneId,
        string calldata submilestoneId,
        address contributor,
        uint256 amount,
        bytes32[] calldata proof
    ) external nonReentrant {
        EscrowPool storage pool = escrowPools[projectId][milestoneId];
        
        require(pool.active, "Escrow not active");
        require(pool.sponsor == msg.sender, "Only sponsor can pay");
        require(contributor != address(0), "Invalid contributor");
        require(amount > 0, "Amount must be positive");
        
        // Verify submilestone against Merkle root
        bool valid = merkleStorage.verifySubmilestone(
            projectId,
            milestoneId,
            submilestoneId,
            amount,
            proof
        );
        require(valid, "Invalid Merkle proof");
        
        // Check if already paid
        require(
            contributorPayments[projectId][milestoneId][submilestoneId][contributor] == 0,
            "Already paid"
        );
        
        // Check sufficient balance
        uint256 available = pool.totalDeposited + pool.yieldGenerated - pool.totalPaid;
        require(available >= amount, "Insufficient escrow balance");
        
        // Record payment
        contributorPayments[projectId][milestoneId][submilestoneId][contributor] = amount;
        pool.totalPaid += amount;
        
        // Withdraw from Aave if needed
        if (pool.yieldEnabled && aaveLendingPool != address(0)) {
            _withdrawFromAave(pool.token, amount);
        }
        
        // Transfer to contributor
        IERC20(pool.token).safeTransfer(contributor, amount);
        
        emit ContributorPaid(projectId, milestoneId, submilestoneId, contributor, amount);
    }
    
    /**
     * @notice Harvest yield from Aave
     */
    function harvestYield(
        string calldata projectId,
        string calldata milestoneId
    ) external nonReentrant {
        EscrowPool storage pool = escrowPools[projectId][milestoneId];
        
        require(pool.active, "Escrow not active");
        require(pool.yieldEnabled, "Yield not enabled");
        require(aaveLendingPool != address(0), "Aave not configured");
        
        // Calculate yield (simplified - in production, query Aave for exact amount)
        uint256 currentBalance = IERC20(pool.token).balanceOf(address(this));
        uint256 expectedBalance = pool.totalDeposited - pool.totalPaid;
        
        if (currentBalance > expectedBalance) {
            uint256 yield = currentBalance - expectedBalance;
            pool.yieldGenerated += yield;
            
            emit YieldHarvested(projectId, milestoneId, yield);
        }
    }
    
    /**
     * @notice Close escrow and return unclaimed funds to sponsor
     * @dev Can only be called after deadline
     */
    function closeEscrow(
        string calldata projectId,
        string calldata milestoneId
    ) external nonReentrant {
        EscrowPool storage pool = escrowPools[projectId][milestoneId];
        
        require(pool.active, "Already closed");
        require(pool.sponsor == msg.sender, "Only sponsor can close");
        require(block.timestamp >= pool.deadline, "Deadline not reached");
        
        uint256 remaining = pool.totalDeposited + pool.yieldGenerated - pool.totalPaid;
        
        pool.active = false;
        
        if (remaining > 0) {
            // Withdraw from Aave if needed
            if (pool.yieldEnabled && aaveLendingPool != address(0)) {
                _withdrawFromAave(pool.token, remaining);
            }
            
            // Return to sponsor
            IERC20(pool.token).safeTransfer(pool.sponsor, remaining);
        }
        
        emit EscrowClosed(projectId, milestoneId, remaining);
    }
    
    /**
     * @notice Get escrow pool details
     */
    function getEscrowPool(
        string calldata projectId,
        string calldata milestoneId
    ) external view returns (EscrowPool memory) {
        return escrowPools[projectId][milestoneId];
    }
    
    /**
     * @notice Get available balance in escrow
     */
    function getAvailableBalance(
        string calldata projectId,
        string calldata milestoneId
    ) external view returns (uint256) {
        EscrowPool storage pool = escrowPools[projectId][milestoneId];
        return pool.totalDeposited + pool.yieldGenerated - pool.totalPaid;
    }
    
    /**
     * @notice Check if contributor was paid
     */
    function isContributorPaid(
        string calldata projectId,
        string calldata milestoneId,
        string calldata submilestoneId,
        address contributor
    ) external view returns (bool) {
        return contributorPayments[projectId][milestoneId][submilestoneId][contributor] > 0;
    }
    
    /**
     * @notice Deposit to Aave lending pool (simplified)
     * @dev In production, use proper Aave integration
     */
    function _depositToAave(address token, uint256 amount) internal {
        // TODO: Implement actual Aave deposit
        // ILendingPool(aaveLendingPool).deposit(token, amount, address(this), 0);
    }
    
    /**
     * @notice Withdraw from Aave lending pool (simplified)
     * @dev In production, use proper Aave integration
     */
    function _withdrawFromAave(address token, uint256 amount) internal {
        // TODO: Implement actual Aave withdrawal
        // ILendingPool(aaveLendingPool).withdraw(token, amount, address(this));
    }
    
    /**
     * @notice Update Aave lending pool address
     */
    function setAaveLendingPool(address _aaveLendingPool) external onlyOwner {
        aaveLendingPool = _aaveLendingPool;
    }
}
