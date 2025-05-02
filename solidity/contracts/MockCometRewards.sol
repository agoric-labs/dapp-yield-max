// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IMintableERC20 {
    function mint(address to, uint256 amount) external;
}

interface IMockComet {
    function accrueAccount(address account) external;

    function accruedRewards(address account) external view returns (uint256);

    function resetRewards(address account) external;
}

contract MockCometRewards {
    address public rewardToken;

    constructor(address _rewardToken) {
        rewardToken = _rewardToken;
    }

    // Transactional (to be awaited separately)
    function accrueAndTrack(address comet, address account) external {
        IMockComet(comet).accrueAccount(account);
    }

    // Pure data getter
    function getRewardOwed(
        address comet,
        address account
    ) external view returns (address token, uint256 owed) {
        owed = IMockComet(comet).accruedRewards(account);
        return (rewardToken, owed);
    }

    function claim(address comet, address src, bool /*shouldAccrue*/) external {
        IMockComet(comet).accrueAccount(src);
        uint256 reward = IMockComet(comet).accruedRewards(src);
        require(reward > 0, 'No rewards');

        IMockComet(comet).resetRewards(src);
        IMintableERC20(rewardToken).mint(src, reward);
    }
}
