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

    timeTravel = async (seconds) => {
      await network.provider.send('evm_increaseTime', [seconds]);
      await network.provider.send('evm_mine', []);
    };

    const MintableERC20 = await ethers.getContractFactory('MintableERC20');

    usdcToken = await MintableERC20.deploy('USDC', 'USDC');
    await usdcToken.waitForDeployment();

    compToken = await MintableERC20.deploy('COMP', 'COMP');
    await compToken.waitForDeployment();

    const MockComet = await ethers.getContractFactory('MockComet');
    mockComet = await MockComet.deploy(usdcToken.target);

    const MockCometRewards = await ethers.getContractFactory('MockCometRewards');
    mockCometRewards = await MockCometRewards.deploy(compToken.target);

    await usdcToken.mint(deployer.address, ethers.parseUnits('100000', 6));
  });

  describe('Basic Mock Compound functionality', function () {
    it('should allow depositing USDC into Comet', async function () {
      const supplyAmount = ethers.parseUnits('500', 6);

      await usdcToken.approve(mockComet.target, supplyAmount);
      await mockComet.trackUser(deployer.address);

      const initialUsdcBalance = await usdcToken.balanceOf(deployer.address);
      const initialCometBalance = await mockComet.balanceOf(deployer.address);

      await mockComet.supply(usdcToken.target, supplyAmount);

      const finalUsdcBalance = await usdcToken.balanceOf(deployer.address);
      const finalCometBalance = await mockComet.balanceOf(deployer.address);

      expect(initialUsdcBalance - finalUsdcBalance).to.equal(supplyAmount);
      expect(finalCometBalance - initialCometBalance).to.equal(supplyAmount);
    });

    it('should get and set base tracking supply speed correctly', async function () {
        // Set a specific speed
        const rawSpeed = 42;
        await mockComet.setBaseTrackingSupplySpeed(rawSpeed);
  
        // Read back the speed
        const currentSpeed = await mockComet.getBaseTrackingSupplySpeed();
        expect(currentSpeed).to.equal(rawSpeed);
  
        // // Set to zero to trigger fallback logic (randomized value)
        await mockComet.setBaseTrackingSupplySpeed(0);
        const fallbackSpeed = await mockComet.getBaseTrackingSupplySpeed();
  
        // // Should not be zero after fallback
        expect(fallbackSpeed).to.be.gt(0);
        expect(fallbackSpeed).to.not.equal(rawSpeed);
      });
  
    it('should set and track reward speeds', async function () {
      const rewardSpeed = 20000;
      await mockComet.setBaseTrackingSupplySpeed(rewardSpeed);

      await mockComet.accrue();
      await mockComet.accrueAccount(deployer.address);

      const initialRewards = await mockComet.accruedRewards(deployer.address);
      expect(initialRewards).to.equal(0);
    });

    it('should accrue rewards over time', async function () {
      await timeTravel(300);

      await mockComet.setBaseTrackingSupplySpeed(20000);
      await mockComet.trackUser(deployer.address);

      const supplyAmount = ethers.parseUnits('500', 6);
      await usdcToken.approve(mockComet.target, supplyAmount);
      await mockComet.supply(usdcToken.target, supplyAmount);

      await mockComet.accrue();
      await mockComet.accrueAccount(deployer.address);

      const accruedRewards = await mockComet.accruedRewards(deployer.address);
      expect(accruedRewards).to.be.gt(0);
    });

    it('should calculate rewards correctly based on deposit amount and time', async function () {
      const supplyAmount = ethers.parseUnits('500', 6);

      await usdcToken.approve(mockComet.target, supplyAmount);
      await mockComet.trackUser(deployer.address);
      await mockComet.supply(usdcToken.target, supplyAmount);

      const userDeposit = await mockComet.balanceOf(deployer.address);
      expect(userDeposit).to.equal(supplyAmount);

      await timeTravel(1000);

      await mockCometRewards.accrueAndTrack(mockComet.target, deployer.address);
      const [rewardToken, owed] = await mockCometRewards.getRewardOwed(
        mockComet.target,
        deployer.address
      );

      expect(rewardToken).to.equal(await compToken.target);
      expect(owed).to.be.gt(0);
    });

    it('should allow claiming rewards', async function () {
      const supplyAmount = ethers.parseUnits('500', 6);

      await usdcToken.approve(mockComet.target, supplyAmount);
      await mockComet.trackUser(deployer.address);
      await mockComet.supply(usdcToken.target, supplyAmount);

      const initialCompBalance = await compToken.balanceOf(deployer.address);
      expect(initialCompBalance).to.equal(0);

      await mockCometRewards.claim(mockComet.target, deployer.address, true);

      const finalCompBalance = await compToken.balanceOf(deployer.address);
      expect(finalCompBalance).to.be.gt(initialCompBalance);

      const remainingRewards = await mockComet.accruedRewards(deployer.address);
      expect(remainingRewards).to.equal(0);
    });

    it('should allow withdrawing funds from Comet', async function () {
      const supplyAmount = ethers.parseUnits('50', 6);

      await usdcToken.approve(mockComet.target, supplyAmount);
      await mockComet.trackUser(deployer.address);
      await mockComet.supply(usdcToken.target, supplyAmount);

      const userBalance = await mockComet.balanceOf(deployer.address);
      expect(userBalance).to.be.gt(0);

      const initialUsdcBalance = await usdcToken.balanceOf(deployer.address);

      await mockComet.withdraw(usdcToken.target, userBalance);

      const finalUsdcBalance = await usdcToken.balanceOf(deployer.address);
      expect(finalUsdcBalance - initialUsdcBalance).to.equal(userBalance);

      const finalCometBalance = await mockComet.balanceOf(deployer.address);
      expect(finalCometBalance).to.equal(0);
    });

    it('should handle failed claims when no rewards are available', async function () {
      await mockComet.resetRewards(deployer.address);

      try {
        await mockCometRewards.claim(mockComet.target, deployer.address, true);
        expect.fail('Claim should have failed');
      } catch (error) {
        expect(error.message).to.include('No rewards');
      }
    });
  });
});
