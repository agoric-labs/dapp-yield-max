const {
  defaultAxelarChainInfo,
  AxelarRelayerService,
} = require('./agoric-to-axelar-local/packages/axelar-local-dev-cosmos/dist/index.js');
const {
  evmRelayer,
  createNetwork,
  deployContract,
  relay,
  RelayerType,
} = require('./agoric-to-axelar-local/packages/axelar-local-dev/dist/index.js');
const { ethers } = require('ethers');

const Wallet = require('../solidity/artifacts/contracts/Factory.sol/Wallet.json');
const runRelay = async () => {
  const axelarRelayer = await AxelarRelayerService.create(
    defaultAxelarChainInfo,
  );

  const Factory = require('../solidity/artifacts/contracts/Factory.sol/Factory.json');
  const MulticallTester = require('../solidity/artifacts/contracts/MulticallTester.sol/MulticallTester.json');

  const ethereumNetwork = await createNetwork({ name: 'Ethereum' });
  // Deploy factory contract
  const multicallTesterContract = await deployContract(
    ethereumNetwork.userWallets[0],
    MulticallTester,
    [],
  );

  // Deploy factory contract
  const factoryContract = await deployContract(
    ethereumNetwork.userWallets[0],
    Factory,
    [
      ethereumNetwork.gateway.address,
      ethereumNetwork.gasService.address,
      'Ethereum',
    ],
  );
  console.log('Factory contract deployed at address:', factoryContract.address);

  // Deploy tokens
  const tokenContract = await ethereumNetwork.deployToken(
    'USDC',
    'aUSDC',
    6,
    BigInt(100_000e6),
  );
  console.log('Token contract deployed at address:', tokenContract.address);

  const aaveContract = await deployContract(
    ethereumNetwork.userWallets[0],
    require('../solidity/artifacts/contracts/MockAave.sol/MockAavePool.json'),
    [],
  );
  console.log('MockAave Contract Address:', aaveContract.address);

  const compoundContract = await deployContract(
    ethereumNetwork.userWallets[0],
    require('../solidity/artifacts/contracts/MockComet.sol/MockComet.json'),
    [tokenContract.address],
  );
  console.log('MockComet Contract Address:', compoundContract.address);

  const compToken = await deployContract(
    ethereumNetwork.userWallets[0],
    require('../solidity/artifacts/contracts/MintableERC20.sol/MintableERC20.json'),
    ['COMP', 'COMP'],
  );
  console.log('MockComet Contract Address:', compoundContract.address);

  const compoundRewardsContract = await deployContract(
    ethereumNetwork.userWallets[0],
    require('../solidity/artifacts/contracts/MockCometRewards.sol/MockCometRewards.json'),
    [compToken.address],
  );
  console.log(
    'MockCometRewards Contract Address:',
    compoundRewardsContract.address,
  );

  await ethereumNetwork.giveToken(aaveContract.address, 'aUSDC', 100000000);
  await aaveContract.setReserveData(
    tokenContract.address,
    ethers.parseUnits('0.35', 18), // 5% liquidity rate
    ethers.parseUnits('0.07', 27), // 7% variable borrow rate
    ethers.parseUnits('0.06', 27), // 6% stable borrow rate
    10000000000, // 1% reward rate (in basis points)
  );

  evmRelayer.setRelayer(RelayerType.Agoric, axelarRelayer);

  while (true) {
    try {
      await relay({
        agoric: axelarRelayer,
      });

      await relay({
        evm: evmRelayer,
      });
    } catch (e) {
      console.log('Error in relay:', e);
    }

    // await new Promise((resolve) => setTimeout(resolve, 5000));
    const rpcProvider = ethereumNetwork.provider;
    await rpcProvider.send('evm_increaseTime', [1000]);
    await rpcProvider.send('evm_mine', []);

    console.log('\n\n\n\n\n');
    const wallet = '0xd8E896691A0FCE4641D44d9E461A6d746A5c91dB';
    const usdcBalanceWallet = await tokenContract.balanceOf(wallet);
    console.log('Wallet USDC Balance:', usdcBalanceWallet.toString());
    const pendingRewards = await aaveContract.getPendingRewards(
      wallet,
      tokenContract.address,
    );
    // console.log('Pending rewards:', pendingRewards.toString());

    const aTokenBalance = await tokenContract.balanceOf(aaveContract.address);
    console.log('Aave USDC Balance:', aTokenBalance.toString());
    console.log('\n\nAAVE:')

    //   console.log("\n---- Debug Reward Calculation ----");
    const [
      depositAmount,
      depositTime,
      timeElapsed,
      rewardRate,
      ratePerSecond,
      rewards,
    ] = await aaveContract.debugRewardComponents(wallet, tokenContract.address);

    console.log('Amount supplied to Aave:', depositAmount.toString());
    // console.log('depositTime (unix):', depositTime.toString());
    // console.log('timeElapsed (seconds):', timeElapsed.toString());
    // console.log('rewardRate (bps):', rewardRate.toString());
    // console.log('ratePerSecond (scaled):', ratePerSecond.toString());
    
    console.log('\n\nCOMPOUND:');
    const compoundUSDC = await compoundContract.balanceOf(wallet);
    console.log('Amount supplied to Compound:', compoundUSDC.toString());
    await compoundContract.accrueAccount(wallet);

    // const rewardsWallet = await compToken.balanceOf(wallet);
    // console.log('Rewards in wallet:', rewardsWallet.toString());
    // const rewardsowed = await compoundRewardsContract.getRewardOwed(compoundContract.address, wallet);
    // console.log('Rewards owed by compound:', rewardsowed.toString());

    console.log('\n\n\n\n\n');
  }
};

runRelay();
