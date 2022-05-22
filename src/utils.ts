// Copyright © 2020-2022 Truestamp Inc. All rights reserved.

import { sign } from 'tweetnacl'
import { decode as hexDecode } from '@stablelib/hex'
import { assert } from 'superstruct'

import { JsonFile, SignedEntropy, SignedEntropyStruct } from './types'

import { ED25519_PUBLIC_KEY } from './constants'

export function getNowInUnixSeconds(): number {
  const nowInSeconds = Math.floor(Date.now() / 1000)
  return parseInt(nowInSeconds.toString(), 10)
}

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random
export function getRandomInt(min: number, max: number): number {
  min = Math.ceil(min)
  max = Math.floor(max)
  return Math.floor(Math.random() * (max - min) + min) // The maximum is exclusive and the minimum is inclusive
}

// generate a new hash slowly (naïve unicorn style 'sloth' function)
const genSlowHash = async (
  hash: string,
  hashIterations: number,
  hashType: string,
): Promise<string> => {
  let newHash = hash

  const hashTypeCoerced = hashType.replace('sha', 'sha-').toUpperCase()

  for (let i = 0; i < hashIterations; i++) {
    const encoder = new TextEncoder()
    const hashBuffer = await crypto.subtle.digest(
      hashTypeCoerced,
      encoder.encode(newHash),
    )

    const hashArray = Array.from(new Uint8Array(hashBuffer))

    newHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  }

  return newHash
}

const concatenateFileHashes = (files: JsonFile[]): string => {
  const hashes = []
  for (const file of files) {
    hashes.push(file.hash)
  }
  return hashes.join('')
}

export const hasValidEntropySignature = async (
  hash: string,
  entropy: SignedEntropy,
): Promise<boolean> => {
  try {
    assert(entropy, SignedEntropyStruct)

    if (hash !== entropy.hash) {
      return false
    }

    // Verify ed25519 signature over the hash
    if (
      !sign.detached.verify(
        hexDecode(entropy.hash),
        hexDecode(entropy.signature),
        hexDecode(ED25519_PUBLIC_KEY),
      )
    ) {
      return false
    }

    // Concatenate the file hashes in the Entropy file
    const concatenatedFileHashes = concatenateFileHashes(entropy.files)

    // Generate the slow hash of the concatenated file hashes
    const slowHash = await genSlowHash(
      concatenatedFileHashes,
      entropy.hashIterations,
      'sha256',
    )

    // Confirm that the slow hash matches the hash of the Entropy file
    // Confirming that the entropy files were not tampered with.
    // This takes about 7 seconds to run on Cloudflare and thus
    // required switching to the 'Unbound' Worker plan.
    if (slowHash !== hash) {
      return false
    }

    return true
  } catch (error) {
    return false
  }
}
