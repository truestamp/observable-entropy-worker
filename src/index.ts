// Copyright © 2020-2021 Truestamp Inc. All rights reserved.

import { Router } from 'worktop'
import * as Cache from 'worktop/cache'

import { ulid, toHEX } from 'worktop/utils'

import { read, write, paginate } from 'worktop/kv'
import type { KV } from 'worktop/kv'

declare const OBSERVABLE_ENTROPY: KV.Namespace

const SHA1_REGEX = /^(?:(0x)*([A-Fa-f0-9]{2}){20})$/i
const SHA256_REGEX = /^(?:(0x)*([A-Fa-f0-9]{2}){32})$/i

// Hex string 32 bytes (2 hex chars each byte group)
const HEX_REGEX = /^(([A-Fa-f0-9]{2}){32})$/i

interface Entry {
  entropy: string
  for?: string
}

function getNowInUnixSeconds(): number {
  const nowInSeconds = Math.floor(Date.now() / 1000)
  return parseInt(nowInSeconds.toString(), 10)
}

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random
function getRandomInt(min: number, max: number) {
  min = Math.ceil(min)
  max = Math.floor(max)
  return Math.floor(Math.random() * (max - min) + min) //The maximum is exclusive and the minimum is inclusive
}

async function digestMessage(message: string) {
  const encoder = new TextEncoder()
  const data = encoder.encode(message)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return hash
}

async function fetchJsonFromURL(url: string) {
  // w/ cloudflare caching
  // https://developers.cloudflare.com/workers/examples/cache-using-fetch
  const resp = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } })

  if (resp.ok) {
    return await resp.json()
  } else {
    throw new Error(
      `fetch failed with status ${resp.status} : ${resp.statusText}`,
    )
  }
}

// Fetch the latest entropy file, or one specified by Git commit ID
const fetchEntropy = async (id: string | null = null) => {
  let entropy

  const URL_PREFIX =
    'https://raw.githubusercontent.com/truestamp/observable-entropy'

  if (id && SHA1_REGEX.test(id)) {
    // SHA1 commit : fetch a specific entropy file from Github
    entropy = await fetchJsonFromURL(`${URL_PREFIX}/${id}/entropy.json`)
  } else if (id && SHA256_REGEX.test(id)) {
    // SHA-256 entropy hash : Use the pre-written map of SHA-256 entropy value to lookup
    // Github commit ID containing truestamp/observable-entropy/entropy.json
    const index = await fetchJsonFromURL(
      `${URL_PREFIX}/main/index/by/entropy_hash/${id}.json`,
    )

    if (!index || !index.id) {
      throw new Error(`fetch failed retrieving hash index`)
    }

    entropy = await fetchJsonFromURL(`${URL_PREFIX}/${index.id}/entropy.json`)
  } else {
    // NO ID : fetch the latest entropy file from Github
    entropy = await fetchJsonFromURL(`${URL_PREFIX}/main/entropy.json`)
  }

  return entropy
}

const API = new Router()

// Redirect to GitHub repository README
API.add('GET', '/', async (req, res): Promise<void> => {
  res.setHeader('Cache-Control', 'public, max-age=5, s-max-age=5')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Location', 'https://github.com/truestamp/observable-entropy')
  res.send(302, 'Found')
})

// Get the ed25519 public key, for the corresponding private key which is stored as a
// repository secret in the observable-entropy github repository.
API.add('GET', '/pubkey', async (req, res): Promise<void> => {
  res.setHeader('Cache-Control', 'public, max-age=5, s-max-age=5')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.send(200, {
    key: '2682144fd3a0a10edce91b9c622bf7e83ccb3816574e1a4071ad16842954dd26',
  })
})

// Get the latest entropy.json file from Cloudflare KV or the web
// http https://entropy.truestamp.com/latest
API.add('GET', '/latest', async (req, res): Promise<void> => {
  const latest = await read(OBSERVABLE_ENTROPY, 'latest', {
    type: 'text',
    metadata: true,
  })

  if (latest && latest.value) {
    const parsedKvLatest = JSON.parse(latest.value)
    if (!parsedKvLatest || !parsedKvLatest.hash) {
      console.log(`parsedKvLatest is null  or missing hash: ${parsedKvLatest}`)
    }

    res.setHeader('Cache-Control', 'public, max-age=5, s-max-age=5')
    res.setHeader('Access-Control-Allow-Origin', '*')

    if (parsedKvLatest && parsedKvLatest.hash) {
      res.send(200, {
        ...parsedKvLatest,
      })
    }
  } else {
    console.log(`KV latest is null or missing value : ${latest}`)
  }

  // fallback to retrieving latest from the web, this is less desirable
  // since it will be cached for some minutes and will be stale.
  try {
    const entropy = await fetchEntropy()
    res.send(200, entropy)
  } catch (error) {
    if (error instanceof Error) {
      res.send(404, `Not Found : ${error.message}`)
    }
  }
})

// Retrieve by the git commit ID when hash.json was created (for the previous commit)
// http https://entropy.truestamp.com/commit/678e9cbef4e78eacf042ac886164e31fb72b6fd1
API.add('GET', '/commit/:id', async (req, res) => {
  const id = req.params.id

  if (!SHA1_REGEX.test(id)) {
    res.send(400, `Bad Request : ID must be a Github SHA1 hash`)
  }

  try {
    const entropy = await fetchEntropy(id)
    res.setHeader('Cache-Control', 'public, max-age=5, s-max-age=5')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.send(200, entropy)
  } catch (error) {
    if (error instanceof Error) {
      res.send(404, `Not Found : ${error.message}`)
    }
  }
})

// Retrieve by the entropy hash value, which is an index lookup for the associated commit ID
// http https://entropy.truestamp.com/hash/605ba3b4cce44f2a09ad681d92aa20f5d122658e1878e18c71705d41c658891e
API.add('GET', '/hash/:hash', async (req, res) => {
  const hash = req.params.hash

  if (!SHA256_REGEX.test(hash)) {
    res.send(400, `Bad Request : hash must be a SHA-256 entropy hash`)
  }

  try {
    const entropy = await fetchEntropy(hash)
    res.setHeader('Cache-Control', 'public, max-age=5, s-max-age=5')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.send(200, entropy)
  } catch (error) {
    if (error instanceof Error) {
      res.send(404, `Not Found : ${error.message}`)
    }
  }
})

API.add('POST', '/entries', async (req, res) => {
  let entry: Entry
  try {
    const bodyEntry = await req.body<Entry>()
    if (!bodyEntry || !bodyEntry.entropy.trim()) {
      return res.send(422, {
        error: true,
        message: 'Bad Request : Missing JSON body object with entropy key.',
      })
    }
    entry = bodyEntry
  } catch (error) {
    return res.send(400, {
      error: true,
      message: 'Bad Request : Missing JSON body object with entropy key.',
    })
  }

  if (!HEX_REGEX.test(entry.entropy)) {
    return res.send(400, {
      error: true,
      message:
        'Bad Request : Invalid entropy value, must be 32 byte hex string (64 chars)',
    })
  }

  const key = `entry::${ulid()}`

  // Auto-expire all entries after a random interval between 10 and 60 minutes from now
  // To ensure that the entry is unpredictably present in at least one, and possibly
  // up to an hour's worth of observable entropy runs.
  const expiration: number = getNowInUnixSeconds() + 60 * getRandomInt(10, 60)

  const hashedEntry = await digestMessage(
    `${key}::${expiration}::${entry.entropy}`,
  )

  // For each entry, store the hashed entry as well. This prevents the perception that someone could
  // use a chosen entry value to 'poison' the observable entropy pool as there will always be an unpredictable
  // additional entry added alongside the one they submitted.
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

  const successWriteEntry = await write<Entry>(OBSERVABLE_ENTROPY, key, entry, {
    expiration,
  })

  if (successWriteEntry) {
    res.send(201, {
      key,
      entropy: entry.entropy,
      expiration,
    })
  } else {
    res.send(500, {
      error: true,
      message: 'Internal Server Error : Failed to write entry.',
    })
  }
})

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

  res.setHeader('Cache-Control', 'public, max-age=5, s-max-age=5')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.send(200, kvEntries)
})

// Attach "fetch" event handler
// ~> use `Cache` for request-matching, when permitted
// ~> store Response in `Cache`, when permitted
Cache.listen(API.run)
