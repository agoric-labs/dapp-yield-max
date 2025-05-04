/**
 * @file utils/gmp.js GMP payload construction utilities
 */
import { encodeFunctionData, encodeAbiParameters, hexToBytes } from 'viem';

export const GMPMessageType = {
  MESSAGE_ONLY: 1,
  MESSAGE_WITH_TOKEN: 2,
  TOKEN_ONLY: 3,
};

export const gmpAddresses = {
  AXELAR_GMP:
    'axelar1dv4u5k73pzqrxlzujxg3qp8kvc3pje7jtdvu72npnt5zhq05ejcsn5qme5',
  AXELAR_GAS: 'axelar1zl3rxpp70lmte2xr6c4lgske2fyuj3hupcsvcd',
  OSMOSIS_RECEIVER: 'osmo1yh3ra8eage5xtr9a3m5utg6mx0pmqreytudaqj',
};

/**
 * @typedef {Object} ContractCall
 * @property {string} target - The target contract address.
 * @property {string} functionSignature - The function signature (e.g., "transfer(address,uint256)").
 * @property {Array<*>} args - The arguments to pass to the function.
 */

/**
 * @typedef {Object} AbiEncodedContractCall
 * @property {string} target - The target contract address (same as input).
 * @property {string} data - ABI-encoded function call data.
 */

/**
 * Constructs a contract call object with ABI encoding.
 * @param {ContractCall} data - The data for the contract call.
 * @returns {AbiEncodedContractCall} The encoded contract call object.
 */
export const constructContractCall = ({ target, functionSignature, args }) => {
  const [name, paramsRaw] = functionSignature.split('(');
  const params = paramsRaw.replace(')', '').split(',').filter(Boolean);

  return {
    target,
    data: encodeFunctionData({
      abi: [
        {
          type: 'function',
          name,
          inputs: params.map((type, i) => ({ type, name: `arg${i}` })),
        },
      ],
      functionName: name,
      args,
    }),
  };
};

/**
 * Builds a GMP payload from an array of contract calls.
 *
 * @param {Array<ContractCall>} contractCalls - Array of contract call objects.
 * @param {String} message - message to send to gmp call
 * @returns {{ payload: Array<AbiEncodedContractCall> }} The GMP payload object.
 */
export const buildGMPPayload = (contractCalls, message = '') => {
  let abiEncodedContractCalls = [];
  for (let call of contractCalls) {
    const { target, functionSignature, args } = call;
    abiEncodedContractCalls.push(
      constructContractCall({ target, functionSignature, args }),
    );
  }

  const abiEncodedData = encodeAbiParameters(
    [
      { type: 'string' },
      {
        type: 'tuple[]',
        components: [
          { name: 'target', type: 'address' },
          { name: 'data', type: 'bytes' },
        ],
      },
    ],
    [message, abiEncodedContractCalls],
  );

  return Array.from(hexToBytes(abiEncodedData));
};
