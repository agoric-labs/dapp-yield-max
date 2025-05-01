// @ts-check
const { expect } = require('chai');
const { ethers, network } = require('hardhat');

describe('MockAave', function () {
  let mockAavePool;
  let token, deployer, user;
  let timeTravel;

  
  before(async function () {
    [deployer, user] = await ethers.getSigners();

    // Ensure the contract is compiled
    await hre.run('compile');

    // Deploy MockAavePool
    const MockAavePool = await ethers.getContractFactory('MockAavePool');
    mockAavePool = await MockAavePool.deploy();
    await mockAavePool.waitForDeployment();

    // Deploy mock token using MintableERC20
    const MintableERC20 = await ethers.getContractFactory('MintableERC20');
    token = await MintableERC20.deploy("Mock DAI", "mDAI");
    await token.waitForDeployment();

    // Mint tokens to deployer for testing
    await token.mint(deployer.address, ethers.parseEther("1000"));

    // Set up time travel function
    timeTravel = async (seconds) => {
      await network.provider.send("evm_increaseTime", [seconds]);
      await network.provider.send("evm_mine", []);
    };
  });

  describe('Basic Mock Aave functionality', function () {
    it('should set reserve data correctly', async function () {
      await mockAavePool.setReserveData(
        token.target,  // Use .target instead of .address for ethers v6
        ethers.parseUnits("0.05", 27), // 5% liquidity rate
        ethers.parseUnits("0.07", 27), // 7% variable borrow rate
        ethers.parseUnits("0.06", 27), // 6% stable borrow rate
        100                            // 1% reward rate (in basis points)
      );

      const reserveData = await mockAavePool.getReserveData(token.target);
      expect(reserveData.currentLiquidityRate).to.equal(ethers.parseUnits("0.05", 27));
      expect(reserveData.currentVariableBorrowRate).to.equal(ethers.parseUnits("0.07", 27));
      expect(reserveData.currentStableBorrowRate).to.equal(ethers.parseUnits("0.06", 27));
    });

    it('should supply tokens correctly', async function () {
      const amount = ethers.parseEther("500");
      
      // Approve tokens for MockAavePool contract
      await token.approve(mockAavePool.target, amount);
      
      // Initial balance check
      const initialBalance = await token.balanceOf(deployer.address);
      
      // Supply tokens directly to the pool
      await mockAavePool.supply(token.target, amount, deployer.address, 0);
      
      // Check token balance has decreased
      const finalBalance = await token.balanceOf(deployer.address);
      expect(initialBalance - finalBalance).to.equal(amount);
      
      // Check accrued interest is 0 at first
      const accrued = await mockAavePool.getAccruedInterest(deployer.address, token.target);
      expect(accrued).to.equal(0);
    });


    it('should accrue and claim rewards', async function () {
      // Time travel another 30 days forward for more rewards
      await timeTravel(30 * 24 * 60 * 60);
      
      // Check pending rewards
      const pendingRewards = await mockAavePool.getPendingRewards(deployer.address, token.target);
      expect(pendingRewards).to.be.gt(0);
      
      // Record user balance before claiming
      const balanceBefore = await token.balanceOf(user.address);
      
      // Claim rewards to user address
      await mockAavePool.claimRewards(token.target, user.address);
      
      // Check balance after claiming
      const balanceAfter = await token.balanceOf(user.address);
      
      // Verify that rewards were claimed
      const claimed = balanceAfter - balanceBefore;
      expect(claimed).to.be.gt(0);
    });

    it('should handle withdrawing all funds', async function () {
      // Add debug information
      console.log("\n=== DEBUG INFORMATION ===");
      
      // Get reserve data and aToken address
      const reserveData = await mockAavePool.getReserveData(token.target);
      console.log("Token address:", token.target);
      console.log("aToken address from reserveData:", reserveData.aTokenAddress);
      
      // Get all configured reserves to check if our token is properly registered
      // We'll call the debugRewardComponents function to see key values
      const debugInfo = await mockAavePool.debugRewardComponents(deployer.address, token.target);
      console.log("Debug components for user deposits:");
      console.log("- Deposit amount:", ethers.formatEther(debugInfo.depositAmount));
      console.log("- Deposit time:", debugInfo.depositTime.toString());
      console.log("- Time elapsed:", debugInfo.timeElapsed.toString());
      console.log("- Reward rate:", debugInfo.rewardRate.toString());
      
      // Record user balance before withdrawal
      const balanceBefore = await token.balanceOf(user.address);
      console.log("User balance before withdrawal:", ethers.formatEther(balanceBefore));
      
      // Withdraw all funds using MaxUint256 - make sure contract has enough tokens
      await token.mint(mockAavePool.target,balanceBefore);
      await mockAavePool.withdraw(token.target, ethers.MaxUint256, user.address);
      
      // Check balance after withdrawal
      const balanceAfter = await token.balanceOf(user.address);
      console.log("User balance after withdrawal:", ethers.formatEther(balanceAfter));
      const received = balanceAfter - balanceBefore;
      console.log("Amount received:", ethers.formatEther(received));
      
      // Should be at least the principal amount (500 ether) plus some interest
      expect(received).to.be.gte(ethers.parseEther("500"));
      
      // Verify that the user's deposit is now zero
      const remainingInterest = await mockAavePool.getAccruedInterest(deployer.address, token.target);
      console.log("Remaining interest:", ethers.formatEther(remainingInterest));
      expect(remainingInterest).to.equal(0);
      
      console.log("=== END DEBUG INFORMATION ===\n");
    });
  });
});