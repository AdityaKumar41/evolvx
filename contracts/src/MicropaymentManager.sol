// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title MicropaymentManager
 * @notice Handles gasless micropayments for AI prompts
 * @dev Called by SmartAccount via session keys - NO user popups
 */
contract MicropaymentManager is Ownable, ReentrancyGuard {
    // X402 token (or any ERC20 payment token)
    IERC20 public immutable paymentToken;
    
    // Platform treasury that receives payments
    address public treasury;
    
    // Minimum and maximum payment per prompt
    uint256 public minPaymentPerPrompt;
    uint256 public maxPaymentPerPrompt;
    
    // Events
    event Micropaid(
        address indexed user,
        address indexed smartAccount,
        uint256 amount,
        string promptId,
        uint256 timestamp
    );
    
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event PaymentLimitsUpdated(uint256 minPayment, uint256 maxPayment);
    
    constructor(
        address _paymentToken,
        address _treasury,
        uint256 _minPayment,
        uint256 _maxPayment
    ) Ownable(msg.sender) {
        require(_paymentToken != address(0), "Invalid token");
        require(_treasury != address(0), "Invalid treasury");
        require(_minPayment < _maxPayment, "Invalid limits");
        
        paymentToken = IERC20(_paymentToken);
        treasury = _treasury;
        minPaymentPerPrompt = _minPayment;
        maxPaymentPerPrompt = _maxPayment;
    }
    
    /**
     * @notice Charge X402 for AI prompt
     * @dev Called by SmartAccount with session key signature
     * @param amount Amount of X402 to charge (based on prompt complexity)
     * @param promptId Unique identifier for tracking
     */
    function chargeX402(uint256 amount, string calldata promptId) external nonReentrant {
        require(amount >= minPaymentPerPrompt, "Payment too low");
        require(amount <= maxPaymentPerPrompt, "Payment exceeds limit");
        require(bytes(promptId).length > 0, "Invalid promptId");
        
        // msg.sender is the SmartAccount (not the EOA)
        address smartAccount = msg.sender;
        
        // Transfer X402 from SmartAccount to treasury
        bool success = paymentToken.transferFrom(smartAccount, treasury, amount);
        require(success, "Payment failed");
        
        emit Micropaid(tx.origin, smartAccount, amount, promptId, block.timestamp);
    }
    
    /**
     * @notice Update treasury address
     */
    function updateTreasury(address _newTreasury) external onlyOwner {
        require(_newTreasury != address(0), "Invalid treasury");
        address oldTreasury = treasury;
        treasury = _newTreasury;
        emit TreasuryUpdated(oldTreasury, _newTreasury);
    }
    
    /**
     * @notice Update payment limits
     */
    function updatePaymentLimits(uint256 _min, uint256 _max) external onlyOwner {
        require(_min < _max, "Invalid limits");
        minPaymentPerPrompt = _min;
        maxPaymentPerPrompt = _max;
        emit PaymentLimitsUpdated(_min, _max);
    }
}
