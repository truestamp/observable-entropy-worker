// Copyright © 2020-2021 Truestamp Inc. All rights reserved.

import { Router } from 'worktop'
import * as CORS from 'worktop/cors'
import * as Cache from 'worktop/cache'

import { ulid, toHEX } from 'worktop/utils'

import { read, write, paginate } from 'worktop/kv'
import type { KV } from 'worktop/kv'

import { DateTime } from 'luxon'

import { sign } from 'tweetnacl'
import { decode as hexDecode } from '@stablelib/hex'

import {
  array,
  assert,
  define,
  enums,
  Infer,
  optional,
  object,
  number,
  string,
  StructError,
} from 'superstruct'

declare const OBSERVABLE_ENTROPY: KV.Namespace

const SHA1_REGEX = /^(?:(0x)*([A-Fa-f0-9]{2}){20})$/i
const SHA256_REGEX = /^(?:(0x)*([A-Fa-f0-9]{2}){32})$/i
const SIGNATURE_REGEX = /^(?:(0x)*([A-Fa-f0-9]{2}){64})$/i
const ED25519_PUBLIC_KEY =
  '2682144fd3a0a10edce91b9c622bf7e83ccb3816574e1a4071ad16842954dd26'
const RAW_BASE_URL =
  'https://raw.githubusercontent.com/truestamp/observable-entropy'

// A valid ISO 8601 date string in UTC timezone
const iso8601UTC = () =>
  define<string>('iso8601', (value) => {
    try {
      if (typeof value === 'string') {
        return (
          DateTime.fromISO(value).isValid &&
          DateTime.fromISO(value).offsetNameShort === 'UTC'
        )
      } else {
        return false
      }
    } catch (error) {
      return false
    }
  })

const sha1Hash = () =>
  define<string>('sha1Hash', (value) => {
    try {
      if (typeof value === 'string') {
        return SHA1_REGEX.test(value)
      } else {
        return false
      }
    } catch (error) {
      return false
    }
  })

const sha256Hash = () =>
  define<string>('sha1Hash', (value) => {
    try {
      if (typeof value === 'string') {
        return SHA256_REGEX.test(value)
      } else {
        return false
      }
    } catch (error) {
      return false
    }
  })

const signature = () =>
  define<string>('signature', (value) => {
    try {
      if (typeof value === 'string') {
        return SIGNATURE_REGEX.test(value)
      } else {
        return false
      }
    } catch (error) {
      return false
    }
  })

export const EntryStruct = object({
  entropy: sha256Hash(),
  for: optional(string()),
})

export type Entry = Infer<typeof EntryStruct>

export const JsonFileStruct = object({
  hash: string(),
  hashType: string(),
  name: string(),
})

export type JsonFile = Infer<typeof JsonFileStruct>

export const EntropyStruct = object({
  id: optional(sha1Hash()),
  createdAt: iso8601UTC(),
  files: array(JsonFileStruct),
  hash: sha256Hash(),
  hashIterations: number(),
  hashType: enums(['sha256']),
  prevHash: optional(sha256Hash()),
  signature: optional(signature()),
  forCommit: optional(sha1Hash()),
})

export type Entropy = Infer<typeof EntropyStruct>

export const SignedEntropyStruct = object({
  createdAt: iso8601UTC(),
  files: array(JsonFileStruct),
  hash: sha256Hash(),
  hashIterations: number(),
  hashType: enums(['sha256']),
  prevHash: sha256Hash(),
  signature: signature(),
})

export type SignedEntropy = Infer<typeof SignedEntropyStruct>

export const GetEntriesRespStruct = array(sha256Hash())

function getNowInUnixSeconds(): number {
  const nowInSeconds = Math.floor(Date.now() / 1000)
  return parseInt(nowInSeconds.toString(), 10)
}

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random
function getRandomInt(min: number, max: number): number {
  min = Math.ceil(min)
  max = Math.floor(max)
  return Math.floor(Math.random() * (max - min) + min) // The maximum is exclusive and the minimum is inclusive
}

async function digestMessage(message: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder()
  const data = encoder.encode(message)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return hash
}

const fetchEntropyByGitCommitId = async (id: string): Promise<Response> => {
  // w/ cloudflare caching
  // https://developers.cloudflare.com/workers/examples/cache-using-fetch
  // https://developers.cloudflare.com/workers/runtime-apis/request/#requestinitcfproperties
  return await fetch(`${RAW_BASE_URL}/${id}/entropy.json`, {
    cf: {
      // Force response to be cached for 86400 seconds for 200 status
      // codes, 1 second for 404, and do not cache 500 errors.
      cacheTtlByStatus: { '200-299': 86400, '404': 5, '500-599': 0 },
      cacheEverything: true,
    },
  })
}

const fetchEntropyByEntropyHash = async (hash: string): Promise<Response> => {
  // Lookup the Git Commit Id for the given entropy hash
  // w/ cloudflare caching
  // https://developers.cloudflare.com/workers/examples/cache-using-fetch
  // https://developers.cloudflare.com/workers/runtime-apis/request/#requestinitcfproperties
  const respHash = await fetch(
    `${RAW_BASE_URL}/main/index/by/entropy_hash/${hash}.json`,
    {
      cf: {
        // Force response to be cached for 86400 seconds for 200 status
        // codes, 1 second for 404, and do not cache 500 errors.
        cacheTtlByStatus: { '200-299': 86400, '404': 5, '500-599': 0 },
        cacheEverything: true,
      },
    },
  )

  if (respHash.ok) {
    // Retrieve and assert that the Commit Id is a valid SHA1 hash
    const respJsonId = await respHash.json()
    assert(respJsonId, object({ id: sha1Hash() }))

    // Fetch the Entropy by the Git Commit Id
    return await fetchEntropyByGitCommitId(respJsonId.id)
  } else {
    return respHash
  }
}

const fetchLatestEntropy = async (): Promise<Response> => {
  // w/ cloudflare caching
  // https://developers.cloudflare.com/workers/examples/cache-using-fetch
  // https://developers.cloudflare.com/workers/runtime-apis/request/#requestinitcfproperties
  return await fetch(`${RAW_BASE_URL}/main/entropy.json`, {
    cf: {
      // Force response to be cached for 86400 seconds for 200 status
      // codes, 1 second for 404, and do not cache 500 errors.
      cacheTtlByStatus: { '200-299': 86400, '404': 5, '500-599': 0 },
      cacheEverything: true,
    },
  })
}

const concatenateFileHashes = (files: JsonFile[]): string => {
  const hashes = []
  for (const file of files) {
    hashes.push(file.hash)
  }
  return hashes.join('')
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

const hasValidEntropySignature = async (
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

const API = new Router()

/**
 * Handles `OPTIONS` requests using the same settings.
 * NOTE: Call `CORS.preflight` per-route for individual settings.
 */
API.prepare = CORS.preflight({
  origin: '*', // allow any `Origin` to connect
  headers: ['Cache-Control', 'Content-Type'],
  methods: ['GET', 'HEAD', 'POST'],
})

// Redirect to GitHub repository README
// http https://entropy.truestamp.com/
API.add('GET', '/', async (req, res): Promise<void> => {
  res.setHeader('Cache-Control', 'public, max-age=60, s-max-age=60')
  res.setHeader('Location', 'https://observable-entropy.truestamp.com')
  res.send(302, {
    status: '302',
    code: 'Found',
    description: `Please visit https://observable-entropy.truestamp.com for more info.`,
  })
})

// Get the ed25519 public key, for the corresponding private key which is stored as a
// repository secret in the observable-entropy github repository.
// http https://entropy.truestamp.com/pubkey
API.add('GET', '/pubkey', async (req, res): Promise<void> => {
  res.setHeader('Cache-Control', 'public, max-age=60, s-max-age=60')
  res.send(200, {
    key: ED25519_PUBLIC_KEY,
  })
})

// Get the latest entropy.json file from Cloudflare KV or the web
// http https://entropy.truestamp.com/latest
API.add('GET', '/latest', async (req, res): Promise<void> => {
  try {
    const kvLatest = await read(OBSERVABLE_ENTROPY, 'latest', {
      type: 'text',
      metadata: true,
    })

    if (kvLatest && kvLatest.value) {
      const parsedKvLatest = JSON.parse(kvLatest.value)
      assert(parsedKvLatest, EntropyStruct)

      res.setHeader('Cache-Control', 'public, max-age=5, s-max-age=5')
      res.send(200, parsedKvLatest)
    } else {
      console.log(`KV latest is null or missing value : ${kvLatest}`)
    }

    // Fallback to retrieving latest from the web, this is less desirable
    // since it will be cached for some minutes and will be stale.
    const entropyResp = await fetchLatestEntropy()

    if (entropyResp.ok) {
      const entropy = await entropyResp.json()
      assert(entropy, EntropyStruct)
      res.setHeader('Cache-Control', 'public, max-age=5, s-max-age=5')
      res.send(200, entropy)
    } else {
      res.send(404, {
        status: '404',
        code: 'Not found',
        description: `No entropy found for latest`,
      })
    }
  } catch (err) {
    res.setHeader('Cache-Control', 'public, max-age=0, s-max-age=0')

    if (err instanceof StructError) {
      console.log('### err: ', err)
      const { key, path, value, type } = err

      if (value === undefined) {
        return res.send(400, {
          status: '400',
          code: 'Invalid parameters',
          description: `missing required attribute : ${key}`,
          path: path,
          attribute: key,
        })
      } else if (type === 'never') {
        return res.send(400, {
          status: '400',
          code: 'Invalid parameters',
          description: `unknown attribute : ${key}`,
          path: path,
          attribute: key,
        })
      } else {
        return res.send(400, {
          status: '400',
          code: 'Invalid parameters',
          description: `invalid attribute value for : ${key}`,
          path: path,
          attribute: key,
          value: value,
        })
      }
    } else if (err instanceof Error) {
      console.error('### err: ', err)
      return res.send(500, {
        status: '500',
        code: 'Unhandled error',
        description: `Internal server error : ${err.message}`,
      })
    }
  }
})

// Retrieve by the Git commit ID when hash.json was created (for the previous commit)
// http https://entropy.truestamp.com/commit/678e9cbef4e78eacf042ac886164e31fb72b6fd1
API.add('GET', '/commit/:id', async (req, res) => {
  const id = req.params.id

  if (!SHA1_REGEX.test(id)) {
    return res.send(400, {
      status: '400',
      code: 'Invalid parameters',
      description: `invalid attribute value for : id`,
    })
  }

  try {
    const entropyResp = await fetchEntropyByGitCommitId(id)

    if (entropyResp.ok) {
      const entropy = await entropyResp.json()
      assert(entropy, EntropyStruct)
      res.setHeader('Cache-Control', 'public, max-age=5, s-max-age=5')
      res.send(200, entropy)
    } else {
      res.send(404, {
        status: '404',
        code: 'Not found',
        description: `No entropy found for commit : ${id}`,
      })
    }
  } catch (err) {
    res.setHeader('Cache-Control', 'public, max-age=0, s-max-age=0')

    if (err instanceof StructError) {
      console.log('### err: ', err)
      const { key, path, value, type } = err

      if (value === undefined) {
        return res.send(400, {
          status: '400',
          code: 'Invalid parameters',
          description: `missing required attribute : ${key}`,
          path: path,
          attribute: key,
        })
      } else if (type === 'never') {
        return res.send(400, {
          status: '400',
          code: 'Invalid parameters',
          description: `unknown attribute : ${key}`,
          path: path,
          attribute: key,
        })
      } else {
        return res.send(400, {
          status: '400',
          code: 'Invalid parameters',
          description: `invalid attribute value for : ${key}`,
          path: path,
          attribute: key,
          value: value,
        })
      }
    } else if (err instanceof Error) {
      console.error('### err: ', err)
      return res.send(500, {
        status: '500',
        code: 'Unhandled error',
        description: `Internal server error : ${err.message}`,
      })
    }
  }
})

// Retrieve by the entropy hash value, which is an index lookup for the associated commit ID
// http https://entropy.truestamp.com/hash/605ba3b4cce44f2a09ad681d92aa20f5d122658e1878e18c71705d41c658891e
API.add('GET', '/hash/:hash', async (req, res) => {
  const hash = req.params.hash

  if (!SHA256_REGEX.test(hash)) {
    return res.send(400, {
      status: '400',
      code: 'Invalid parameters',
      description: `invalid attribute value for : hash`,
    })
  }

  try {
    const entropyResp: Response = await fetchEntropyByEntropyHash(hash)
    if (entropyResp.ok) {
      const entropy = await entropyResp.json()
      assert(entropy, EntropyStruct)
      res.setHeader('Cache-Control', 'public, max-age=5, s-max-age=5')
      res.send(200, entropy)
    } else {
      res.send(404, {
        status: '404',
        code: 'Not found',
        description: `No entropy found for hash : ${hash}`,
      })
    }
  } catch (err) {
    res.setHeader('Cache-Control', 'public, max-age=0, s-max-age=0')

    if (err instanceof StructError) {
      console.log('### err: ', err)
      const { key, path, value, type } = err

      if (value === undefined) {
        return res.send(400, {
          status: '400',
          code: 'Invalid parameters',
          description: `missing required attribute : ${key}`,
          path: path,
          attribute: key,
        })
      } else if (type === 'never') {
        return res.send(400, {
          status: '400',
          code: 'Invalid parameters',
          description: `unknown attribute : ${key}`,
          path: path,
          attribute: key,
        })
      } else {
        return res.send(400, {
          status: '400',
          code: 'Invalid parameters',
          description: `invalid attribute value for : ${key}`,
          path: path,
          attribute: key,
          value: value,
        })
      }
    } else if (err instanceof Error) {
      console.error('### err: ', err)
      return res.send(500, {
        status: '500',
        code: 'Unhandled error',
        description: `Internal server error : ${err.message}`,
      })
    }
  }
})

// POST a new entropy value onto the stack, to be included in the next entropy.json
// http -v POST https://entropy.truestamp.com/entries entropy=bdd1d11b1ab7569c40e07a61b5b6071d80efcf5db176d8ab172e15d5566cb342
API.add('POST', '/entries', async (req, res) => {
  try {
    const entryBody = await req.body<Entry>()
    assert(entryBody, EntryStruct)

    const key = `entry::${ulid()}`

    // Auto-expire all entries after a random interval between 10 and 60 minutes from now
    // To ensure that the entry is unpredictably present in at least one, and possibly
    // up to an hour's worth of observable entropy runs.
    const expiration: number = getNowInUnixSeconds() + 60 * getRandomInt(10, 60)

    // For each entry, store the hashed entry as well. This prevents the perception that someone could
    // use a chosen entry value to 'poison' the observable entropy pool as there will always be an unpredictable
    // additional entry added alongside the one they submitted.
    const hashedEntry = await digestMessage(
      `${key}::${expiration}::${entryBody.entropy}`,
    )

    const successWriteHashedEntry = await write<Entry>(
      OBSERVABLE_ENTROPY,
      `${key}::hashed`,
      { entropy: toHEX(hashedEntry), for: key },
      {
        expiration,
      },
    )

    if (!successWriteHashedEntry) {
      return res.send(500, {
        error: true,
        message: 'Internal Server Error : Failed to write hashed entry.',
      })
    }

    const successWriteEntry = await write<Entry>(
      OBSERVABLE_ENTROPY,
      key,
      entryBody,
      {
        expiration,
      },
    )

    if (successWriteEntry) {
      res.send(201, {
        key,
        entropy: entryBody.entropy,
        expiration,
      })
    } else {
      res.send(500, {
        error: true,
        message: 'Internal Server Error : Failed to write entry.',
      })
    }
  } catch (err) {
    res.setHeader('Cache-Control', 'public, max-age=0, s-max-age=0')

    if (err instanceof StructError) {
      console.log('### err: ', err)
      const { key, path, value, type } = err

      if (value === undefined) {
        return res.send(400, {
          status: '400',
          code: 'Invalid parameters',
          description: `missing required attribute : ${key}`,
          path: path,
          attribute: key,
        })
      } else if (type === 'never') {
        return res.send(400, {
          status: '400',
          code: 'Invalid parameters',
          description: `unknown attribute : ${key}`,
          path: path,
          attribute: key,
        })
      } else {
        return res.send(400, {
          status: '400',
          code: 'Invalid parameters',
          description: `invalid attribute value for : ${key}`,
          path: path,
          attribute: key,
          value: value,
        })
      }
    } else if (err instanceof Error) {
      console.error('### err: ', err)
      return res.send(500, {
        status: '500',
        code: 'Unhandled error',
        description: `Internal server error : ${err.message}`,
      })
    }
  }
})

// GET the latest entries
// http https://entropy.truestamp.com/entries
API.add('GET', '/entries', async (req, res) => {
  const prefix = 'entry::'
  const keys = await paginate<string[]>(OBSERVABLE_ENTROPY, { prefix })

  const entryKeys = keys.map((key) => {
    return key
  })

  const kvEntries: string[] = []
  for (const e of entryKeys) {
    // retrieve the entry from KV store
    const kvEntry = await read(OBSERVABLE_ENTROPY, e, {
      type: 'text',
      metadata: true,
    })

    if (!kvEntry || !kvEntry.value) {
      console.log(`kvEntry is null : ${kvEntry}`)
      continue
    }

    const parsedKvEntry = JSON.parse(kvEntry.value)
    if (!parsedKvEntry || !parsedKvEntry.entropy) {
      console.log(`parsedKvEntry is null : ${parsedKvEntry}`)
      continue
    }

    kvEntries.push(parsedKvEntry.entropy)
  }

  assert(kvEntries, GetEntriesRespStruct)

  res.setHeader('Cache-Control', 'public, max-age=5, s-max-age=5')
  res.send(200, kvEntries)
})

// Retrieve the entropy file and validate that its file hashes result in the same
// top level hash, and that the signature over the hash is valid.
// http https://entropy.truestamp.com/verify/commit/0813fb5b24e2e2a08363d90b7b77b4a1889fa77c
API.add('GET', '/verify/commit/:id', async (req, res) => {
  const id = req.params.id

  if (!SHA1_REGEX.test(id)) {
    return res.send(400, {
      status: '400',
      code: 'Invalid parameters',
      description: `invalid attribute value for : id`,
    })
  }

  try {
    const entropyResp: Response = await fetchEntropyByGitCommitId(id)
    if (entropyResp.ok) {
      const entropy: SignedEntropy = await entropyResp.json<SignedEntropy>()

      const verified = await hasValidEntropySignature(entropy.hash, entropy)

      res.setHeader('Cache-Control', 'public, max-age=5, s-max-age=5')
      if (verified) {
        res.send(200, { verified: true })
      } else {
        res.send(406, {
          status: '406',
          code: 'Not Acceptable',
          description: `Invalid signature for commit : ${id}`,
        })
      }
    } else {
      res.send(404, {
        status: '404',
        code: 'Not found',
        description: `No entropy found for commit : ${id}`,
      })
    }
  } catch (err) {
    res.setHeader('Cache-Control', 'public, max-age=0, s-max-age=0')

    if (err instanceof StructError) {
      console.log('### err: ', err)
      const { key, path, value, type } = err

      if (value === undefined) {
        return res.send(400, {
          status: '400',
          code: 'Invalid parameters',
          description: `missing required attribute : ${key}`,
          path: path,
          attribute: key,
        })
      } else if (type === 'never') {
        return res.send(400, {
          status: '400',
          code: 'Invalid parameters',
          description: `unknown attribute : ${key}`,
          path: path,
          attribute: key,
        })
      } else {
        return res.send(400, {
          status: '400',
          code: 'Invalid parameters',
          description: `invalid attribute value for : ${key}`,
          path: path,
          attribute: key,
          value: value,
        })
      }
    } else if (err instanceof Error) {
      console.error('### err: ', err)
      return res.send(500, {
        status: '500',
        code: 'Unhandled error',
        description: `Internal server error : ${err.message}`,
      })
    }
  }
})

// Retrieve the entropy file and validate that its file hashes result in the same
// top level hash, and that the signature over the hash is valid.
// http https://entropy.truestamp.com/verify/hash/605ba3b4cce44f2a09ad681d92aa20f5d122658e1878e18c71705d41c658891e
API.add('GET', '/verify/hash/:hash', async (req, res) => {
  const hash = req.params.hash

  if (!SHA256_REGEX.test(hash)) {
    return res.send(400, {
      status: '400',
      code: 'Invalid parameters',
      description: `invalid attribute value for : hash`,
    })
  }

  try {
    const entropyResp: Response = await fetchEntropyByEntropyHash(hash)
    if (entropyResp.ok) {
      const entropy: SignedEntropy = await entropyResp.json<SignedEntropy>()

      const verified = await hasValidEntropySignature(hash, entropy)

      res.setHeader('Cache-Control', 'public, max-age=5, s-max-age=5')
      if (verified) {
        res.send(200, { verified: true })
      } else {
        res.send(406, {
          status: '406',
          code: 'Not Acceptable',
          description: `Invalid signature for hash : hash ${hash}`,
        })
      }
    } else {
      res.send(404, {
        status: '404',
        code: 'Not found',
        description: `No entropy found for hash : ${hash}`,
      })
    }
  } catch (err) {
    res.setHeader('Cache-Control', 'public, max-age=0, s-max-age=0')

    if (err instanceof StructError) {
      console.log('### err: ', err)
      const { key, path, value, type } = err

      if (value === undefined) {
        return res.send(400, {
          status: '400',
          code: 'Invalid parameters',
          description: `missing required attribute : ${key}`,
          path: path,
          attribute: key,
        })
      } else if (type === 'never') {
        return res.send(400, {
          status: '400',
          code: 'Invalid parameters',
          description: `unknown attribute : ${key}`,
          path: path,
          attribute: key,
        })
      } else {
        return res.send(400, {
          status: '400',
          code: 'Invalid parameters',
          description: `invalid attribute value for : ${key}`,
          path: path,
          attribute: key,
          value: value,
        })
      }
    } else if (err instanceof Error) {
      console.error('### err: ', err)
      return res.send(500, {
        status: '500',
        code: 'Unhandled error',
        description: `Internal server error : ${err.message}`,
      })
    }
  }
})

// Attach "fetch" event handler
// ~> use `Cache` for request-matching, when permitted
// ~> store Response in `Cache`, when permitted
Cache.listen(API.run)
