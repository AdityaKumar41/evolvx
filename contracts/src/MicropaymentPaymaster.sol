// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IEntryPoint.sol";
import "./interfaces/IPaymaster.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MicropaymentPaymaster
 * @notice Sponsors gas for AI micropayment UserOperations
 * @dev Verifies UserOp is calling MicropaymentManager.chargeX402
 */
contract MicropaymentPaymaster is IPaymaster, Ownable {
    IEntryPoint public immutable entryPoint;
    
    // MicropaymentManager contract address
    address public micropaymentManager;
    
    // Mapping of allowed SmartAccount addresses
    mapping(address => bool) public allowedAccounts;
    
    // Gas limits
    uint256 public constant VERIFICATION_GAS_LIMIT = 100000;
    uint256 public constant POST_OP_GAS_LIMIT = 50000;
    
    event Deposited(address indexed sender, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);
    event MicropaymentManagerUpdated(address indexed oldManager, address indexed newManager);
    event AccountAllowed(address indexed account, bool allowed);
    
    constructor(
        address _entryPoint,
        address _micropaymentManager
    ) Ownable(msg.sender) {
        require(_entryPoint != address(0), "Invalid EntryPoint");
        require(_micropaymentManager != address(0), "Invalid manager");
        
        entryPoint = IEntryPoint(_entryPoint);
        micropaymentManager = _micropaymentManager;
    }
    
    /**
     * @notice Validate UserOperation before execution
     * @dev Check if calling chargeX402 on MicropaymentManager
     */
    function validatePaymasterUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 maxCost
    ) external override returns (bytes memory context, uint256 validationData) {
        require(msg.sender == address(entryPoint), "Only EntryPoint");
        
        // Decode callData to check target contract and function
        (address target, , bytes memory data) = _decodeCallData(userOp.callData);
        
        // Verify target is MicropaymentManager
        require(target == micropaymentManager, "Invalid target contract");
        
        // Verify function is chargeX402
        bytes4 selector = bytes4(data);
        require(selector == bytes4(keccak256("chargeX402(uint256,string)")), "Invalid function");
        
        // Optional: Check if account is allowed (for whitelist mode)
        // require(allowedAccounts[userOp.sender] || allowedAccounts[address(0)], "Account not allowed");
        
        // Return success (validationData = 0 means valid)
        return ("", 0);
    }
    
    /**
     * @notice Post-operation handler (optional)
     */
    function postOp(
        PostOpMode mode,
        bytes calldata context,
        uint256 actualGasCost,
        uint256 actualUserOpFeePerGas
    ) external override {
        // No post-op logic needed for micropayments
        // Gas is already sponsored
    }
    
    /**
     * @notice Decode callData to extract target and function
     */
    function _decodeCallData(bytes calldata callData) internal pure returns (
        address target,
        uint256 value,
        bytes memory data
    ) {
        // Assuming SmartAccount.execute(address,uint256,bytes)
        // callData format: execute(target, value, data)
        require(callData.length >= 4, "Invalid callData");
        
        // Skip first 4 bytes (function selector)
        // Then decode (address, uint256, bytes)
        (target, value, data) = abi.decode(callData[4:], (address, uint256, bytes));
    }
    
    /**
     * @notice Deposit ETH for gas sponsorship
     */
    function deposit() external payable {
        require(msg.value > 0, "Must send ETH");
        entryPoint.depositTo{value: msg.value}(address(this));
        emit Deposited(msg.sender, msg.value);
    }
    
    /**
     * @notice Withdraw ETH from EntryPoint
     */
    function withdrawTo(address payable _to, uint256 _amount) external onlyOwner {
        entryPoint.withdrawTo(_to, _amount);
        emit Withdrawn(_to, _amount);
    }
    
    /**
     * @notice Update MicropaymentManager address
     */
    function updateMicropaymentManager(address _newManager) external onlyOwner {
        require(_newManager != address(0), "Invalid manager");
        address oldManager = micropaymentManager;
        micropaymentManager = _newManager;
        emit MicropaymentManagerUpdated(oldManager, _newManager);
    }
    
    /**
     * @notice Allow/disallow specific SmartAccount (optional whitelist)
     */
    function setAccountAllowed(address _account, bool _allowed) external onlyOwner {
        allowedAccounts[_account] = _allowed;
        emit AccountAllowed(_account, _allowed);
    }
    
    /**
     * @notice Get paymaster balance in EntryPoint
     */
    function getDeposit() external view returns (uint256) {
        return entryPoint.balanceOf(address(this));
    }
    
    receive() external payable {
        entryPoint.depositTo{value: msg.value}(address(this));
    }
}
