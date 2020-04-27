import { StacksTransaction } from './transaction';

import {
  createTokenTransferPayload,
  createSmartContractPayload,
  createContractCallPayload,
} from './payload';

import { SingleSigSpendingCondition, StandardAuthorization } from './authorization';

import { publicKeyToString, createStacksPrivateKey, getPublicKey } from './keys';

import { TransactionSigner } from './signer';

import {
  PostCondition,
  STXPostCondition,
  FungiblePostCondition,
  NonFungiblePostCondition,
  createSTXPostCondition,
  createFungiblePostCondition,
  createNonFungiblePostCondition,
} from './postcondition';

import {
  DEFAULT_CORE_NODE_API_URL,
  TransactionVersion,
  AddressHashMode,
  FungibleConditionCode,
  NonFungibleConditionCode,
  PostConditionMode,
  PayloadType,
  ChainID,
  DEFAULT_CHAIN_ID,
  DEFAULT_TRANSACTION_VERSION,
  AnchorMode,
} from './constants';

import {
  AssetInfo,
  createLPList,
  createStandardPrincipal,
  createContractPrincipal,
  createLPString,
} from './types';

import { fetchPrivate } from './utils';

import * as BigNum from 'bn.js';
import { ClarityValue, PrincipalCV } from './clarity';

const DEFAULT_FEE_ESTIMATE_API_URL = `${DEFAULT_CORE_NODE_API_URL}/v2/fees/transfer`;

/**
 * Estimate the total transaction fee in microstacks for a token transfer
 *
 * @param {StacksTransaction} transaction - the token transfer transaction to estimate fees for
 * @param {String} apiUrl - specify the full core API URL to fetch the fee estimate from
 *
 * @return a promise that resolves to number of microstacks per byte
 */
export function estimateTransfer(transaction: StacksTransaction, apiUrl?: string): Promise<BigNum> {
  const requestHeaders = {
    Accept: 'application/text',
  };

  const fetchOptions = {
    method: 'GET',
    headers: requestHeaders,
  };

  if (transaction.payload.payloadType != PayloadType.TokenTransfer) {
    throw new Error('Transaction is not a token transfer');
  }

  const url = apiUrl || `${DEFAULT_CORE_NODE_API_URL}/v2/fees/transfer`;

  return fetchPrivate(url, fetchOptions)
    .then(response => response.text())
    .then(feeRateResult => {
      const txBytes = new BigNum(transaction.serialize().byteLength);
      const feeRate = new BigNum(feeRateResult);
      return feeRate.mul(txBytes);
    });
}

/**
 * STX token transfer transaction options
 *
 * @param  {BigNum} fee - transaction fee in microstacks
 * @param  {BigNum} nonce - a nonce must be increased monotonically with each new transaction
 * @param  {TransactionVersion} version - can be set to mainnet or testnet
 * @param  {ChainID} chainId - identifies which Stacks chain this transaction is destined for
 * @param  {anchorMode} anchorMode - identify how the the transaction should be mined
 * @param  {String} memo - an arbitrary string to include with the transaction, must be less than
 *                          34 bytes
 * @param  {PostconditionMode} postConditionMode - whether post conditions must fully cover all
 *                                                 transferred assets
 * @param  {PostCondition[]} postConditions - an array of post conditions to add to the
 *                                                  transaction
 */
export interface TokenTransferOptions {
  fee?: BigNum;
  feeEstimateApiUrl?: string;
  nonce?: BigNum;
  version?: TransactionVersion;
  chainId?: ChainID;
  anchorMode?: AnchorMode;
  memo?: string;
  postConditionMode?: PostConditionMode;
  postConditions?: PostCondition[];
}

/**
 * Generates a Stacks token transfer transaction
 *
 * Returns a signed Stacks token transfer transaction.
 *
 * @param  {String} recipientAddress - the c32check address of the recipient
 * @param  {BigNum} amount - number of tokens to transfer in microstacks
 * @param  {String} senderKey - hex string sender private key used to sign transaction
 * @param  {TokenTransferOptions} options - an options object for the token transfer
 *
 * @return {StacksTransaction}
 */
export async function makeSTXTokenTransfer(
  recipient: string | PrincipalCV,
  amount: BigNum,
  senderKey: string,
  options?: TokenTransferOptions
): Promise<StacksTransaction> {
  const defaultOptions = {
    fee: new BigNum(0),
    feeEstimateApiUrl: DEFAULT_FEE_ESTIMATE_API_URL,
    nonce: new BigNum(0),
    version: DEFAULT_TRANSACTION_VERSION,
    chainId: DEFAULT_CHAIN_ID,
    anchorMode: AnchorMode.Any,
    postConditionMode: PostConditionMode.Deny,
    memo: '',
  };

  const normalizedOptions = Object.assign(defaultOptions, options);

  const payload = createTokenTransferPayload(recipient, amount, normalizedOptions.memo);

  const addressHashMode = AddressHashMode.SerializeP2PKH;
  const privKey = createStacksPrivateKey(senderKey);
  const pubKey = getPublicKey(privKey);
  const spendingCondition = new SingleSigSpendingCondition(
    addressHashMode,
    publicKeyToString(pubKey),
    normalizedOptions.nonce,
    normalizedOptions.fee
  );
  const authorization = new StandardAuthorization(spendingCondition);

  const postConditions: PostCondition[] = [];
  if (normalizedOptions.postConditions && normalizedOptions.postConditions.length > 0) {
    normalizedOptions.postConditions.forEach(postCondition => {
      postConditions.push(postCondition);
    });
  }

  const lpPostConditions = createLPList(postConditions);
  const transaction = new StacksTransaction(
    normalizedOptions.version,
    authorization,
    payload,
    lpPostConditions,
    normalizedOptions.postConditionMode,
    defaultOptions.anchorMode,
    normalizedOptions.chainId
  );

  if (!options?.fee) {
    const txFee = await estimateTransfer(transaction, normalizedOptions.feeEstimateApiUrl);
    transaction.setFee(txFee);
  }

  if (senderKey) {
    const signer = new TransactionSigner(transaction);
    signer.signOrigin(privKey);
  }

  return transaction;
}

/**
 * Contract deploy transaction options
 *
 * @param  {BigNum} fee - transaction fee in microstacks
 * @param  {BigNum} nonce - a nonce must be increased monotonically with each new transaction
 * @param  {TransactionVersion} version - can be set to mainnet or testnet
 * @param  {ChainID} chainId - identifies which Stacks chain this transaction is destined for
 * @param  {anchorMode} anchorMode - identify how the the transaction should be mined
 * @param  {PostconditionMode} postConditionMode - whether post conditions must fully cover all
 *                                                 transferred assets
 * @param  {PostCondition[]} postConditions - an array of post conditions to add to the
 *                                                  transaction
 */
export interface ContractDeployOptions {
  fee?: BigNum;
  feeEstimateApiUrl?: string;
  nonce?: BigNum;
  version?: TransactionVersion;
  chainId?: ChainID;
  anchorMode?: AnchorMode;
  postConditionMode?: PostConditionMode;
  postConditions?: PostCondition[];
}

/**
 * Estimate the total transaction fee in microstacks for a contract deploy
 *
 * @param {StacksTransaction} transaction - the token transfer transaction to estimate fees for
 * @param {String} apiUrl - specify the full core API URL to fetch the fee estimate from
 *
 * @return a promise that resolves to number of microstacks per byte
 */
export function estimateContractDeploy(
  transaction: StacksTransaction,
  apiUrl?: string
): Promise<BigNum> {
  const requestHeaders = {
    Accept: 'application/text',
  };

  const fetchOptions = {
    method: 'GET',
    headers: requestHeaders,
  };

  if (transaction.payload.payloadType != PayloadType.TokenTransfer) {
    throw new Error('Transaction is not a token transfer');
  }

  // Place holder estimate until contract deploy fee estimation is fully implemented on Stacks
  // blockchain core
  const url = apiUrl || `${DEFAULT_CORE_NODE_API_URL}/v2/fees/transfer`;

  return fetchPrivate(url, fetchOptions)
    .then(response => response.text())
    .then(feeRateResult => {
      const txBytes = new BigNum(transaction.serialize().byteLength);
      const feeRate = new BigNum(feeRateResult);
      return feeRate.mul(txBytes);
    });
}

/**
 * Generates a Clarity smart contract deploy transaction
 *
 * Returns a signed Stacks smart contract deploy transaction.
 *
 * @param  {String} contractName - the contract name
 * @param  {String} codeBody - the code body string
 * @param  {String} senderKey - hex string sender private key used to sign transaction
 *
 * @return {StacksTransaction}
 */
export async function makeSmartContractDeploy(
  contractName: string,
  codeBody: string,
  senderKey: string,
  options?: ContractDeployOptions
): Promise<StacksTransaction> {
  const defaultOptions = {
    fee: new BigNum(0),
    feeEstimateApiUrl: DEFAULT_FEE_ESTIMATE_API_URL,
    nonce: new BigNum(0),
    version: DEFAULT_TRANSACTION_VERSION,
    chainId: DEFAULT_CHAIN_ID,
    anchorMode: AnchorMode.Any,
    postConditionMode: PostConditionMode.Deny,
  };

  const normalizedOptions = Object.assign(defaultOptions, options);

  const payload = createSmartContractPayload(contractName, codeBody);

  const addressHashMode = AddressHashMode.SerializeP2PKH;
  const privKey = createStacksPrivateKey(senderKey);
  const pubKey = getPublicKey(privKey);
  const spendingCondition = new SingleSigSpendingCondition(
    addressHashMode,
    publicKeyToString(pubKey),
    normalizedOptions.nonce,
    normalizedOptions.fee
  );
  const authorization = new StandardAuthorization(spendingCondition);

  const postConditions: PostCondition[] = [];
  if (normalizedOptions.postConditions && normalizedOptions.postConditions.length > 0) {
    normalizedOptions.postConditions.forEach(postCondition => {
      postConditions.push(postCondition);
    });
  }

  const lpPostConditions = createLPList(postConditions);
  const transaction = new StacksTransaction(
    normalizedOptions.version,
    authorization,
    payload,
    lpPostConditions,
    normalizedOptions.postConditionMode,
    normalizedOptions.anchorMode,
    normalizedOptions.chainId
  );

  if (!options?.fee) {
    const txFee = await estimateContractDeploy(transaction, normalizedOptions.feeEstimateApiUrl);
    transaction.setFee(txFee);
  }

  const signer = new TransactionSigner(transaction);
  signer.signOrigin(privKey);

  return transaction;
}

/**
 * Contract function call transaction options
 *
 * @param  {BigNum} fee - transaction fee in microstacks
 * @param  {BigNum} nonce - a nonce must be increased monotonically with each new transaction
 * @param  {TransactionVersion} version - can be set to mainnet or testnet
 * @param  {ChainID} chainId - identifies which Stacks chain this transaction is destined for
 * @param  {anchorMode} anchorMode - identify how the the transaction should be mined
 * @param  {PostconditionMode} postConditionMode - whether post conditions must fully cover all
 *                                                 transferred assets
 * @param  {PostCondition[]} postConditions - an array of post conditions to add to the
 *                                                  transaction
 */
export interface ContractCallOptions {
  fee?: BigNum;
  feeEstimateApiUrl?: string;
  nonce?: BigNum;
  version?: TransactionVersion;
  chainId?: ChainID;
  anchorMode?: AnchorMode;
  postConditionMode?: PostConditionMode;
  postConditions?: PostCondition[];
}

/**
 * Estimate the total transaction fee in microstacks for a contract function call
 *
 * @param {StacksTransaction} transaction - the token transfer transaction to estimate fees for
 * @param {String} apiUrl - specify the full core API URL to fetch the fee estimate from
 *
 * @return a promise that resolves to number of microstacks per byte
 */
export function estimateContractFunctionCall(
  transaction: StacksTransaction,
  apiUrl?: string
): Promise<BigNum> {
  const requestHeaders = {
    Accept: 'application/text',
  };

  const fetchOptions = {
    method: 'GET',
    headers: requestHeaders,
  };

  if (transaction.payload.payloadType != PayloadType.TokenTransfer) {
    throw new Error('Transaction is not a token transfer');
  }

  // Place holder estimate until contract call fee estimation is fully implemented on Stacks
  // blockchain core
  const url = apiUrl || `${DEFAULT_CORE_NODE_API_URL}/v2/fees/transfer`;

  return fetchPrivate(url, fetchOptions)
    .then(response => response.text())
    .then(feeRateResult => {
      const txBytes = new BigNum(transaction.serialize().byteLength);
      const feeRate = new BigNum(feeRateResult);
      return feeRate.mul(txBytes);
    });
}

/**
 * Generates a Clarity smart contract function call transaction
 *
 * Returns a signed Stacks smart contract deploy transaction.
 *
 * @param  {String} contractAddress - the c32check address of the contract
 * @param  {String} contractName - the contract name
 * @param  {String} functionName - name of the function to be called
 * @param  {[ClarityValue]} functionArgs - an array of Clarity values as arguments to the function call
 * @param  {BigNum} nonce - a nonce must be increased monotonically with each new transaction
 * @param  {String} senderKey - hex string sender private key used to sign transaction
 * @param  {TransactionVersion} version - can be set to mainnet or testnet
 *
 * @return {StacksTransaction}
 */
export async function makeContractCall(
  contractAddress: string,
  contractName: string,
  functionName: string,
  functionArgs: ClarityValue[],
  senderKey: string,
  options?: ContractCallOptions
): Promise<StacksTransaction> {
  const defaultOptions = {
    fee: new BigNum(0),
    feeEstimateApiUrl: DEFAULT_FEE_ESTIMATE_API_URL,
    nonce: new BigNum(0),
    version: DEFAULT_TRANSACTION_VERSION,
    chainId: DEFAULT_CHAIN_ID,
    anchorMode: AnchorMode.Any,
    postConditionMode: PostConditionMode.Deny,
  };

  const normalizedOptions = Object.assign(defaultOptions, options);

  const payload = createContractCallPayload(
    contractAddress,
    contractName,
    functionName,
    functionArgs
  );

  const addressHashMode = AddressHashMode.SerializeP2PKH;
  const privKey = createStacksPrivateKey(senderKey);
  const pubKey = getPublicKey(privKey);
  const spendingCondition = new SingleSigSpendingCondition(
    addressHashMode,
    publicKeyToString(pubKey),
    normalizedOptions.nonce,
    normalizedOptions.fee
  );
  const authorization = new StandardAuthorization(spendingCondition);

  const postConditions: PostCondition[] = [];
  if (normalizedOptions.postConditions && normalizedOptions.postConditions.length > 0) {
    normalizedOptions.postConditions.forEach(postCondition => {
      postConditions.push(postCondition);
    });
  }

  const lpPostConditions = createLPList(postConditions);
  const transaction = new StacksTransaction(
    normalizedOptions.version,
    authorization,
    payload,
    lpPostConditions,
    normalizedOptions.postConditionMode,
    normalizedOptions.anchorMode,
    normalizedOptions.chainId
  );

  if (!options?.fee) {
    const txFee = await estimateContractFunctionCall(
      transaction,
      normalizedOptions.feeEstimateApiUrl
    );
    transaction.setFee(txFee);
  }

  const signer = new TransactionSigner(transaction);
  signer.signOrigin(privKey);

  return transaction;
}

/**
 * Generates a STX post condition with a standard principal
 *
 * Returns a STX post condition object
 *
 * @param  {String} address - the c32check address
 * @param  {FungibleConditionCode} conditionCode - the condition code
 * @param  {BigNum} amount - the amount of STX tokens
 *
 * @return {STXPostCondition}
 */
export function makeStandardSTXPostCondition(
  address: string,
  conditionCode: FungibleConditionCode,
  amount: BigNum
): STXPostCondition {
  return createSTXPostCondition(createStandardPrincipal(address), conditionCode, amount);
}

/**
 * Generates a STX post condition with a contract principal
 *
 * Returns a STX post condition object
 *
 * @param  {String} address - the c32check address of the contract
 * @param  {String} contractName - the name of the contract
 * @param  {FungibleConditionCode} conditionCode - the condition code
 * @param  {BigNum} amount - the amount of STX tokens
 *
 * @return {STXPostCondition}
 */
export function makeContractSTXPostCondition(
  address: string,
  contractName: string,
  conditionCode: FungibleConditionCode,
  amount: BigNum
): STXPostCondition {
  return createSTXPostCondition(
    createContractPrincipal(address, contractName),
    conditionCode,
    amount
  );
}

/**
 * Generates a fungible token post condition with a standard principal
 *
 * Returns a fungible token post condition object
 *
 * @param  {String} address - the c32check address
 * @param  {FungibleConditionCode} conditionCode - the condition code
 * @param  {BigNum} amount - the amount of fungible tokens
 * @param  {AssetInfo} assetInfo - asset info describing the fungible token
 *
 * @return {FungiblePostCondition}
 */
export function makeStandardFungiblePostCondition(
  address: string,
  conditionCode: FungibleConditionCode,
  amount: BigNum,
  assetInfo: AssetInfo
): FungiblePostCondition {
  return createFungiblePostCondition(
    createStandardPrincipal(address),
    conditionCode,
    amount,
    assetInfo
  );
}

/**
 * Generates a fungible token post condition with a contract principal
 *
 * Returns a fungible token post condition object
 *
 * @param  {String} address - the c32check address
 * @param  {String} contractName - the name of the contract
 * @param  {FungibleConditionCode} conditionCode - the condition code
 * @param  {BigNum} amount - the amount of fungible tokens
 * @param  {AssetInfo} assetInfo - asset info describing the fungible token
 *
 * @return {FungiblePostCondition}
 */
export function makeContractFungiblePostCondition(
  address: string,
  contractName: string,
  conditionCode: FungibleConditionCode,
  amount: BigNum,
  assetInfo: AssetInfo
): FungiblePostCondition {
  return createFungiblePostCondition(
    createContractPrincipal(address, contractName),
    conditionCode,
    amount,
    assetInfo
  );
}

/**
 * Generates a non-fungible token post condition with a standard principal
 *
 * Returns a non-fungible token post condition object
 *
 * @param  {String} address - the c32check address
 * @param  {FungibleConditionCode} conditionCode - the condition code
 * @param  {AssetInfo} assetInfo - asset info describing the non-fungible token
 *
 * @return {NonFungiblePostCondition}
 */
export function makeStandardNonFungiblePostCondition(
  address: string,
  conditionCode: NonFungibleConditionCode,
  assetInfo: AssetInfo,
  assetName: string
): NonFungiblePostCondition {
  return createNonFungiblePostCondition(
    createStandardPrincipal(address),
    conditionCode,
    assetInfo,
    createLPString(assetName)
  );
}

/**
 * Generates a non-fungible token post condition with a contract principal
 *
 * Returns a non-fungible token post condition object
 *
 * @param  {String} address - the c32check address
 * @param  {String} contractName - the name of the contract
 * @param  {FungibleConditionCode} conditionCode - the condition code
 * @param  {AssetInfo} assetInfo - asset info describing the non-fungible token
 *
 * @return {NonFungiblePostCondition}
 */
export function makeContractNonFungiblePostCondition(
  address: string,
  contractName: string,
  conditionCode: NonFungibleConditionCode,
  assetInfo: AssetInfo,
  assetName: string
): NonFungiblePostCondition {
  return createNonFungiblePostCondition(
    createContractPrincipal(address, contractName),
    conditionCode,
    assetInfo,
    createLPString(assetName)
  );
}
