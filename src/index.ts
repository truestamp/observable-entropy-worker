// Copyright © 2020-2022 Truestamp Inc. All rights reserved.

import { Router } from 'worktop'
import * as CORS from 'worktop/cors'
import * as Cache from 'worktop/cache'
import { ulid, toHEX } from 'worktop/utils'
import { read, write, paginate } from 'worktop/kv'
import type { KV } from 'worktop/kv'

import { assert, create, object, StructError } from 'superstruct'

import {
  GetEntriesResp,
  SignedEntropy,
  Entropy,
  EntropyStruct,
  Entry,
  EntryStruct,
  sha1Hash,
} from './types'

import {
  SHA1_REGEX,
  SHA256_REGEX,
  ED25519_PUBLIC_KEY,
  RAW_BASE_URL,
} from './constants'

import {
  getNowInUnixSeconds,
  getRandomInt,
  hasValidEntropySignature,
} from './utils'

declare const OBSERVABLE_ENTROPY: KV.Namespace

async function digestMessage(message: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder()
  const data = encoder.encode(message)
  return await crypto.subtle.digest('SHA-256', data)
}

/**
 * Lookup the Entropy hash by Git Commit Id.
 * Uses Cloudflare's caching to speed up the lookup.
 * See : https://developers.cloudflare.com/workers/examples/cache-using-fetch
 * See : https://developers.cloudflare.com/workers/runtime-apis/request/#requestinitcfproperties
 * @param id A Git commit Id to use as a lookup key for entropy.
 * @returns A Response object.
 */
const fetchEntropyByGitCommitId = async (id: string): Promise<Response> => {
  return await fetch(`${RAW_BASE_URL}/${id}/entropy.json`, {
    cf: {
      // Force response to be cached for 86400 seconds for 200 status
      // codes, 1 second for 404, and do not cache 500 errors.
      cacheTtlByStatus: { '200-299': 86400, '404': 5, '500-599': 0 },
      cacheEverything: true,
    },
  })
}

/**
 * Lookup the Git Commit Id for the given entropy hash.
 * Uses Cloudflare's caching to speed up the lookup.
 * See : https://developers.cloudflare.com/workers/examples/cache-using-fetch
 * See : https://developers.cloudflare.com/workers/runtime-apis/request/#requestinitcfproperties
 * @param hash A hex hash to use as a lookup key for entropy.
 * @returns A Response object.
 */
const fetchEntropyByEntropyHash = async (hash: string): Promise<Response> => {
  const respHash = await fetch(
    `${RAW_BASE_URL}/main/index/by/entropy_hash/${hash}.json`,
    {
      cf: {
        // Cache response for different durations based on response code.
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

/**
 * Fetch the latest Entropy from the GitHub raw content.
 * @returns A Response object.
 */
const fetchLatestEntropy = async (): Promise<Response> => {
  return await fetch(`${RAW_BASE_URL}/main/entropy.json`, {
    cf: {
      // Cache response for different durations based on response code.
      cacheTtlByStatus: { '200-299': 86400, '404': 5, '500-599': 0 },
      cacheEverything: true,
    },
  })
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

/**
 * Redirect browsers to Observable Entropy's main page at https https://entropy.truestamp.com/
 */
API.add('GET', '/', (req, res): void => {
  res.setHeader('Cache-Control', 'public, max-age=60, s-max-age=60')
  res.setHeader('Location', 'https://observable-entropy.truestamp.com')
  res.send(302, {
    status: '302',
    code: 'Found',
    description: `Please visit https://observable-entropy.truestamp.com for more info.`,
  })
})

/**
 * Return the ed25519 public key for the Observable Entropy repository.
 * @example https https://entropy.truestamp.com/pubkey
 */
API.add('GET', '/pubkey', (req, res): void => {
  res.setHeader('Cache-Control', 'public, max-age=60, s-max-age=60')
  res.send(200, {
    key: ED25519_PUBLIC_KEY,
  })
})

/**
 * Get the latest entropy.json file from Cloudflare KV or the web
 * @example https https://entropy.truestamp.com/latest
 */
API.add('GET', '/latest', async (req, res): Promise<void> => {
  try {
    const kvLatest = await read(OBSERVABLE_ENTROPY, 'latest', {
      type: 'text',
      metadata: true,
    })

    // If the KV entry has been populated via an API call from GitHub, use it.
    if (kvLatest && kvLatest.value) {
      const parsedKvLatest: Entropy = create(
        JSON.parse(kvLatest.value),
        EntropyStruct,
      )

      res.setHeader('Cache-Control', 'public, max-age=5, s-max-age=5')
      res.send(200, parsedKvLatest)
    }

    // Fallback to retrieving latest from the web, this is less desirable
    // since it will be cached for some minutes and will be stale.
    const entropyResp = await fetchLatestEntropy()

    if (!entropyResp.ok) {
      res.send(404, {
        status: '404',
        code: 'Not found',
        description: `No entropy found for latest`,
      })
    }

    const entropy: Entropy = create(await entropyResp.json(), EntropyStruct)
    res.setHeader('Cache-Control', 'public, max-age=5, s-max-age=5')
    res.send(200, entropy)
  } catch (err) {
    res.setHeader('Cache-Control', 'public, max-age=0, s-max-age=0')

    if (err instanceof StructError) {
      return res.send(400, {
        status: '400',
        code: 'Argument or parsing error',
        description: err.message,
      })
    } else if (err instanceof Error) {
      return res.send(500, {
        status: '500',
        code: 'Unhandled error',
        description: `Internal server error : ${err.message}`,
      })
    }
  }
})

/**
 * Retrieve, by the Git commit ID, the entropy.json file from Cloudflare KV or the web
 * @example https https://entropy.truestamp.com/commit/678e9cbef4e78eacf042ac886164e31fb72b6fd1
 */
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
      const entropy: Entropy = create(await entropyResp.json(), EntropyStruct)
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
      return res.send(400, {
        status: '400',
        code: 'Argument or parsing error',
        description: err.message,
      })
    } else if (err instanceof Error) {
      return res.send(500, {
        status: '500',
        code: 'Unhandled error',
        description: `Internal server error : ${err.message}`,
      })
    }
  }
})

/**
 * Retrieve, by the Entropy hash value, which is used in an index lookup for the associated commit ID
 * @example https https://entropy.truestamp.com/hash/605ba3b4cce44f2a09ad681d92aa20f5d122658e1878e18c71705d41c658891e
 */
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
      const entropy: Entropy = create(await entropyResp.json(), EntropyStruct)
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
      return res.send(400, {
        status: '400',
        code: 'Argument or parsing error',
        description: err.message,
      })
    } else if (err instanceof Error) {
      return res.send(500, {
        status: '500',
        code: 'Unhandled error',
        description: `Internal server error : ${err.message}`,
      })
    }
  }
})

/**
 * POST a new entropy value onto the stack, to be included in the next entropy.json
 * @example https -v POST https://entropy.truestamp.com/entries entropy=bdd1d11b1ab7569c40e07a61b5b6071d80efcf5db176d8ab172e15d5566cb342
 */
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
      return res.send(400, {
        status: '400',
        code: 'Argument or parsing error',
        description: err.message,
      })
    } else if (err instanceof Error) {
      return res.send(500, {
        status: '500',
        code: 'Unhandled error',
        description: `Internal server error : ${err.message}`,
      })
    }
  }
})

/**
 * GET the latest entries
 * @example https https://entropy.truestamp.com/entries
 */
API.add('GET', '/entries', async (req, res) => {
  try {
    const prefix = 'entry::'
    const keys = await paginate<string[]>(OBSERVABLE_ENTROPY, { prefix })

    const entryKeys = keys.map((key) => {
      return key
    })

    const kvEntries: GetEntriesResp = []
    for (const e of entryKeys) {
      // retrieve the entry from KV store
      const kvEntry = await read(OBSERVABLE_ENTROPY, e, {
        type: 'text',
        metadata: true,
      })

      if (!kvEntry || !kvEntry.value) {
        continue
      }

      try {
        const parsedKvEntry: Entry = create(
          JSON.parse(kvEntry.value),
          EntryStruct,
        )
        kvEntries.push(parsedKvEntry.entropy)
      } catch (error) {
        continue
      }
    }

    res.setHeader('Cache-Control', 'public, max-age=5, s-max-age=5')
    res.send(200, kvEntries)
  } catch (err) {
    res.setHeader('Cache-Control', 'public, max-age=0, s-max-age=0')

    if (err instanceof StructError) {
      return res.send(400, {
        status: '400',
        code: 'Argument or parsing error',
        description: err.message,
      })
    } else if (err instanceof Error) {
      return res.send(500, {
        status: '500',
        code: 'Unhandled error',
        description: `Internal server error : ${err.message}`,
      })
    }
  }
})

/**
 * Retrieve the entropy file and validate that its file hashes result in the same
 * top level hash, and that the signature over the hash is valid.
 * @example https https://entropy.truestamp.com/verify/commit/0813fb5b24e2e2a08363d90b7b77b4a1889fa77c
 */
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
        res.send(200, { verified: true, entropy: entropy })
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
        description: `No entropy found yet for commit : ${id}. It can take some time if this is freshly created.`,
      })
    }
  } catch (err) {
    res.setHeader('Cache-Control', 'public, max-age=0, s-max-age=0')

    if (err instanceof StructError) {
      return res.send(400, {
        status: '400',
        code: 'Argument or parsing error',
        description: err.message,
      })
    } else if (err instanceof Error) {
      return res.send(500, {
        status: '500',
        code: 'Unhandled error',
        description: `Internal server error : ${err.message}`,
      })
    }
  }
})

/**
 * Retrieve the entropy file and validate that its file hashes result in the same
 * top level hash, and that the signature over the hash is valid.
 * @example https https://entropy.truestamp.com/verify/hash/605ba3b4cce44f2a09ad681d92aa20f5d122658e1878e18c71705d41c658891e
 */
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
        res.send(200, { verified: true, entropy: entropy })
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
        description: `No entropy found yet for hash : ${hash}. It can take some time if this is freshly created.`,
      })
    }
  } catch (err) {
    res.setHeader('Cache-Control', 'public, max-age=0, s-max-age=0')

    if (err instanceof StructError) {
      return res.send(400, {
        status: '400',
        code: 'Argument or parsing error',
        description: err.message,
      })
    } else if (err instanceof Error) {
      return res.send(500, {
        status: '500',
        code: 'Unhandled error',
        description: `Internal server error : ${err.message}`,
      })
    }
  }
})

/**
 * Attach "fetch" event handler
 * ~> use `Cache` for request-matching, when permitted
 * ~> store Response in `Cache`, when permitted
 */
// eslint-disable-next-line @typescript-eslint/unbound-method
Cache.listen(API.run)
