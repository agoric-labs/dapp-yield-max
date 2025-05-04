// @ts-check

/** @typedef {import('./utils/gmp.js').ContractCall} ContractCall */

import { M, mustMatch } from '@endo/patterns';
import { VowShape } from '@agoric/vow';
import { makeTracer, NonNullish } from '@agoric/internal';
import { atob, decodeBase64 } from '@endo/base64';
import { decodeAbiParameters } from 'viem';
import { Fail } from '@endo/errors';
import { ChainAddressShape } from '@agoric/orchestration';
import { gmpAddresses, buildGMPPayload } from './utils/gmp.js';
import { E, Far } from '@endo/far';

const trace = makeTracer('EvmTap');
const { entries } = Object;

/**
 * @typedef {Object} AxelarGmpMemo
 * @property {string} source_chain - The name of the source blockchain (e.g., 'ethereum', 'avalanche').
 * @property {string} source_address - The originating address on the source chain.
 * @property {string} payload - The payload being passed in the message, usually a serialized string.
 * @property {1 | 2 | 3} type - The type of message:
 */

/**
 * @import {IBCChannelID, VTransferIBCEvent} from '@agoric/vats';
 * @import {Vow, VowTools} from '@agoric/vow';
 * @import {Zone} from '@agoric/zone';
 * @import {ChainAddress, Denom, OrchestrationAccount} from '@agoric/orchestration';
 * @import {FungibleTokenPacketData} from '@agoric/cosmic-proto/ibc/applications/transfer/v2/packet.js';
 * @import {ZoeTools} from '@agoric/orchestration/src/utils/zoe-tools.js';
 * @import {TimerService} from '@agoric/time';
 */

/**
 * @typedef {{
 *   localAccount: OrchestrationAccount<{ chainId: 'agoric' }>;
 *   localChainAddress: ChainAddress;
 *   sourceChannel: IBCChannelID;
 *   remoteDenom: Denom;
 *   localDenom: Denom;
 *   assets: any;
 *   remoteChainInfo: any;
 * }} EvmTapState
 */

const EVMI = M.interface('holder', {
  getLocalAddress: M.call().returns(M.any()),
  getAddress: M.call().returns(M.any()),
  getLatestMessage: M.call().returns(M.any()),
  send: M.call(M.any(), M.any()).returns(M.any()),
  sendGmp: M.call(M.any()).returns(M.any()),
  fundLCA: M.call(M.any(), M.any()).returns(VowShape),
  startAdjuster: M.call(M.any()).returns(),
});

const getCommandsForSwitch = (wallet, { aave, compound }) => {
  const amount = 5;
  const USDC_TOKEN = '0x7cCc8E1CD3167e2bFe0a6c55d83Ed0537d3bb139';
  const COMPUND_CONTRACT = '0x8491D9AfC8cbDEebB9539729c05ce7924620329c';
  const WALLET = wallet;
  const AAVE_CONTRACT = '0x666A92418cd154380c912e3fD56fa03Fe80eE342';

  const APPROVE_COMPOUND = {
    functionSignature: 'approve(address,uint256)',
    args: [COMPUND_CONTRACT, 1000000000000000000],
    target: USDC_TOKEN,
  };

  const TRACK_USER_COMPOUND = {
    functionSignature: 'trackUser(address)',
    args: [WALLET],
    target: COMPUND_CONTRACT,
  };

  const SUPPLY_COMPOUND = {
    functionSignature: 'supply(address,uint256)',
    args: [USDC_TOKEN, amount],
    target: COMPUND_CONTRACT,
  };

  const WITHDRAW_COMPOUND = {
    functionSignature: 'withdraw(address,uint256)',
    args: [USDC_TOKEN, amount],
    target: COMPUND_CONTRACT,
  };

  const APPROVE_AAVE = {
    functionSignature: 'approve(address,uint256)',
    args: [AAVE_CONTRACT, 1000000000000000000],
    target: USDC_TOKEN,
  };

  const SUPPLY_AAVE = {
    functionSignature: 'supply(address,uint256,address,uint16)',
    args: [USDC_TOKEN, amount, WALLET, 0],
    target: AAVE_CONTRACT,
  };

  const WITHDRAW_AAVE = {
    functionSignature: 'withdraw(address,uint256,address)',
    args: [USDC_TOKEN, amount, WALLET],
    target: AAVE_CONTRACT,
  };

  const sendToAave = [APPROVE_AAVE, SUPPLY_AAVE];
  const sendToCompund = [
    APPROVE_COMPOUND,
    TRACK_USER_COMPOUND,
    SUPPLY_COMPOUND,
  ];
  const withdrawFromAave = [WITHDRAW_AAVE];
  const withdrawFromCompound = [WITHDRAW_COMPOUND];

  if (aave > compound) {
    return [...withdrawFromCompound, ...sendToAave];
  } else if (compound > aave) {
    return [...withdrawFromAave, ...sendToCompund];
  } else {
    return [];
  }
};

const InvitationMakerI = M.interface('invitationMaker', {
  makeEVMTransactionInvitation: M.call(M.string(), M.array()).returns(M.any()),
});

const EvmKitStateShape = {
  localChainAddress: ChainAddressShape,
  sourceChannel: M.string(),
  remoteDenom: M.string(),
  localDenom: M.string(),
  localAccount: M.remotable('OrchestrationAccount<{chainId:"agoric-3"}>'),
  assets: M.any(),
  remoteChainInfo: M.any(),
};
harden(EvmKitStateShape);

/**
 * @param {Zone} zone
 * @param {{
 *   zcf: ZCF;
 *   vowTools: VowTools;
 *   log: (msg: string) => Vow<void>;
 *   zoeTools: ZoeTools;
 *   timerService: TimerService;
 * }} powers
 */
export const prepareEvmAccountKit = (
  zone,
  { zcf, vowTools, log, zoeTools, timerService },
) => {
  return zone.exoClassKit(
    'EvmTapKit',
    {
      tap: M.interface('EvmTap', {
        receiveUpcall: M.call(M.record()).returns(
          M.or(VowShape, M.undefined()),
        ),
      }),
      transferWatcher: M.interface('TransferWatcher', {
        onFulfilled: M.call(M.undefined())
          .optional(M.bigint())
          .returns(VowShape),
      }),
      holder: EVMI,
      invitationMakers: InvitationMakerI,
    },
    /**
     * @param {EvmTapState} initialState
     * @returns {{
     *   evmAccountAddress: string | undefined;
     *   latestMessage: { success: boolean; result: `0x${string}` }[] | undefined;
     * } & EvmTapState}
     */
    (initialState) => {
      mustMatch(initialState, EvmKitStateShape);
      return harden({
        evmAccountAddress: /** @type {string | undefined} */ (undefined),
        latestMessage:
          /** @type {{ success: boolean; result: `0x${string}` }[] | undefined} */ (
            undefined
          ),
        ...initialState,
      });
    },
    {
      tap: {
        /**
         * @param {VTransferIBCEvent} event
         */
        receiveUpcall(event) {
          trace('receiveUpcall', event);

          const tx = /** @type {FungibleTokenPacketData} */ (
            JSON.parse(atob(event.packet.data))
          );

          trace('receiveUpcall packet data', tx);
          /** @type {AxelarGmpMemo} */
          const memo = JSON.parse(tx.memo);

          if (memo.source_chain === 'Ethereum') {
            const payloadBytes = decodeBase64(memo.payload);
            const [{ message, data }] = decodeAbiParameters(
              [
                {
                  type: 'tuple',
                  components: [
                    { name: 'message', type: 'string' },
                    {
                      name: 'data',
                      type: 'tuple[]',
                      components: [
                        { name: 'success', type: 'bool' },
                        { name: 'result', type: 'bytes' },
                      ],
                    },
                  ],
                },
              ],
              payloadBytes,
            );

            trace('receiveUpcall Decoded:', JSON.stringify({ message, data }));

            if (message === 'APY') {
              const rates = data.map(
                (message) =>
                  decodeAbiParameters([{ type: 'uint256' }], message.result)[0],
              );

              const [apyRate1, apyRate2] = rates;
           
              console.log('\n\n\n\n');
              if (apyRate1 > apyRate2 * BigInt(10 ** 18)) {
                console.log(">>> AAVE has higher APY. transferring...");
              } else {
                console.log(">>> COMPOUND has higher APY. transferring....");
              }
              console.log('\n\n\n\n');

              const c = {
                destinationAddress: this.state.evmAccountAddress || '',
                type: 1,
                destinationEVMChain: 'Ethereum',
                gasAmount: 1,
                contractInvocationData: getCommandsForSwitch(this.state.evmAccountAddress, {
                  aave: apyRate1,
                  compound: apyRate2 * BigInt(10 ** 18),
                }),
                message: 'APY',
                amount: BigInt(1),
              };
              this.facets.holder.sendGmp(c);
              trace('APY rate is: ', apyRate1, apyRate2);
            } else if (message === 'ADDRESS') {
              const [message] = data;
              const { success, result } = message;

              trace('Contract Call Status:', success);

              if (success) {
                const [address] = decodeAbiParameters(
                  [{ type: 'address' }],
                  result,
                );
                this.state.evmAccountAddress = address;
                trace('evmAccountAddress:', this.state.evmAccountAddress);
              }
            } else {
              trace('Setting latestMessage:', data);
              this.state.latestMessage = harden([...data]);
            }
          }

          trace('receiveUpcall completed');
        },
      },
      transferWatcher: {
        /**
         * @param {void} _result
         * @param {bigint} value the qty of uatom to delegate
         */
        onFulfilled(_result, value) {
          trace('onFulfilled _result:', JSON.stringify(_result));
          trace('onFulfilled value:', JSON.stringify(value));
          trace('onFulfilled state:', JSON.stringify(this.state));
        },
      },
      holder: {
        getLocalAddress() {
          return this.state.localAccount.getAddress().value;
        },
        async getAddress() {
          return this.state.evmAccountAddress;
        },
        async getLatestMessage() {
          return JSON.stringify(this.state.latestMessage);
        },
        /**
         * Sends tokens from the local account to a specified Cosmos chain
         * address.
         *
         * @param {import('@agoric/orchestration').ChainAddress} toAccount
         * @param {import('@agoric/orchestration').AmountArg} amount
         * @returns {Promise<string>} A success message upon completion.
         */
        async send(toAccount, amount) {
          await this.state.localAccount.send(toAccount, amount);
          return 'transfer success';
        },

        /**
         * @param {{
         *   destinationAddress: string;
         *   type: number;
         *   destinationEVMChain: string;
         *   gasAmount: number;
         *   contractInvocationData: Array<ContractCall>;
         *   message?: string;
         *   amount: bigint;
         * }} offerArgs
         */
        async sendGmp(offerArgs) {
          void log('Inside sendGmp');
          const {
            destinationAddress,
            type,
            destinationEVMChain,
            gasAmount,
            contractInvocationData,
            message = '',
          } = offerArgs;

            trace('Offer Args:', JSON.stringify(offerArgs, (key, value) =>
            typeof value === 'bigint' ? value.toString() : value,
            ));

          destinationAddress != null ||
            Fail`Destination address must be defined`;
          destinationEVMChain != null ||
            Fail`Destination evm address must be defined`;

          const isContractInvocation = [1, 2].includes(type);
          if (isContractInvocation) {
            gasAmount != null || Fail`gasAmount must be defined`;
            contractInvocationData != null ||
              Fail`contractInvocationData is not defined`;

            contractInvocationData.length != 0 ||
              Fail`contractInvocationData array is empty`;
          }


          trace(`targets: [${destinationAddress}]`);
          trace(
            `contractInvocationData: ${JSON.stringify(contractInvocationData)}`,
          );

          const payload =
            type === 3
              ? null
              : buildGMPPayload(contractInvocationData, message);

          void log(`Payload: ${JSON.stringify(payload)}`);


          const { chainId } = this.state.remoteChainInfo;

          const memo = {
            destination_chain: destinationEVMChain,
            destination_address: destinationAddress,
            payload,
            type,
          };

          if (type === 1 || type === 2) {
            memo.fee = {
              amount: String(gasAmount),
              recipient: gmpAddresses.AXELAR_GAS,
            };
            void log(`Fee object ${JSON.stringify(memo.fee)}`);
            trace(`Fee object ${JSON.stringify(memo.fee)}`);
          }

          void log(`Initiating IBC Transfer...`);

          trace('Initiating IBC Transfer...');
          await this.state.localAccount.transfer(
            {
              value: gmpAddresses.AXELAR_GMP,
              encoding: 'bech32',
              chainId,
            },
            {
              denom: 'ubld',
              value: BigInt(offerArgs.amount),
            },
            { memo: JSON.stringify(memo) },
          );

          void log('sendGmp successful');
          return 'sendGmp successful';
        },
        /**
         * @param {ZCFSeat} seat
         * @param {any} give
         */
        fundLCA(seat, give) {
          seat.hasExited() && Fail`The seat cannot be exited.`;
          return zoeTools.localTransfer(seat, this.state.localAccount, give);
        },
        startAdjuster(seat) {
          const { holder } = this.facets;
          const address = this.state.evmAccountAddress;
          if (!address) {
            throw new Error('evmAccountAddress is not set');
          }
          void E(timerService).repeatAfter(
            60n,
            300n,
            Far('PriceStepWaker', {
              wake(time) {
                const c = {
                  destinationAddress: address,
                  type: 1,
                  destinationEVMChain: 'Ethereum',
                  gasAmount: 1,
                  contractInvocationData: [
                    {
                      target: '0x666A92418cd154380c912e3fD56fa03Fe80eE342',
                      functionSignature: 'getReserveLiquidityRate(address)',
                      args: ['0x7cCc8E1CD3167e2bFe0a6c55d83Ed0537d3bb139'],
                    },
                    {
                      target: '0x8491D9AfC8cbDEebB9539729c05ce7924620329c',
                      functionSignature: 'getBaseTrackingSupplySpeed()',
                      args: [],
                    },
                  ],
                  message: 'APY',
                  amount: BigInt(1),
                };
                return holder.sendGmp(c);
              },
            }),
          );
        },
      },
      invitationMakers: {
        // "method" and "args" can be used to invoke methods of localAccount obj
        makeEVMTransactionInvitation(method, args) {
          const continuingEVMTransactionHandler = async (seat) => {
            const { holder } = this.facets;
            switch (method) {
              case 'sendGmp': {
                const { give } = seat.getProposal();
                await vowTools.when(holder.fundLCA(seat, give));
                holder.startAdjuster(seat);
                return holder.sendGmp({...args[0], amount: BigInt(10000)});
              }
              case 'getLocalAddress': {
                const vow = holder.getLocalAddress();
                return vowTools.when(vow, (res) => {
                  seat.exit();
                  return res;
                });
              }
              case 'getAddress': {
                const vow = holder.getAddress();
                return vowTools.when(vow, (res) => {
                  seat.exit();
                  return res;
                });
              }
              case 'getLatestMessage': {
                const vow = holder.getLatestMessage();
                return vowTools.when(vow, (res) => {
                  seat.exit();
                  return res;
                });
              }
              case 'send': {
                const vow = holder.send(args[0], args[1]);
                return vowTools.when(vow, (res) => {
                  seat.exit();
                  return res;
                });
              }
              case 'fundLCA': {
                const { give } = seat.getProposal();
                const vow = holder.fundLCA(seat, give);
                return vowTools.when(vow, (res) => {
                  seat.exit();
                  return res;
                });
              }
              default:
                return 'Invalid method';
            }
          };

          return zcf.makeInvitation(
            continuingEVMTransactionHandler,
            'evmTransaction',
          );
        },
      },
    },
  );
};

/** @typedef {ReturnType<typeof prepareEvmAccountKit>} MakeEvmAccountKit */
/** @typedef {ReturnType<MakeEvmAccountKit>} EvmAccountKit */
