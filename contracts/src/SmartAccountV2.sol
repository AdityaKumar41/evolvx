// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IEntryPoint.sol";
import "./SessionKeyRegistry.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";

/**
 * @title SmartAccountV2
 * @notice ERC-4337 compatible smart account with session key support
 * @dev Supports gasless micropayments via session keys - NO popups after setup
 */
contract SmartAccountV2 is Initializable {
    using ECDSA for bytes32;
    
    address public owner;
    IEntryPoint public immutable entryPoint;
    SessionKeyRegistry public sessionKeyRegistry;
    
    uint256 private _nonce;
    
    event SmartAccountInitialized(address indexed owner, address indexed entryPoint);
    event SessionKeyRegistryUpdated(address indexed oldRegistry, address indexed newRegistry);
    event Executed(address indexed target, uint256 value, bytes data);
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }
    
    modifier onlyEntryPoint() {
        require(msg.sender == address(entryPoint), "Only EntryPoint");
        _;
    }
    
    constructor(address _entryPoint) {
        require(_entryPoint != address(0), "Invalid EntryPoint");
        entryPoint = IEntryPoint(_entryPoint);
    }
    
    /**
     * @notice Initialize smart account
     * @param _owner Owner EOA address
     * @param _sessionKeyRegistry SessionKeyRegistry contract
     */
    function initialize(
        address _owner,
        address _sessionKeyRegistry
    ) external initializer {
        require(_owner != address(0), "Invalid owner");
        require(_sessionKeyRegistry != address(0), "Invalid registry");
        
        owner = _owner;
        sessionKeyRegistry = SessionKeyRegistry(_sessionKeyRegistry);
        
        emit SmartAccountInitialized(_owner, address(entryPoint));
    }
    
    /**
     * @notice Validate UserOperation signature
     * @dev Called by EntryPoint - validates either owner or session key signature
     */
    function validateUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external onlyEntryPoint returns (uint256 validationData) {
        // Pay EntryPoint if needed
        if (missingAccountFunds > 0) {
            (bool success,) = payable(msg.sender).call{value: missingAccountFunds}("");
            require(success, "Payment failed");
        }
        
        // Verify signature
        bytes32 hash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", userOpHash));
        address signer = ECDSA.recover(hash, userOp.signature);
        
        // Check if signer is owner
        if (signer == owner) {
            return 0; // Valid
        }
        
        // Check if signer is a valid session key
        if (_validateSessionKey(signer, userOp.callData)) {
            return 0; // Valid
        }
        
        return 1; // Invalid
    }
    
    /**
     * @notice Validate session key for micropayment
     */
    function _validateSessionKey(
        address _sessionKey,
        bytes calldata _callData
    ) internal view returns (bool) {
        // Decode callData to get target, value, data
        // Assuming callData is execute(address target, uint256 value, bytes data)
        if (_callData.length < 4) return false;
        
        bytes4 selector = bytes4(_callData[:4]);
        
        // Check if calling execute function
        if (selector != this.execute.selector) return false;
        
        // Decode execute parameters
        (address target, , bytes memory data) = abi.decode(_callData[4:], (address, uint256, bytes));
        
        // Extract function selector from nested data
        if (data.length < 4) return false;
        bytes4 functionSelector = bytes4(data);
        
        // Extract amount from chargeX402(uint256 amount, string promptId)
        uint256 amount;
        if (data.length >= 36) {
            bytes memory amountBytes = new bytes(32);
            for (uint i = 0; i < 32; i++) {
                amountBytes[i] = data[i + 4];
            }
            amount = abi.decode(amountBytes, (uint256));
        }
        
        // Validate session key via registry
        return sessionKeyRegistry.validateSessionKey(
            address(this),
            _sessionKey,
            target,
            functionSelector,
            amount
        );
    }
    
    /**
     * @notice Execute a transaction
     * @dev Called by EntryPoint after validation
     */
    function execute(
        address target,
        uint256 value,
        bytes calldata data
    ) external onlyEntryPoint returns (bytes memory) {
        require(target != address(0), "Invalid target");
        
        (bool success, bytes memory result) = target.call{value: value}(data);
        require(success, "Execution failed");
        
        // Record session key usage if applicable
        _recordSessionKeyUsage(data);
        
        emit Executed(target, value, data);
        return result;
    }
    
    /**
     * @notice Record session key usage in registry
     */
    function _recordSessionKeyUsage(bytes calldata data) internal {
        // Extract amount from chargeX402(uint256 amount, string promptId)
        if (data.length >= 36) {
            bytes4 selector = bytes4(data[:4]);
            if (selector == bytes4(keccak256("chargeX402(uint256,string)"))) {
                uint256 amount = abi.decode(data[4:36], (uint256));
                
                // Get session key from current UserOp (stored in context)
                // For simplicity, we'll track this separately
                // In production, extract from UserOp signature
                
                // sessionKeyRegistry.recordUsage(sessionKey, amount);
            }
        }
    }
    
    /**
     * @notice Register a session key
     * @dev Called by owner via EntryPoint or directly
     */
    function registerSessionKey(
        address _sessionKey,
        uint256 _maxSpendPerPrompt,
        uint256 _maxTotalSpend,
        uint256 _validDuration,
        address _allowedContract,
        bytes4 _allowedFunction
    ) external onlyOwner {
        sessionKeyRegistry.registerSessionKey(
            _sessionKey,
            _maxSpendPerPrompt,
            _maxTotalSpend,
            _validDuration,
            _allowedContract,
            _allowedFunction
        );
    }
    
    /**
     * @notice Revoke a session key
     */
    function revokeSessionKey(address _sessionKey) external onlyOwner {
        sessionKeyRegistry.revokeSessionKey(_sessionKey);
    }
    
    /**
     * @notice Update session key registry
     */
    function updateSessionKeyRegistry(address _newRegistry) external onlyOwner {
        require(_newRegistry != address(0), "Invalid registry");
        address oldRegistry = address(sessionKeyRegistry);
        sessionKeyRegistry = SessionKeyRegistry(_newRegistry);
        emit SessionKeyRegistryUpdated(oldRegistry, _newRegistry);
    }
    
    /**
     * @notice Withdraw funds
     */
    function withdrawTo(address payable _to, uint256 _amount) external onlyOwner {
        require(_to != address(0), "Invalid recipient");
        (bool success,) = _to.call{value: _amount}("");
        require(success, "Withdrawal failed");
    }
    
    /**
     * @notice Get nonce
     */
    function getNonce() external view returns (uint256) {
        return _nonce;
    }
    
    receive() external payable {}
}
