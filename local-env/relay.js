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

  await aaveContract.setReserveData(
    tokenContract.address,
    ethers.parseUnits("0.05", 27), // 5% liquidity rate
    ethers.parseUnits("0.07", 27), // 7% variable borrow rate
    ethers.parseUnits("0.06", 27), // 6% stable borrow rate
    100 // 1% reward rate (in basis points)
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

    const wallet = new ethers.Contract(
      '0xd8E896691A0FCE4641D44d9E461A6d746A5c91dB',
      Wallet.abi,
    );
    const usdcBalanceWallet = await tokenContract.balanceOf(
      '0xd8E896691A0FCE4641D44d9E461A6d746A5c91dB',
    );
    console.log('\n\n\n\n\n');
    console.log('Wallet USDC Balance:', usdcBalanceWallet.toString());


  const aTokenBalance = await aaveContract.getAccruedInterest('0xd8E896691A0FCE4641D44d9E461A6d746A5c91dB', tokenContract.address);
  console.log("Accrued interest:", aTokenBalance.toString());
  }
};

runRelay();
