import {
  json,
  missing,
  withParams,
  StatusError,
  ThrowableRouter,
} from 'itty-router-extras'

const SHA1_REGEX = /^(?:(0x)*([A-Fa-f0-9]{2}){20})$/i
const SHA256_REGEX = /^(?:(0x)*([A-Fa-f0-9]{2}){32})$/i

async function readJSONFromURL(url) {
  // w/ cloudflare caching
  // https://developers.cloudflare.com/workers/examples/cache-using-fetch
  const resp = await fetch(url)

  if (resp && resp.ok) {
    return await resp.json()
  } else {
    throw new Error(
      `fetch failed with status ${resp.status} : ${resp.statusText}`,
    )
  }
}

// Fetch the latest entropy file, or one specified by Git commit ID
const fetchEntropy = async (id = null) => {
  let entropy

  const URL_PREFIX =
    'https://raw.githubusercontent.com/truestamp/observable-entropy'

  if (id && SHA1_REGEX.test(id)) {
    // SHA1 commit : fetch a specific entropy file from Github
    entropy = await readJSONFromURL(`${URL_PREFIX}/${id}/entropy.json`)
  } else if (id && SHA256_REGEX.test(id)) {
    // SHA-256 entropy hash : Use the pre-written map of SHA-256 entropy value to lookup
    // Github commit ID containing truestamp/observable-entropy/entropy.json
    let index = await readJSONFromURL(
      `${URL_PREFIX}/main/index/by/entropy_hash/${id}.json`,
    )

    if (!index || !index.id) {
      throw new Error(`fetch failed retrieving hash index`)
    }

    entropy = await readJSONFromURL(`${URL_PREFIX}/${index.id}/entropy.json`)
  } else {
    // NO ID : fetch the latest entropy file from Github
    entropy = await readJSONFromURL(`${URL_PREFIX}/main/entropy.json`)
  }

  return entropy
}

const router = ThrowableRouter({ stack: false })

router.get('/', () => {
  throw new StatusError(404, 'Not Found : try GET /latest')
})

// The ed25519 public key, for the corresponding private key stored as a
// repository secret in the observable-entropy github repo.
router.get('/pubkey', () => {
  return json({
    key: '2682144fd3a0a10edce91b9c622bf7e83ccb3816574e1a4071ad16842954dd26',
  })
})

// Get the latest entropy.json file
// http https://entropy.truestamp.com/latest
router.get('/latest', async () => {
  try {
    let entropy = await fetchEntropy()
    return json(entropy)
  } catch (error) {
    throw new StatusError(404, `Not Found : ${error.message}`)
  }
})

// retrieve by the git commit ID when hash.json was created (for the previous commit)
// http https://entropy.truestamp.com/commit/678e9cbef4e78eacf042ac886164e31fb72b6fd1
router.get('/commit/:id', withParams, async ({ id }) => {
  if (!SHA1_REGEX.test(id)) {
    throw new StatusError(400, `Bad Request : ID must be a Github SHA1 hash`)
  }

  try {
    let entropy = await fetchEntropy(id)
    return json(entropy)
  } catch (error) {
    throw new StatusError(404, `Not Found : ${error.message}`)
  }
})

// retrieve by the entropy hash value, which is an index lookup for the associated commit ID
// https://entropy.truestamp.com/hash/44091b5c935c576ab255540f386afbcd4c7baf79d00599e20c9a5effd7794a42
router.get('/hash/:hash', withParams, async ({ hash }) => {
  if (!SHA256_REGEX.test(hash)) {
    throw new StatusError(
      400,
      `Bad Request : hash must be a SHA-256 entropy hash`,
    )
  }

  try {
    let entropy = await fetchEntropy(hash)
    return json(entropy)
  } catch (error) {
    throw new StatusError(404, `Not Found : ${error.message}`)
  }
})

router.all('*', () => missing('Not Found'))

// Attach the router "handle" to the event handler
addEventListener('fetch', event => {
  event.respondWith(router.handle(event.request))
})
