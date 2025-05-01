// @ts-check
const { expect } = require('chai');
const { ethers, network } = require('hardhat');

describe('MockCompound', function () {
  let mockComet, mockCometRewards;
  let usdcToken, compToken;
  let deployer, user;
  let timeTravel;

  beforeEach(async function () {
    [deployer, user] = await ethers.getSigners();

    // Set up time travel function
    timeTravel = async (seconds) => {
      await network.provider.send('evm_increaseTime', [seconds]);
      await network.provider.send('evm_mine', []);
    };

    // Ensure the contract is compiled
    await hre.run('compile');

    // Deploy mock tokens
    const MintableERC20 = await ethers.getContractFactory('MintableERC20');
    usdcToken = await MintableERC20.deploy('USDC', 'USDC');
    compToken = await MintableERC20.deploy('Compound', 'COMP');

    // Deploy MockComet
    const MockComet = await ethers.getContractFactory('MockComet');
    mockComet = await MockComet.deploy(usdcToken.target);

    // Deploy MockCometRewards
    const MockCometRewards =
      await ethers.getContractFactory('MockCometRewards');
    mockCometRewards = await MockCometRewards.deploy(compToken.target);

    usdcToken = await MintableERC20.deploy('USDC', 'USDC');
    await usdcToken.waitForDeployment();
    console.log('USDC Token deployed at:', usdcToken.target);

    compToken = await MintableERC20.deploy('Compound', 'COMP');
    await compToken.waitForDeployment();
    console.log('COMP Token deployed at:', compToken.target);

    mockComet = await MockComet.deploy(usdcToken.target);
    await mockComet.waitForDeployment();
    console.log('MockComet deployed at:', mockComet.target);

    mockCometRewards = await MockCometRewards.deploy(compToken.target);
    await mockCometRewards.waitForDeployment();
    console.log('MockCometRewards deployed at:', mockCometRewards.target);

    // Mint USDC to deployer
    await usdcToken.mint(deployer.address, ethers.parseUnits('100000', 6));
  });

  describe('Basic Mock Compound functionality', function () {
    it('should allow depositing USDC into Comet', async function () {
      const supplyAmount = ethers.parseUnits('500', 6);

      // Approve Comet to spend USDC
      await usdcToken.approve(mockComet.address, supplyAmount);

      // Track user for reward simulation
      await mockComet.trackUser(deployer.address);

      // Initial balances
      const initialUsdcBalance = await usdcToken.balanceOf(deployer.address);
      const initialCometBalance = await mockComet.balanceOf(deployer.address);

      // Supply USDC to Comet
      await mockComet.supply(usdcToken.address, supplyAmount);

      // Check balances after supply
      const finalUsdcBalance = await usdcToken.balanceOf(deployer.address);
      const finalCometBalance = await mockComet.balanceOf(deployer.address);

      expect(initialUsdcBalance - finalUsdcBalance).to.equal(supplyAmount);
      expect(finalCometBalance - initialCometBalance).to.equal(supplyAmount);
    });

    it('should set and track reward speeds', async function () {
      // Set reward speed (COMP tokens per second)
      const rewardSpeed = 20000;
      await mockComet.setBaseTrackingSupplySpeed(rewardSpeed);

      // Force update the rewards state
      await mockComet.accrue();
      await mockComet.accrueAccount(deployer.address);

      // Initial reward state
      const initialRewards = await mockComet.accruedRewards(deployer.address);
      expect(initialRewards).to.equal(0);
    });

    it('should accrue rewards over time', async function () {
      // Time travel to accrue rewards (simulating 300 seconds = 9000 days with 30 day timeFactor)
      await timeTravel(300);

      await mockComet.setBaseTrackingSupplySpeed(20000);
      await mockComet.trackUser(deployer.address);
      const supplyAmount = ethers.parseUnits('500', 6);
      await usdcToken.approve(mockComet.target, supplyAmount);
      await mockComet.supply(usdcToken.target, supplyAmount);
      // Force update of reward accrual
      await mockComet.accrue();
      await mockComet.accrueAccount(deployer.address);

      // Check accrued rewards
      const accruedRewards = await mockComet.accruedRewards(deployer.address);
      expect(accruedRewards).to.be.gt(0);
    });

    it('should calculate rewards correctly based on deposit amount and time', async function () {
      // Get user's deposit
      const userDeposit = await mockComet.balanceOf(deployer.address);
      expect(userDeposit).to.equal(ethers.parseUnits('500', 6));

      // Time travel more to accrue additional rewards
      await timeTravel(10);

      // Get rewards owed via CometRewards contract
      const [rewardToken, owed] =
        await mockCometRewards.callStatic.getRewardOwed(
          mockComet.target,
          deployer.address,
        );

      // Verify reward token is COMP
      expect(rewardToken).to.equal(compToken.address);

      // Verify rewards are greater than zero
      expect(owed).to.be.gt(0);
    });

    it('should allow claiming rewards', async function () {
      // Initial COMP balance
      const initialCompBalance = await compToken.balanceOf(deployer.address);
      expect(initialCompBalance).to.equal(0);

      // Claim rewards
      await mockCometRewards.claim(mockComet.address, deployer.address, true);

      // Final COMP balance
      const finalCompBalance = await compToken.balanceOf(deployer.address);

      // Verify rewards were received
      expect(finalCompBalance).to.be.gt(initialCompBalance);

      // Verify rewards were reset
      const remainingRewards = await mockComet.accruedRewards(deployer.address);
      expect(remainingRewards).to.equal(0);
    });

    it('should allow withdrawing funds from Comet', async function () {
      // Get user balance in Comet
      const userBalance = await mockComet.balanceOf(deployer.address);
      expect(userBalance).to.be.gt(0);

      // Initial USDC balance
      const initialUsdcBalance = await usdcToken.balanceOf(deployer.address);

      // Withdraw all USDC from Comet
      await mockComet.withdraw(usdcToken.address, userBalance);

      // Final USDC balance
      const finalUsdcBalance = await usdcToken.balanceOf(deployer.address);

      // Verify withdrawal worked
      expect(finalUsdcBalance - initialUsdcBalance).to.equal(userBalance);

      // Verify Comet balance is zero
      const finalCometBalance = await mockComet.balanceOf(deployer.address);
      expect(finalCometBalance).to.equal(0);
    });

    it('should handle failed claims when no rewards are available', async function () {
      await mockComet.resetRewards(deployer.address);

      try {
        await mockCometRewards.claim(mockComet.address, deployer.address, true);
        // If we get here, the test failed
        expect.fail('Claim should have failed');
      } catch (error) {
        // Check if the error contains our expected message
        expect(error.message).to.include('No rewards');
      }
    });
  });
});
