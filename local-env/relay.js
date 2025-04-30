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

  evmRelayer.setRelayer(RelayerType.Agoric, axelarRelayer);

  while (true) {
    await relay({
      agoric: axelarRelayer,
    });

    await relay({
      evm: evmRelayer,
    });
  }
};

runRelay();
