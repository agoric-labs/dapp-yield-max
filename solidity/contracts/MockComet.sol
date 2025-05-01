// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function transfer(address recipient, uint256 amount) external returns (bool);
}

contract MockComet {
    address public baseAsset;

    // Collateral mapping: user -> token -> amount
    mapping(address => mapping(address => uint128)) public collateral;

    // Rewards tracking
    uint256 public baseTrackingSupplySpeed = 1e18; // 1 COMP/sec
    uint256 public baseIndexScale = 1e18;
    uint256 public baseTrackingIndex;
    uint256 public lastAccrualTimestamp;
    mapping(address => uint256) public userBaseTrackingIndex;
    mapping(address => uint256) public accruedReward;

    // Optional simulation helpers
    address[] public dummyUsers;
    uint256 public timeFactor = 30 days; // 1 second = 30 days

    event Supply(address indexed from, address indexed dst, uint256 amount);
    event Withdraw(address indexed from, address indexed to, uint256 amount);

    constructor(address _baseAsset) {
        baseAsset = _baseAsset;
        lastAccrualTimestamp = block.timestamp;
    }

    function setBaseTrackingSupplySpeed(uint256 newSpeed) external {
        baseTrackingSupplySpeed = newSpeed * 1e18; // Scale to 18 decimals
        if (newSpeed == 0) {
            uint random = uint(keccak256(abi.encodePacked(
                block.timestamp,
                block.prevrandao,
                msg.sender
             )));
             
            baseTrackingSupplySpeed = random * 1e18; // Default to 1 COMP/sec
        }
        
    }

    function supply(address asset, uint amount) external {
        accrueAccount(msg.sender);
        require(IERC20(asset).transferFrom(msg.sender, address(this), amount), "Transfer failed");
        collateral[msg.sender][asset] += uint128(amount);
        emit Supply(msg.sender, msg.sender, amount);
    }

    function withdraw(address asset, uint amount) external {
        accrueAccount(msg.sender);
        require(collateral[msg.sender][asset] >= amount, "Not enough collateral");
        collateral[msg.sender][asset] -= uint128(amount);
        require(IERC20(asset).transfer(msg.sender, amount), "Withdraw failed");
        emit Withdraw(msg.sender, msg.sender, amount);
    }

    function balanceOf(address account) external view returns (uint256) {
        return collateral[account][baseAsset];
    }

    function borrowBalanceOf(address account) external pure returns (uint256) {
        return 0;
    }

    function collateralBalanceOf(address account, address asset) external view returns (uint128) {
        return collateral[account][asset];
    }

    event DebugSkip(string reason);
    
    // Helper function to convert uint to string
    function uint2str(uint256 _i) internal pure returns (string memory) {
        if (_i == 0) {
            return "0";
        }
        uint256 j = _i;
        uint256 length;
        while (j != 0) {
            length++;
            j /= 10;
        }
        bytes memory bstr = new bytes(length);
        uint256 k = length;
        j = _i;
        while (j != 0) {
            bstr[--k] = bytes1(uint8(48 + j % 10));
            j /= 10;
        }
        return string(bstr);
    }

    function accrue() public {
        uint256 deltaTime = (block.timestamp - lastAccrualTimestamp) * timeFactor;
        if (deltaTime == 0) {
            emit DebugSkip("deltaTime == 0");
            return;
        }

        if (totalSupply() == 0) {
            emit DebugSkip("totalSupply == 0");
            return;
        }
        
        lastAccrualTimestamp = block.timestamp;

        uint256 deltaIndex = baseTrackingSupplySpeed * deltaTime / baseIndexScale;
        baseTrackingIndex += deltaIndex;
    }

    function accrueAccount(address account) public {
        accrue();

        uint256 userBalance = uint256(collateral[account][baseAsset]) * 1e12; // Scale USDC 6 → 18
        uint256 userIndex = userBaseTrackingIndex[account];
        uint256 indexDelta = baseTrackingIndex - userIndex;

        uint256 rewardDelta = userBalance * indexDelta / baseIndexScale;
        accruedReward[account] += rewardDelta;
        userBaseTrackingIndex[account] = baseTrackingIndex;
    }

    function accruedRewards(address account) external view returns (uint256) {
        return accruedReward[account];
    }

    function resetRewards(address account) external {
        accruedReward[account] = 0;
    }

    // Helpers for test setup
    function totalSupply() public view returns (uint256 total) {
        for (uint i = 0; i < dummyUsers.length; i++) {
            total += collateral[dummyUsers[i]][baseAsset]* 1e12;
        }
    }

    function trackUser(address user) external {
        dummyUsers.push(user);
    }

    function baseTokenPriceFeed() external pure returns (address) {
        return address(1); // Dummy
    }

    function baseTrackingBorrowSpeed() external pure returns (uint256) {
        return 0;
    }

    function totalBorrow() external pure returns (uint256) {
        return 0;
    }

    function getPrice(address /* priceFeed */) external pure returns (uint256) {
        return 1e8; // Return 1.0 USD
    }

    function totalSupplyView() external view returns (uint256) {
        return totalSupply();
    }
}
