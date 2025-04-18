import { Construct } from 'constructs';
import { Stack } from '../../core';
import { ValidationError } from '../../core/lib/errors';

export interface Content {
  readonly text: string;
  readonly markers: Record<string, any>;
}

/**
 * Renders the given string data as deployable content with markers substituted
 * for all "Ref" and "Fn::GetAtt" objects.
 *
 * @param scope Construct scope
 * @param data The input data
 * @returns The markered text (`text`) and a map that maps marker names to their
 * values (`markers`).
 */
export function renderData(scope: Construct, data: string): Content {
  const obj = Stack.of(scope).resolve(data);
  if (typeof(obj) === 'string') {
    return { text: obj, markers: {} };
  }

  if (typeof(obj) !== 'object') {
    throw new ValidationError(`Unexpected: after resolve() data must either be a string or a CloudFormation intrinsic. Got: ${JSON.stringify(obj)}`, scope);
  }

  let markerIndex = 0;
  const markers: Record<string, FnJoinPart> = {};
  const result = new Array<string>();
  const fnJoin: FnJoin | undefined = obj['Fn::Join'];

  if (fnJoin) {
    const sep = fnJoin[0];
    const parts = fnJoin[1];

    if (sep !== '') {
      throw new ValidationError(`Unexpected "Fn::Join", expecting separator to be an empty string but got "${sep}"`, scope);
    }

    for (const part of parts) {
      if (typeof (part) === 'string') {
        result.push(part);
        continue;
      }

      if (typeof (part) === 'object') {
        addMarker(part);
        continue;
      }

      throw new ValidationError(`Unexpected "Fn::Join" part, expecting string or object but got ${typeof (part)}`, scope);
    }
  } else if (obj.Ref || obj['Fn::GetAtt'] || obj['Fn::Select']) {
    addMarker(obj);
  } else {
    throw new ValidationError('Unexpected: Expecting `resolve()` to return "Fn::Join", "Ref" or "Fn::GetAtt"', scope);
  }

  function addMarker(part: Ref | GetAtt | FnSelect |FnFindInMap) {
    const keys = Object.keys(part);
    const acceptedCfnFns = ['Ref', 'Fn::GetAtt', 'Fn::Select', 'Fn::FindInMap'];
    if (keys.length !== 1 || !acceptedCfnFns.includes(keys[0])) {
      const stringifiedAcceptedCfnFns = acceptedCfnFns.map((fn) => `"${fn}"`).join(' or ');
      throw new ValidationError(`Invalid CloudFormation reference. Key must start with any of ${stringifiedAcceptedCfnFns}. Got ${JSON.stringify(part)}`, scope);
    }

    const marker = `<<marker:0xbaba:${markerIndex++}>>`;
    result.push(marker);
    markers[marker] = part;
  }

  return { text: result.join(''), markers };
}

type FnJoin = [string, FnJoinPart[]];
type FnJoinPart = string | Ref | GetAtt | FnSelect | FnFindInMap;
type Ref = { Ref: string };
type GetAtt = { 'Fn::GetAtt': [string, string] };
type FnSplit = { 'Fn::Split': [string, string | Ref] };
type FnSelect = { 'Fn::Select': [number, string[] | FnSplit] };
type FnFindInMap = { 'Fn::FindInMap': [string, string, string] };
