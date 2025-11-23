// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SessionKeyRegistry
 * @notice Manages session keys for gasless micropayments
 * @dev Session keys can sign UserOperations without user popups
 */
contract SessionKeyRegistry {
    struct SessionKey {
        address sessionKeyAddress;  // Public key of session key
        uint256 maxSpendPerPrompt;  // Max X402 per single prompt
        uint256 maxTotalSpend;      // Total spending limit
        uint256 totalSpent;         // Track actual spending
        uint256 expiryTimestamp;    // When session key expires
        address allowedContract;    // MicropaymentManager only
        bytes4 allowedFunction;     // chargeX402 only
        bool active;                // Can be revoked
        uint256 registeredAt;
    }
    
    // smartAccount => sessionKey => SessionKey data
    mapping(address => mapping(address => SessionKey)) public sessionKeys;
    
    // smartAccount => array of session keys
    mapping(address => address[]) public accountSessionKeys;
    
    event SessionKeyRegistered(
        address indexed smartAccount,
        address indexed sessionKey,
        uint256 maxSpendPerPrompt,
        uint256 maxTotalSpend,
        uint256 expiryTimestamp,
        address allowedContract
    );
    
    event SessionKeyRevoked(
        address indexed smartAccount,
        address indexed sessionKey
    );
    
    event SessionKeyUsed(
        address indexed smartAccount,
        address indexed sessionKey,
        uint256 amount,
        uint256 totalSpent
    );
    
    /**
     * @notice Register a new session key
     * @dev Called by SmartAccount after user signs authorization
     */
    function registerSessionKey(
        address _sessionKey,
        uint256 _maxSpendPerPrompt,
        uint256 _maxTotalSpend,
        uint256 _validDuration,
        address _allowedContract,
        bytes4 _allowedFunction
    ) external {
        require(_sessionKey != address(0), "Invalid session key");
        require(_maxSpendPerPrompt > 0, "Invalid max spend");
        require(_maxTotalSpend >= _maxSpendPerPrompt, "Total < per prompt");
        require(_validDuration > 0, "Invalid duration");
        require(_allowedContract != address(0), "Invalid contract");
        
        address smartAccount = msg.sender;
        
        // Check if session key already exists
        require(!sessionKeys[smartAccount][_sessionKey].active, "Session key exists");
        
        uint256 expiryTimestamp = block.timestamp + _validDuration;
        
        sessionKeys[smartAccount][_sessionKey] = SessionKey({
            sessionKeyAddress: _sessionKey,
            maxSpendPerPrompt: _maxSpendPerPrompt,
            maxTotalSpend: _maxTotalSpend,
            totalSpent: 0,
            expiryTimestamp: expiryTimestamp,
            allowedContract: _allowedContract,
            allowedFunction: _allowedFunction,
            active: true,
            registeredAt: block.timestamp
        });
        
        accountSessionKeys[smartAccount].push(_sessionKey);
        
        emit SessionKeyRegistered(
            smartAccount,
            _sessionKey,
            _maxSpendPerPrompt,
            _maxTotalSpend,
            expiryTimestamp,
            _allowedContract
        );
    }
    
    /**
     * @notice Validate session key for UserOperation
     * @dev Called by SmartAccount before executing
     */
    function validateSessionKey(
        address _smartAccount,
        address _sessionKey,
        address _targetContract,
        bytes4 _functionSelector,
        uint256 _amount
    ) external view returns (bool) {
        SessionKey storage sk = sessionKeys[_smartAccount][_sessionKey];
        
        // Check if session key is active
        if (!sk.active) return false;
        
        // Check if expired
        if (block.timestamp > sk.expiryTimestamp) return false;
        
        // Check if target contract is allowed
        if (sk.allowedContract != _targetContract) return false;
        
        // Check if function is allowed
        if (sk.allowedFunction != _functionSelector) return false;
        
        // Check per-prompt limit
        if (_amount > sk.maxSpendPerPrompt) return false;
        
        // Check total spending limit
        if (sk.totalSpent + _amount > sk.maxTotalSpend) return false;
        
        return true;
    }
    
    /**
     * @notice Record session key usage
     * @dev Called by SmartAccount after successful execution
     */
    function recordUsage(
        address _sessionKey,
        uint256 _amount
    ) external {
        address smartAccount = msg.sender;
        SessionKey storage sk = sessionKeys[smartAccount][_sessionKey];
        
        require(sk.active, "Session key not active");
        
        sk.totalSpent += _amount;
        
        emit SessionKeyUsed(smartAccount, _sessionKey, _amount, sk.totalSpent);
    }
    
    /**
     * @notice Revoke a session key
     * @dev Can be called by SmartAccount owner
     */
    function revokeSessionKey(address _sessionKey) external {
        address smartAccount = msg.sender;
        SessionKey storage sk = sessionKeys[smartAccount][_sessionKey];
        
        require(sk.active, "Session key not active");
        
        sk.active = false;
        
        emit SessionKeyRevoked(smartAccount, _sessionKey);
    }
    
    /**
     * @notice Get session key details
     */
    function getSessionKey(
        address _smartAccount,
        address _sessionKey
    ) external view returns (SessionKey memory) {
        return sessionKeys[_smartAccount][_sessionKey];
    }
    
    /**
     * @notice Get all session keys for a smart account
     */
    function getAccountSessionKeys(address _smartAccount) external view returns (address[] memory) {
        return accountSessionKeys[_smartAccount];
    }
    
    /**
     * @notice Check if session key is valid
     */
    function isSessionKeyValid(
        address _smartAccount,
        address _sessionKey
    ) external view returns (bool) {
        SessionKey storage sk = sessionKeys[_smartAccount][_sessionKey];
        return sk.active && block.timestamp <= sk.expiryTimestamp;
    }
}
