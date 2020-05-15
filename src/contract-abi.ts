import * as _ from 'lodash';

import {
  ClarityValue,
  uintCV,
  intCV,
  contractPrincipalCV,
  standardPrincipalCV,
  noneCV,
  bufferCV,
  falseCV,
  trueCV,
  ClarityType,
  getCVTypeString,
} from './clarity';
import { ContractCallPayload, createContractCallPayload } from './payload';

class NotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.message = message;
    this.name = this.constructor.name;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

// From https://github.com/blockstack/stacks-blockchain-sidecar/blob/master/src/event-stream/contract-abi.ts

export type ClarityAbiTypeBuffer = { buffer: { length: number } };
export type ClarityAbiTypeResponse = { response: { ok: ClarityAbiType; error: ClarityAbiType } };
export type ClarityAbiTypeOptional = { optional: ClarityAbiType };
export type ClarityAbiTypeTuple = { tuple: { name: string; type: ClarityAbiType }[] };
export type ClarityAbiTypeList = { list: { type: ClarityAbiType; length: number } };

export type ClarityAbiTypeUInt128 = 'uint128';
export type ClarityAbiTypeInt128 = 'int128';
export type ClarityAbiTypeBool = 'bool';
export type ClarityAbiTypePrincipal = 'principal';
export type ClarityAbiTypeNone = 'none';

export type ClarityAbiTypePrimitive =
  | ClarityAbiTypeUInt128
  | ClarityAbiTypeInt128
  | ClarityAbiTypeBool
  | ClarityAbiTypePrincipal
  | ClarityAbiTypeNone;

export type ClarityAbiType =
  | ClarityAbiTypePrimitive
  | ClarityAbiTypeBuffer
  | ClarityAbiTypeResponse
  | ClarityAbiTypeOptional
  | ClarityAbiTypeTuple
  | ClarityAbiTypeList;

export enum ClarityAbiTypeId {
  ClarityAbiTypeUInt128 = 1,
  ClarityAbiTypeInt128 = 2,
  ClarityAbiTypeBool = 3,
  ClarityAbiTypePrincipal = 4,
  ClarityAbiTypeNone = 5,
  ClarityAbiTypeBuffer = 6,
  ClarityAbiTypeResponse = 7,
  ClarityAbiTypeOptional = 8,
  ClarityAbiTypeTuple = 9,
  ClarityAbiTypeList = 10,
}

export const isClarityAbiPrimitive = (val: ClarityAbiType): val is ClarityAbiTypePrimitive =>
  typeof val === 'string';
export const isClarityAbiBuffer = (val: ClarityAbiType): val is ClarityAbiTypeBuffer =>
  (val as ClarityAbiTypeBuffer).buffer !== undefined;
export const isClarityAbiResponse = (val: ClarityAbiType): val is ClarityAbiTypeResponse =>
  (val as ClarityAbiTypeResponse).response !== undefined;
export const isClarityAbiOptional = (val: ClarityAbiType): val is ClarityAbiTypeOptional =>
  (val as ClarityAbiTypeOptional).optional !== undefined;
export const isClarityAbiTuple = (val: ClarityAbiType): val is ClarityAbiTypeTuple =>
  (val as ClarityAbiTypeTuple).tuple !== undefined;
export const isClarityAbiList = (val: ClarityAbiType): val is ClarityAbiTypeList =>
  (val as ClarityAbiTypeList).list !== undefined;

export type ClarityAbiTypeUnion =
  | { id: ClarityAbiTypeId.ClarityAbiTypeUInt128; type: ClarityAbiTypeUInt128 }
  | { id: ClarityAbiTypeId.ClarityAbiTypeInt128; type: ClarityAbiTypeInt128 }
  | { id: ClarityAbiTypeId.ClarityAbiTypeBool; type: ClarityAbiTypeBool }
  | { id: ClarityAbiTypeId.ClarityAbiTypePrincipal; type: ClarityAbiTypePrincipal }
  | { id: ClarityAbiTypeId.ClarityAbiTypeNone; type: ClarityAbiTypeNone }
  | { id: ClarityAbiTypeId.ClarityAbiTypeBuffer; type: ClarityAbiTypeBuffer }
  | { id: ClarityAbiTypeId.ClarityAbiTypeResponse; type: ClarityAbiTypeResponse }
  | { id: ClarityAbiTypeId.ClarityAbiTypeOptional; type: ClarityAbiTypeOptional }
  | { id: ClarityAbiTypeId.ClarityAbiTypeTuple; type: ClarityAbiTypeTuple }
  | { id: ClarityAbiTypeId.ClarityAbiTypeList; type: ClarityAbiTypeList };

export function getTypeUnion(val: ClarityAbiType): ClarityAbiTypeUnion {
  if (isClarityAbiPrimitive(val)) {
    if (val === 'uint128') {
      return { id: ClarityAbiTypeId.ClarityAbiTypeUInt128, type: val };
    } else if (val === 'int128') {
      return { id: ClarityAbiTypeId.ClarityAbiTypeInt128, type: val };
    } else if (val === 'bool') {
      return { id: ClarityAbiTypeId.ClarityAbiTypeBool, type: val };
    } else if (val === 'principal') {
      return { id: ClarityAbiTypeId.ClarityAbiTypePrincipal, type: val };
    } else if (val === 'none') {
      return { id: ClarityAbiTypeId.ClarityAbiTypeNone, type: val };
    } else {
      throw new Error(`Unexpected Clarity ABI type primitive: ${JSON.stringify(val)}`);
    }
  } else if (isClarityAbiBuffer(val)) {
    return { id: ClarityAbiTypeId.ClarityAbiTypeBuffer, type: val };
  } else if (isClarityAbiResponse(val)) {
    return { id: ClarityAbiTypeId.ClarityAbiTypeResponse, type: val };
  } else if (isClarityAbiOptional(val)) {
    return { id: ClarityAbiTypeId.ClarityAbiTypeOptional, type: val };
  } else if (isClarityAbiTuple(val)) {
    return { id: ClarityAbiTypeId.ClarityAbiTypeTuple, type: val };
  } else if (isClarityAbiList(val)) {
    return { id: ClarityAbiTypeId.ClarityAbiTypeList, type: val };
  } else {
    throw new Error(`Unexpected Clarity ABI type: ${JSON.stringify(val)}`);
  }
}

function encodeClarityValue(type: ClarityAbiType, val: string): ClarityValue;
function encodeClarityValue(type: ClarityAbiTypeUnion, val: string): ClarityValue;
function encodeClarityValue(
  input: ClarityAbiTypeUnion | ClarityAbiType,
  val: string
): ClarityValue {
  let union: ClarityAbiTypeUnion;
  if ((input as ClarityAbiTypeUnion).id !== undefined) {
    union = input as ClarityAbiTypeUnion;
  } else {
    union = getTypeUnion(input as ClarityAbiType);
  }
  switch (union.id) {
    case ClarityAbiTypeId.ClarityAbiTypeUInt128:
      return uintCV(val);
    case ClarityAbiTypeId.ClarityAbiTypeInt128:
      return intCV(val);
    case ClarityAbiTypeId.ClarityAbiTypeBool:
      if (val === 'false' || val === '0') return falseCV();
      else if (val === 'true' || val === '1') return trueCV();
      else throw new Error(`Unexpected Clarity bool value: ${JSON.stringify(val)}`);
    case ClarityAbiTypeId.ClarityAbiTypePrincipal:
      if (val.includes('.')) {
        const [addr, name] = val.split('.');
        return contractPrincipalCV(addr, name);
      } else {
        return standardPrincipalCV(val);
      }
    case ClarityAbiTypeId.ClarityAbiTypeNone:
      return noneCV();
    case ClarityAbiTypeId.ClarityAbiTypeBuffer:
      return bufferCV(Buffer.from(val, 'utf8'));
    case ClarityAbiTypeId.ClarityAbiTypeResponse:
      throw new NotImplementedError(`Unsupported encoding for Clarity type: ${union.id}`);
    case ClarityAbiTypeId.ClarityAbiTypeOptional:
      throw new NotImplementedError(`Unsupported encoding for Clarity type: ${union.id}`);
    case ClarityAbiTypeId.ClarityAbiTypeTuple:
      throw new NotImplementedError(`Unsupported encoding for Clarity type: ${union.id}`);
    case ClarityAbiTypeId.ClarityAbiTypeList:
      throw new NotImplementedError(`Unsupported encoding for Clarity type: ${union.id}`);
    default:
      throw new Error(`Unexpected Clarity type ID: ${JSON.stringify(union)}`);
  }
}
export { encodeClarityValue };

export function getTypeString(val: ClarityAbiType): string {
  if (isClarityAbiPrimitive(val)) {
    if (val === 'int128') {
      return 'int';
    } else if (val === 'uint128') {
      return 'uint';
    }
    return val;
  } else if (isClarityAbiBuffer(val)) {
    return `(buff ${val.buffer.length})`;
  } else if (isClarityAbiResponse(val)) {
    return `(response ${getTypeString(val.response.ok)} ${getTypeString(val.response.error)})`;
  } else if (isClarityAbiOptional(val)) {
    return `(optional ${getTypeString(val.optional)})`;
  } else if (isClarityAbiTuple(val)) {
    return `(tuple ${val.tuple.map(t => `(${t.name} ${getTypeString(t.type)})`).join(' ')})`;
  } else if (isClarityAbiList(val)) {
    return `(list ${val.list.length} ${getTypeString(val.list.type)})`;
  } else {
    throw new Error(`Type string unsupported for Clarity type: ${JSON.stringify(val)}`);
  }
}

export interface ClarityAbiFunction {
  name: string;
  access: 'private' | 'public' | 'read_only';
  args: {
    name: string;
    type: ClarityAbiType;
  }[];
  outputs: {
    type: ClarityAbiType;
  };
}

export function abiFunctionToString(func: ClarityAbiFunction): string {
  const access = func.access === 'read_only' ? 'read-only' : func.access;
  return `(define-${access} (${func.name} ${func.args
    .map(arg => `(${arg.name} ${getTypeString(arg.type)})`)
    .join(' ')}))`;
}

export interface ClarityAbiVariable {
  name: string;
  access: 'variable' | 'constant';
  type: ClarityAbiType;
}

export interface ClarityAbiMap {
  name: string;
  key: {
    name: string;
    type: ClarityAbiType;
  }[];
  value: {
    name: string;
    type: ClarityAbiType;
  }[];
}

export interface ClarityAbiTypeFungibleToken {
  name: string;
}

export interface ClarityAbiTypeNonFungibleToken {
  name: string;
  type: ClarityAbiType;
}

export interface ClarityAbi {
  functions: ClarityAbiFunction[];
  variables: ClarityAbiVariable[];
  maps: ClarityAbiMap[];
  fungible_tokens: ClarityAbiTypeFungibleToken[];
  non_fungible_tokens: ClarityAbiTypeNonFungibleToken[];
}

function matchType(cv: ClarityValue, abiType: ClarityAbiType): boolean {
  const union = getTypeUnion(abiType);

  switch (cv.type) {
    case ClarityType.BoolTrue:
    case ClarityType.BoolFalse:
      return union.id === ClarityAbiTypeId.ClarityAbiTypeBool;
    case ClarityType.Int:
      return union.id === ClarityAbiTypeId.ClarityAbiTypeInt128;
    case ClarityType.UInt:
      return union.id === ClarityAbiTypeId.ClarityAbiTypeUInt128;
    case ClarityType.Buffer:
      return (
        union.id === ClarityAbiTypeId.ClarityAbiTypeBuffer &&
        union.type.buffer.length === cv.buffer.length
      );
    case ClarityType.OptionalNone:
      return (
        union.id === ClarityAbiTypeId.ClarityAbiTypeNone ||
        union.id === ClarityAbiTypeId.ClarityAbiTypeOptional
      );
    case ClarityType.OptionalSome:
      return (
        union.id === ClarityAbiTypeId.ClarityAbiTypeOptional &&
        matchType(cv.value, union.type.optional)
      );
    case ClarityType.ResponseErr:
      return (
        union.id === ClarityAbiTypeId.ClarityAbiTypeResponse &&
        matchType(cv.value, union.type.response.error)
      );
    case ClarityType.ResponseOk:
      return (
        union.id === ClarityAbiTypeId.ClarityAbiTypeResponse &&
        matchType(cv.value, union.type.response.ok)
      );
    case ClarityType.PrincipalContract:
    case ClarityType.PrincipalStandard:
      return union.id === ClarityAbiTypeId.ClarityAbiTypePrincipal;
    case ClarityType.List:
      return (
        union.id == ClarityAbiTypeId.ClarityAbiTypeList &&
        union.type.list.length === cv.list.length &&
        _.every(cv.list, val => matchType(val, union.type.list.type))
      );
    case ClarityType.Tuple:
      if (union.id == ClarityAbiTypeId.ClarityAbiTypeTuple) {
        const tuple = _.cloneDeep(cv.data);
        for (let i = 0; i < union.type.tuple.length; i++) {
          const abiTupleEntry = union.type.tuple[i];
          const key = abiTupleEntry.name;
          const val = tuple[key];

          // if key exists in cv tuple, check if its type matches the abi
          // return false if key doesn't exist
          if (val) {
            if (!matchType(val, abiTupleEntry.type)) {
              return false;
            }
            delete tuple[key];
          } else {
            return false;
          }
        }
        return true;
      }
    default:
      return false;
  }
}

/**
 * Validates a contract-call payload with a contract ABI
 *
 * @param {ContractCallPayload} payload - a contract-call payload
 * @param {ClarityAbi} abi - a contract ABI
 *
 * @returns {boolean} true if the payloads functionArgs type check against those in the ABI
 */
export function validateContractCall(payload: ContractCallPayload, abi: ClarityAbi): boolean {
  const filtered = abi.functions.filter(fn => fn.name === payload.functionName.content);
  if (filtered.length === 1) {
    const abiFunc = filtered[0];
    const abiArgs = abiFunc.args;

    if (payload.functionArgs.length !== abiArgs.length) {
      throw new Error(
        `Clarity function expects ${abiArgs.length} argument(s) but received ${payload.functionArgs.length}`
      );
    }

    for (let i = 0; i < payload.functionArgs.length; i++) {
      const payloadArg = payload.functionArgs[i];
      const abiArg = abiArgs[i];

      if (!matchType(payloadArg, abiArg.type)) {
        throw new Error(
          `Clarity function \`${payload.functionName.content}\` expects argument ${i +
            1} to be of type ${getTypeString(abiArg.type)}, not ${getCVTypeString(payloadArg)}`
        );
      }
    }

    return true;
  } else if (filtered.length === 0) {
    throw new Error(`ABI doesn't contain a function with the name ${payload.functionName.content}`);
  } else {
    throw new Error(
      `Malformed ABI. Contains multiple functions with the name ${payload.functionName.content}`
    );
  }
}
