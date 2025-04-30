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
const { encode } = require('@metamask/abi-utils');
const { SigningStargateClient } = require('@cosmjs/stargate');


const runRelay = async () => {
  const axelarRelayer = await AxelarRelayerService.create(
    defaultAxelarChainInfo,
  );

  const Factory = require('../solidity/artifacts/contracts/Factory.sol/Factory.json');

  const ethereumNetwork = await createNetwork({ name: 'Ethereum' });

  const factoryContract = await deployContract(
    ethereumNetwork.userWallets[0],
    Factory,
    [
      ethereumNetwork.gateway.address,
      ethereumNetwork.gasService.address,
      'Ethereum',
    ],
  );

  const ibcRelayer = axelarRelayer.ibcRelayer;

  const IBC_DENOM_AXL_USDC = 'ubld';
  const AMOUNT_IN_ATOMIC_UNITS = '1000000';
  const CHANNEL_ID = ibcRelayer.srcChannelId;
  const DENOM = 'ubld';
  const AXELAR_GMP_ADDRESS =
    'axelar1dv4u5k73pzqrxlzujxg3qp8kvc3pje7jtdvu72npnt5zhq05ejcsn5qme5';

  const signer = ibcRelayer.wasmClient;
  const senderAddress = 'agoric1estsewt6jqsx77pwcxkn5ah0jqgu8rhgflwfdl';

  // Deploy tokens
  const tokenContract = await ethereumNetwork.deployToken(
    'USDC',
    'aUSDC',
    6,
    BigInt(100_000e6),
  );

  const DESTINATION_ADDRESS = factoryContract.address;
  const DESTINATION_CHAIN = 'Ethereum';

  // Dummy payload
  const payload = encode(
    ['string', 'string'],
    ['agoric1estsewt6jqsx77pwcxkn5ah0jqgu8rhgflwfdl', 'Hello, world!'],
  );

  const memo = {
    destination_chain: DESTINATION_CHAIN,
    destination_address: DESTINATION_ADDRESS,
    payload: Array.from(payload),
    fee: {
      amount: '8000',
      recipient: 'axelar1zl3rxpp70lmte2xr6c4lgske2fyuj3hupcsvcd',
    },
    type: 1,
  };

  const message = [
    {
      typeUrl: '/ibc.applications.transfer.v1.MsgTransfer',
      value: {
        sender: senderAddress,
        receiver: AXELAR_GMP_ADDRESS,
        token: {
          denom: IBC_DENOM_AXL_USDC,
          amount: AMOUNT_IN_ATOMIC_UNITS,
        },
        timeoutTimestamp: (Math.floor(Date.now() / 1000) + 600) * 1e9,
        sourceChannel: CHANNEL_ID,
        sourcePort: 'transfer',
        memo: JSON.stringify(memo),
      },
    },
  ];

  const fee = {
    gas: '250000',
    amount: [{ denom: DENOM, amount: '30000' }],
  };

  console.log('Preparing to send tokens...');
  const signingClient = await SigningStargateClient.connectWithSigner(
    'http://localhost/agoric-rpc',
    signer.owner,
  );

  const response = await signingClient.signAndBroadcast(
    senderAddress,
    message,
    fee,
  );
  evmRelayer.setRelayer(RelayerType.Agoric, axelarRelayer);

    await relay({
      agoric: axelarRelayer,
    });

    await relay({
      evm: evmRelayer,
    });

    await relay({
      agoric: axelarRelayer,
    });
    await axelarRelayer.stopListening();
};

runRelay();
