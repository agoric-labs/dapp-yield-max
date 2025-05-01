// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
// import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockAavePool
 * @dev A simplified mock of Aave V3 Pool contract for local testing
 * Mimics the Aave V3 Pool interface for supply, withdraw, and rate inquiries
 */
contract MockAavePool is Ownable {
    using SafeERC20 for IERC20;

    // Reserve data structure similar to Aave's
    struct ReserveData {
        uint256 liquidityIndex;
        uint256 currentLiquidityRate;
        uint256 variableBorrowIndex;
        uint256 currentVariableBorrowRate;
        uint256 currentStableBorrowRate;
        uint256 lastUpdateTimestamp;
        address aTokenAddress;
        address stableDebtTokenAddress;
        address variableDebtTokenAddress;
        address interestRateStrategyAddress;
    }

    // Mapping of asset address to reserve data
    mapping(address => ReserveData) internal _reserves;
    
    // User account data structure
    struct UserAccountData {
        uint256 totalCollateralBase;
        uint256 totalDebtBase;
        uint256 availableBorrowsBase;
        uint256 currentLiquidationThreshold;
        uint256 ltv;
        uint256 healthFactor;
    }
    
    // For simplicity, we'll maintain our own records of deposits
    mapping(address => mapping(address => uint256)) private _userDeposits; // user -> token -> amount
    mapping(address => mapping(address => uint256)) private _userDepositTimestamps; // user -> token -> timestamp
    
    // Incentives/rewards per asset
    mapping(address => uint256) private _rewardRates; // token -> rate

    // Aave-like risk parameters
    uint256 private constant HEALTH_FACTOR_LIQUIDATION_THRESHOLD = 1e18; // 1.0
    uint256 private constant LTV_PRECISION = 10000; // 100% = 10000

    // Mock aToken balances
    mapping(address => mapping(address => uint256)) private _aTokenBalances; // user -> token -> amount
    
    // Events (matching Aave's events)
    event Supply(
        address indexed reserve,
        address user,
        address indexed onBehalfOf,
        uint256 amount,
        uint16 indexed referralCode
    );
    
    event Withdraw(
        address indexed reserve,
        address indexed user,
        address indexed to,
        uint256 amount
    );
    
    event ReserveDataUpdated(
        address indexed reserve,
        uint256 liquidityRate,
        uint256 stableBorrowRate,
        uint256 variableBorrowRate
    );

    constructor() Ownable(msg.sender) {}

    /**
     * @dev Set the reserve data for a token
     * @param asset The asset address
     * @param liquidityRate Supply interest rate in ray units (1% = 1e25)
     * @param rewardRate Reward rate in basis points (1% = 100)
     */
    function setReserveData(
        address asset, 
        uint256 liquidityRate,
        uint256 variableBorrowRate,
        uint256 stableBorrowRate,
        uint256 rewardRate
    ) external onlyOwner {
        _reserves[asset].currentLiquidityRate = liquidityRate;
        _reserves[asset].currentVariableBorrowRate = variableBorrowRate;
        _reserves[asset].currentStableBorrowRate = stableBorrowRate;
        _reserves[asset].lastUpdateTimestamp = block.timestamp;
        _reserves[asset].liquidityIndex = 1e27; // Start at 1.0 in ray
        _reserves[asset].variableBorrowIndex = 1e27; // Start at 1.0 in ray
        
        // Set mock token addresses to non-zero
        if (_reserves[asset].aTokenAddress == address(0)) {
            _reserves[asset].aTokenAddress = address(uint160(uint256(keccak256(abi.encodePacked("aToken", asset)))));
            _reserves[asset].stableDebtTokenAddress = address(uint160(uint256(keccak256(abi.encodePacked("stableDebt", asset)))));
            _reserves[asset].variableDebtTokenAddress = address(uint160(uint256(keccak256(abi.encodePacked("variableDebt", asset)))));
            _reserves[asset].interestRateStrategyAddress = address(uint160(uint256(keccak256(abi.encodePacked("interestRateStrategy", asset)))));
        }
        
        // Set reward rate
        _rewardRates[asset] = rewardRate;
        
        emit ReserveDataUpdated(asset, liquidityRate, stableBorrowRate, variableBorrowRate);
    }

    /**
     * @dev Supply assets to the Aave protocol (Aave v3 compatible signature)
     * @param asset The address of the underlying asset
     * @param amount The amount to supply
     * @param onBehalfOf The address that will receive the aTokens
     * @param referralCode Referral code for potential rewards
     */
    function supply(
        address asset,
        uint256 amount,
        address onBehalfOf,
        uint16 referralCode
    ) external {
        require(amount > 0, "Amount must be greater than 0");
        
        // Transfer tokens from user
        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
        
        // Update deposit records
        _userDeposits[onBehalfOf][asset] += amount;
        _userDepositTimestamps[onBehalfOf][asset] = block.timestamp;
        _aTokenBalances[onBehalfOf][asset] += amount;
        
        emit Supply(asset, msg.sender, onBehalfOf, amount, referralCode);
    }

    /**
     * @dev Withdraw assets from the Aave protocol (Aave v3 compatible signature)
     * @param asset The address of the underlying asset
     * @param amount The amount to withdraw (use type(uint256).max for max)
     * @param to The recipient of the withdrawal
     * @return The actual amount withdrawn
     */
    function withdraw(
        address asset,
        uint256 amount,
        address to
    ) external returns (uint256) {
        address user = msg.sender;
        uint256 userBalance = _aTokenBalances[user][asset];
        
        // Handle withdrawal of entire balance
        if (amount == type(uint256).max) {
            amount = userBalance;
        }
        
        require(amount > 0, "Amount must be greater than 0");
        require(userBalance >= amount, "Not enough balance");
        
        // Calculate accrued interest
        uint256 interest = _calculateAccruedInterest(user, asset);
        uint256 totalToWithdraw = amount + interest;
        
        // Update deposit records
        _aTokenBalances[user][asset] -= amount;
        if (_aTokenBalances[user][asset] == 0) {
            _userDeposits[user][asset] = 0;
        } else {
            _userDeposits[user][asset] -= amount;
            // Reset timestamp for remaining balance
            _userDepositTimestamps[user][asset] = block.timestamp;
        }
        
        // Transfer tokens to specified recipient (including interest)
        IERC20(asset).safeTransfer(to, totalToWithdraw);
        
        emit Withdraw(asset, user, to, totalToWithdraw);
        
        return totalToWithdraw;
    }

    /**
     * @dev Get the user account data across all reserves
     * @param user The user address
     * @return totalCollateralBase The total collateral in base currency
     * @return totalDebtBase The total debt in base currency
     * @return availableBorrowsBase The available borrowing capacity in base currency
     * @return currentLiquidationThreshold The liquidation threshold
     * @return ltv The loan to value ratio
     * @return healthFactor The health factor
     */
    function getUserAccountData(address user) external view returns (
        uint256 totalCollateralBase,
        uint256 totalDebtBase,
        uint256 availableBorrowsBase,
        uint256 currentLiquidationThreshold,
        uint256 ltv,
        uint256 healthFactor
    ) {
        // For this mock, we'll just return a healthy account with some dummy values
        totalCollateralBase = 0;
        totalDebtBase = 0;
        
        // Sum up all deposits across all assets (simplified for mock)
        address[] memory allAssets = _getAllConfiguredReserves();
        for (uint i = 0; i < allAssets.length; i++) {
            address asset = allAssets[i];
            uint256 balance = _aTokenBalances[user][asset];
            if (balance > 0) {
                // In a real implementation, we would convert to base currency
                // For simplicity, we're just adding up raw balances
                totalCollateralBase += balance;
            }
        }
        
        // Set default values for a healthy account
        currentLiquidationThreshold = 8000; // 80%
        ltv = 7500; // 75%
        availableBorrowsBase = totalCollateralBase * ltv / LTV_PRECISION;
        
        // Health factor (> 1 is healthy)
        healthFactor = totalDebtBase > 0 
            ? (totalCollateralBase * currentLiquidationThreshold / LTV_PRECISION) * 1e18 / totalDebtBase
            : type(uint256).max; // Max value if no debt
            
        return (
            totalCollateralBase,
            totalDebtBase,
            availableBorrowsBase,
            currentLiquidationThreshold,
            ltv,
            healthFactor
        );
    }

    /**
     * @dev Get the reserve data for a specific asset
     * @param asset The asset address
     * @return The reserve data structure
     */
    function getReserveData(address asset) external view returns (ReserveData memory) {
        return _reserves[asset];
    }

    /**
     * @dev Get the normalized income of the reserve
     * @param asset The asset address
     * @return The normalized income, expressed in ray
     */
    function getReserveNormalizedIncome(address asset) external view returns (uint256) {
        // In Aave, this represents how much 1 unit of the asset has grown organically due to interest
        // For simplicity in our mock, we'll calculate this based on the liquidity rate
        uint256 lastUpdateTimestamp = _reserves[asset].lastUpdateTimestamp;
        if (lastUpdateTimestamp == 0) return 1e27; // Ray precision, 1.0
        
        uint256 timeDelta = block.timestamp - lastUpdateTimestamp;
        uint256 liquidityRate = _reserves[asset].currentLiquidityRate;
        
        // Formula: previousIndex * (1 + rate * timeDelta)
        // where rate is in ray (27 decimals) per second
        uint256 cumulatedInterest = liquidityRate * timeDelta / 365 days;
        return _reserves[asset].liquidityIndex + cumulatedInterest;
    }

    /**
     * @dev Get the liquidity rate for an asset
     * @param asset The asset address
     * @return The current liquidity rate (APY) in ray
     */
    function getReserveLiquidityRate(address asset) external view returns (uint256) {
        return _reserves[asset].currentLiquidityRate;
    }
    
    /**
     * @dev Get aToken balance for user (matches Aave contract calls)
     * @param aTokenAddress The aToken contract address
     * @param user The user address
     * @return The aToken balance
     */
    function balanceOf(address aTokenAddress, address user) external view returns (uint256) {
        // Find which asset this aToken corresponds to
        address asset = address(0);
        address[] memory allAssets = _getAllConfiguredReserves();
        
        for (uint i = 0; i < allAssets.length; i++) {
            if (_reserves[allAssets[i]].aTokenAddress == aTokenAddress) {
                asset = allAssets[i];
                break;
            }
        }
        
        require(asset != address(0), "Invalid aToken address");
        
        // Return principal plus interest
        return _userDeposits[user][asset] + _calculateAccruedInterest(user, asset);
    }

    /**
     * @dev Claim accrued rewards for a user
     * @param asset The asset address
     * @param to The recipient of rewards
     * @return The amount of rewards claimed
     */
    function claimRewards(address asset, address to) external returns (uint256) {
        address user = msg.sender;
        uint256 rewards = _calculateAccruedRewards(user, asset);
        
        // If rewards are zero, just return zero instead of reverting
        if (rewards == 0) {
            return 0;
        }
        
        // Reset timestamp for future reward calculations
        _userDepositTimestamps[user][asset] = block.timestamp;
        
        // Transfer rewards
        IERC20(asset).safeTransfer(to, rewards);
        
        return rewards;
    }
    
    /**
     * @dev Calculate pending rewards for a user
     * @param user The user address
     * @param asset The asset address
     * @return The pending rewards
     */
    function getPendingRewards(address user, address asset) external view returns (uint256) {
        return _calculateAccruedRewards(user, asset);
    }
    
    /**
     * @dev Calculate pending interest for a user
     * @param user The user address
     * @param asset The asset address
     * @return The pending interest
     */
    function getAccruedInterest(address user, address asset) external view returns (uint256) {
        return _calculateAccruedInterest(user, asset);
    }

    /**
     * @dev Internal function to calculate accrued interest
     * @param user The user address
     * @param asset The asset address
     * @return The accrued interest
     */
    function _calculateAccruedInterest(address user, address asset) internal view returns (uint256) {
        uint256 depositAmount = _userDeposits[user][asset];
        uint256 depositTime = _userDepositTimestamps[user][asset];
        uint256 liquidityRate = _reserves[asset].currentLiquidityRate;
        
        if (depositAmount == 0 || depositTime == 0 || liquidityRate == 0) {
            return 0;
        }
        
        // Calculate time elapsed since deposit in seconds
        uint256 timeElapsed = block.timestamp - depositTime;
        
        // Convert liquidity rate from ray (27 decimals) to decimal
        // Ray is 1e27, so divide by 1e27 to get the decimal value
        uint256 ratePerSecond = liquidityRate / 1e27 / 365 days;
        
        // Calculate interest: principal * rate * time
        uint256 interest = depositAmount * ratePerSecond * timeElapsed;
        
        return interest;
    }

    /**
     * @dev Internal function to calculate accrued rewards
     * @param user The user address
     * @param asset The asset address
     * @return The accrued rewards
     */
    function _calculateAccruedRewards(address user, address asset) internal view returns (uint256) {
        uint256 depositAmount = _userDeposits[user][asset];
        uint256 depositTime = _userDepositTimestamps[user][asset];
        uint256 rewardRate = _rewardRates[asset];
        
        
        if (depositAmount == 0 || depositTime == 0 || rewardRate == 0) {
            return 0;
        }
        
        // Calculate time elapsed since deposit in seconds
        uint256 timeElapsed = block.timestamp - depositTime;
        
        // Convert reward rate from basis points to per-second rate
        // Original calculation: uint256 ratePerSecond = rewardRate * 1e18 / (10000 * 365 days);
        
        // Simulate reward rate as "percentage per year" in basis points
// Multiply by 1e18 to keep precision
uint256 ratePerSecond = rewardRate * 1e18 / (10000 * 365 days);

// Final formula: scale back down
uint256 rewards = (depositAmount * ratePerSecond * timeElapsed) / 1e18;

        
        return rewards;
    }
    
    /**
     * @dev Internal function to get all configured reserves
     * @return An array of asset addresses
     */
    function _getAllConfiguredReserves() internal view returns (address[] memory) {
        // For simplicity, we'll maintain a list in memory for the mock
        // In production, this would be stored and updated when assets are added
        
        // This is a simplistic implementation
        // In a real implementation, you'd maintain an array of active reserves
        address[] memory reserves = new address[](5); // Arbitrary size for example
        
        // This is just for the mock to work - in a real implementation, 
        // you'd track all added reserves
        uint count = 0;
        
        // This is just a basic example and wouldn't be practical in production
        for (uint160 i = 1; i <= 5; i++) {
            address potentialAsset = address(i);
            if (_reserves[potentialAsset].aTokenAddress != address(0)) {
                reserves[count] = potentialAsset;
                count++;
            }
        }
        
        // Create properly sized array with only valid entries
        address[] memory result = new address[](count);
        for (uint i = 0; i < count; i++) {
            result[i] = reserves[i];
        }
        
        return result;
    }

    function debugRewardComponents(address user, address asset) external view returns (
    uint256 depositAmount,
    uint256 depositTime,
    uint256 timeElapsed,
    uint256 rewardRate,
    uint256 ratePerSecond,
    uint256 rewards
) {
    depositAmount = _userDeposits[user][asset];
    depositTime = _userDepositTimestamps[user][asset];
    rewardRate = _rewardRates[asset];

    timeElapsed = block.timestamp - depositTime;

    // Match the reward formula exactly
    ratePerSecond = rewardRate * 1e18 / (10000 * 365 days);
    rewards = (depositAmount * ratePerSecond * timeElapsed) / 1e18;

    return (depositAmount, depositTime, timeElapsed, rewardRate, ratePerSecond, rewards);
}

}
