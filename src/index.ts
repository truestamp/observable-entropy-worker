import { Router } from 'worktop'
import * as Cache from 'worktop/cache'

const SHA1_REGEX = /^(?:(0x)*([A-Fa-f0-9]{2}){20})$/i
const SHA256_REGEX = /^(?:(0x)*([A-Fa-f0-9]{2}){32})$/i

async function fetchJsonFromURL(url: string) {
  // w/ cloudflare caching
  // https://developers.cloudflare.com/workers/examples/cache-using-fetch
  const resp = await fetch(url)

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

// Initialize
const API = new Router()

API.add('GET', '/', async (req, res): Promise<void> => {
  res.setHeader('Cache-Control', 'public, max-age=60')
  res.send(404, 'Not Found : try GET /latest')
})

// Get the ed25519 public key, for the corresponding private key which is stored as a
// repository secret in the observable-entropy github repository.
API.add('GET', '/pubkey', async (req, res): Promise<void> => {
  res.setHeader('Cache-Control', 'public, max-age=60')
  res.send(200, {
    key: '2682144fd3a0a10edce91b9c622bf7e83ccb3816574e1a4071ad16842954dd26',
  })
})

// Get the latest entropy.json file
// http https://entropy.truestamp.com/latest
API.add('GET', '/latest', async (req, res): Promise<void> => {
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
    res.setHeader('Cache-Control', 'public, max-age=60')
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
    res.setHeader('Cache-Control', 'public, max-age=60')
    res.send(200, entropy)
  } catch (error) {
    if (error instanceof Error) {
      res.send(404, `Not Found : ${error.message}`)
    }
  }
})

// Attach "fetch" event handler
// ~> use `Cache` for request-matching, when permitted
// ~> store Response in `Cache`, when permitted
Cache.listen(API.run)
