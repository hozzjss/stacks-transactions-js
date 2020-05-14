# Stacks Transactions JS ![npm](https://img.shields.io/npm/v/@blockstack/stacks-transactions?color=red)
The JavaScript library for generating Stacks 2.0 transactions. 

## Installation

```
npm install @blockstack/stacks-transactions
```

## Overview
This library supports the creation of the following Stacks 2.0 transaction types:

1. STX token transfer
2. Smart contract deploy
3. Smart contract function call

## Key Generation
```javascript
import { createStacksPrivateKey, makeRandomPrivKey, getPublicKey } from '@blockstack/stacks-transactions';

// Random key
const privateKey = makeRandomPrivKey();
// Get public key from private
const publicKey = getPublicKey(privateKey);

// Private key from hex string
const key = 'b244296d5907de9864c0b0d51f98a13c52890be0404e83f273144cd5b9960eed01';
const privateKey = createStacksPrivateKey(key);
```

## STX Token Transfer Transaction

```javascript
import { 
  makeSTXTokenTransfer, 
  makeStandardSTXPostCondition, 
  StacksMainnet, 
  broadcastTransaction
} from '@blockstack/stacks-transactions';
const BigNum = require('bn.js');

const network = new StacksMainnet();

const txOptions = {
  recipient: 'SP3FGQ8Z7JY9BWYZ5WM53E0M9NK7WHJF0691NZ159',
  amount: new BigNum(12345),
  senderKey: 'b244296d5907de9864c0b0d51f98a13c52890be0404e83f273144cd5b9960eed01',
  network,
  memo: "test memo",
  nonce: new BigNum(0), // set a nonce manually if you don't want builder to fetch from a Stacks node
  fee: new BigNum(200), // set a tx fee if you don't want the builder to estimate
};

const transaction = await makeSTXTokenTransfer(txOptions);

// to see the raw serialized tx
const serializedTx = transaction.serialize().toString('hex'); 

// broadcasting transaction to the specified network
broadcastTransaction(transaction, network);
```

## Smart Contract Deploy Transaction

```javascript
import { makeSmartContractDeploy, StacksMainnet, broadcastTransaction } from '@blockstack/stacks-transactions';
const BigNum = require('bn.js');

const network = new StacksMainnet();

const txOptions = {
  contractName: 'contract_name',
  codeBody: fs.readFileSync('/path/to/contract.clar').toString(),
  senderKey: 'b244296d5907de9864c0b0d51f98a13c52890be0404e83f273144cd5b9960eed01',
  network,
};

const transaction = await makeSmartContractDeploy(txOptions);

broadcastTransaction(transaction, network);
```

## Smart Contract Function Call

```javascript
import { makeContractCall, BufferCV, StacksMainnet, broadcastTransaction } from '@blockstack/stacks-transactions';
const BigNum = require('bn.js');

const network = new StacksMainnet();

// Add an optional post condition
// See below for details on constructing post conditions
const postConditionAddress = 'SP2ZD731ANQZT6J4K3F5N8A40ZXWXC1XFXHVVQFKE';
const postConditionCode = FungibleConditionCode.GreaterEqual;
const postConditionAmount = new BigNum(1000000);
const postConditions = [
  makeStandardSTXPostCondition(
    postConditionAddress, 
    postConditionCode, 
    postConditionAmount
  )
];

const txOptions = {
  contractAddress: 'SPBMRFRPPGCDE3F384WCJPK8PQJGZ8K9QKK7F59X',
  contractName: 'contract_name',
  functionName: 'contract_function',
  functionArgs: [bufferCVFromString('foo')],
  senderKey: 'b244296d5907de9864c0b0d51f98a13c52890be0404e83f273144cd5b9960eed01',
  validateWithAbi: true,
  network,
  postConditions,
};

const transaction = await makeContractCall(txOptions);

broadcastTransaction(transaction, network);
```

In this example we construct a `contract-call` transaction with a post condition. We have set the `validateWithAbi` option to `true`, so the `makeContractCall` builder will attempt to fetch this contracts ABI from the specified Stacks network, and validate that the provided functionArgs match what is described in the ABI. This should help you avoid constructing invalid contract-call transactions. If you would prefer to provide your own ABI instead of fetching it from the network, the `validateWithABI` option also accepts [ClarityABI](https://github.com/blockstack/stacks-transactions-js/blob/master/src/contract-abi.ts#L231) objects, which can be constructed from ABI files like so:

```typescript
import { readFileSync } from 'fs';

const abi: ClarityAbi = JSON.parse(readFileSync('abi.json').toString());
```

## Constructing Clarity Values

Building transactions that call functions in deployed clarity contracts requires you to construct valid Clarity Values to pass to the function as arguments. The [Clarity type system](https://github.com/blockstack/stacks-blockchain/blob/master/sip/sip-002-smart-contract-language.md#clarity-type-system) contains the following types:

- `(tuple (key-name-0 key-type-0) (key-name-1 key-type-1) ...)`
  - a typed tuple with named fields.
- `(list max-len entry-type)`
  - a list of maximum length max-len, with entries of type entry-type
- `(response ok-type err-type)`
  - object used by public functions to commit their changes or abort. May be returned or used by other functions as well, however, only public functions have the commit/abort behavior.
- `(optional some-type)`
  - an option type for objects that can either be (some value) or none
- `(buff max-len)`
  - byte buffer or maximum length max-len.
- `principal`
  - object representing a principal (whether a contract principal or standard principal).
- `bool`
  - boolean value ('true or 'false)
- `int`
  - signed 128-bit integer
- `uint`
  - unsigned 128-bit integer

This library contains Typescript types and classes that map to the Clarity types, in order to make it easy to construct well-typed Clarity values in Javascript. These types all extend the abstract class `ClarityValue`.

```javascript

// construct boolean clarity values
const t = trueCV();
const f = falseCV();

// construct optional clarity values
const nothing = noneCV();
const something = someCV(t);

// construct a buffer clarity value from an existing Buffer
const buffer = Buffer.from('foo');
const bufCV = bufferCV(buffer);

// construct signed and unsigned integer clarity values
const i = intCV(-10);
const u = uintCV(10);

// construct principal clarity values
const address = 'SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B';
const contractName = 'contract-name';
const spCV = standardPrincipalCV(address);
const cpCV = contractPrincipalCV(address, contractName);

// construct response clarity values
const errCV = responseErrorCV(trueCV());
const okCV = responseOkCV(falseCV());

// construct tuple clarity values
const tupCV = tupleCV({
  'a': intCV(1),
  'b': trueCV(),
  'c': falseCV()
})

// construct list clarity values
const l = listCV([trueCV(), falseCV()])
```

If you develop in Typescript, the type checker can help prevent you from creating wrongly-typed Clarity values. For example, the following code won't compile since in Clarity lists are homogeneous, meaning they can only contain values of a single type. It is important to include the type variable `BooleanCV` in this example, otherwise the typescript type checker won't know which type the list is of and won't enforce homogeneity.

```typescript
const l = listCV<BooleanCV>([trueCV(), intCV(1)]);
```

## Post Conditions
Three types of post conditions can be added to transactions: 

1. STX post condition
2. Fungible token post condition
3. Non-Fungible token post condition

For details see: https://github.com/blockstack/stacks-blockchain/blob/master/sip/sip-005-blocks-and-transactions.md#transaction-post-conditions

### STX post condition
```javascript
// With a standard principal
const postConditionAddress = 'SP2ZD731ANQZT6J4K3F5N8A40ZXWXC1XFXHVVQFKE';
const postConditionCode = FungibleConditionCode.GreaterEqual;
const postConditionAmount = new BigNum(12345);

const standardSTXPostCondition = makeStandardSTXPostCondition(
  postConditionAddress,
  postConditionCode,
  postConditionAmount
);

// With a contract principal
const contractAddress = 'SPBMRFRPPGCDE3F384WCJPK8PQJGZ8K9QKK7F59X';
const contractName = 'test-contract';

const contractSTXPostCondition = makeContractSTXPostCondition(
  contractAddress,
  contractName,
  postConditionCode,
  postConditionAmount
);
```

### Fungible token post condition
```javascript
// With a standard principal
const postConditionAddress = 'SP2ZD731ANQZT6J4K3F5N8A40ZXWXC1XFXHVVQFKE';
const postConditionCode = FungibleConditionCode.GreaterEqual;
const postConditionAmount = new BigNum(12345);
const assetAddress = 'SP62M8MEFH32WGSB7XSF9WJZD7TQB48VQB5ANWSJ';
const assetContractName = 'test-asset-contract';
const fungibleAssetInfo = createAssetInfo(
  assetAddress,
  assetContractName
);

const standardFungiblePostCondition = makeStandardFungiblePostCondition(
  postConditionAddress,
  postConditionCode,
  postConditionAmount,
  fungibleAssetInfo 
);

// With a contract principal
const contractAddress = 'SPBMRFRPPGCDE3F384WCJPK8PQJGZ8K9QKK7F59X';
const contractName = 'test-contract';
const assetAddress = 'SP62M8MEFH32WGSB7XSF9WJZD7TQB48VQB5ANWSJ';
const assetContractName = 'test-asset-contract';
const fungibleAssetInfo = createAssetInfo(
  assetAddress,
  assetContractName
);

const contractFungiblePostCondition = makeContractFungiblePostCondition(
  contractAddress,
  contractName,
  postConditionCode,
  postConditionAmount,
  fungibleAssetInfo
);
```

### Non-fungible token post condition
```javascript
// With a standard principal
const postConditionAddress = 'SP2ZD731ANQZT6J4K3F5N8A40ZXWXC1XFXHVVQFKE';
const postConditionCode = NonFungibleConditionCode.Owns;
const assetAddress = 'SP62M8MEFH32WGSB7XSF9WJZD7TQB48VQB5ANWSJ';
const assetContractName = 'test-asset-contract';
const assetName = 'test-asset';
const tokenAssetName = 'test-token-asset';
const nonFungibleAssetInfo = createAssetInfo(
  assetAddress,
  assetContractName,
  assetName
)

const standardNonFungiblePostCondition = makeStandardNonFungiblePostCondition(
  postConditionAddress,
  postConditionCode,
  nonFungibleAssetInfo,
  tokenAssetName
);

// With a contract principal
const contractAddress = 'SPBMRFRPPGCDE3F384WCJPK8PQJGZ8K9QKK7F59X';
const contractName = 'test-contract';

const contractNonFungiblePostCondition = makeContractNonFungiblePostCondition(
  contractAddress,
  contractName,
  postConditionCode,
  nonFungibleAssetInfo,
  tokenAssetName
);
```

## Post Conditions
Three types of post conditions can be added to transactions: 

1. STX post condition
2. Fungible token post condition
3. Non-Fungible token post condition

For details see: https://github.com/blockstack/stacks-blockchain/blob/master/sip/sip-005-blocks-and-transactions.md#transaction-post-conditions

### STX post condition
```javascript
// With a standard principal
const postConditionAddress = 'SP2ZD731ANQZT6J4K3F5N8A40ZXWXC1XFXHVVQFKE';
const postConditionCode = FungibleConditionCode.GreaterEqual;
const postConditionAmount = new BigNum(12345);

const standardSTXPostCondition = makeStandardSTXPostCondition(
  postConditionAddress,
  postConditionCode,
  postConditionAmount
);

// With a contract principal
const contractAddress = 'SPBMRFRPPGCDE3F384WCJPK8PQJGZ8K9QKK7F59X';
const contractName = 'test-contract';

const contractSTXPostCondition = makeContractSTXPostCondition(
  contractAddress,
  contractName,
  postConditionCode,
  postConditionAmount
);
```

### Fungible token post condition
```javascript
// With a standard principal
const postConditionAddress = 'SP2ZD731ANQZT6J4K3F5N8A40ZXWXC1XFXHVVQFKE';
const postConditionCode = FungibleConditionCode.GreaterEqual;
const postConditionAmount = new BigNum(12345);
const assetAddress = 'SP62M8MEFH32WGSB7XSF9WJZD7TQB48VQB5ANWSJ';
const assetContractName = 'test-asset-contract';
const fungibleAssetInfo = createAssetInfo(
  assetAddress,
  assetContractName
)

const standardFungiblePostCondition = makeStandardFungiblePostCondition(
  postConditionAddress,
  postConditionCode,
  postConditionAmount,
  fungibleAssetInfo 
);

// With a contract principal
const contractAddress = 'SPBMRFRPPGCDE3F384WCJPK8PQJGZ8K9QKK7F59X';
const contractName = 'test-contract';
const assetAddress = 'SP62M8MEFH32WGSB7XSF9WJZD7TQB48VQB5ANWSJ';
const assetContractName = 'test-asset-contract';
const fungibleAssetInfo = createAssetInfo(
  assetAddress,
  assetContractName
)

const contractFungiblePostCondition = makeContractFungiblePostCondition(
  contractAddress,
  contractName,
  postConditionCode,
  postConditionAmount,
  fungibleAssetInfo
);
```

### Non-fungible token post condition
```javascript
// With a standard principal
const postConditionAddress = 'SP2ZD731ANQZT6J4K3F5N8A40ZXWXC1XFXHVVQFKE';
const postConditionCode = NonFungibleConditionCode.Owns;
const assetAddress = 'SP62M8MEFH32WGSB7XSF9WJZD7TQB48VQB5ANWSJ';
const assetContractName = 'test-asset-contract';
const assetName = 'test-asset';
const tokenAssetName = 'test-token-asset';
const nonFungibleAssetInfo = createAssetInfo(
  assetAddress,
  assetContractName,
  assetName
)

const standardNonFungiblePostCondition = makeStandardNonFungiblePostCondition(
  postConditionAddress,
  postConditionCode,
  nonFungibleAssetInfo,
  tokenAssetName
);

// With a contract principal
const contractAddress = 'SPBMRFRPPGCDE3F384WCJPK8PQJGZ8K9QKK7F59X';
const contractName = 'test-contract';

const contractNonFungiblePostCondition = makeContractNonFungiblePostCondition(
  contractAddress,
  contractName,
  postConditionCode,
  nonFungibleAssetInfo,
  tokenAssetName
);
```
