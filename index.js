import {
  json,
  missing,
  error,
  status,
  withContent,
  withParams,
  StatusError,
  ThrowableRouter,
} from 'itty-router-extras'

// Fetch the latest entropy file, or one specified by Git commit ID
const fetchEntropy = async (id = null) => {
  let entropy, resp

  if (id) {
    // fetch a specific entropy file from Github
    resp = await fetch(
      `https://raw.githubusercontent.com/truestamp/observable-entropy/${id}/hash.json`,
    )
  } else {
    // fetch the latest entropy file from Github
    resp = await fetch(
      'https://raw.githubusercontent.com/truestamp/observable-entropy/main/hash.json',
    )
  }

  if (resp && resp.ok) {
    entropy = await resp.json()
  } else {
    throw new Error(
      `entropy fetch failed with status ${resp.status} : ${resp.statusText}`,
    )
  }

  if (entropy && entropy.hash) {
    return entropy
  } else {
    throw new Error(`invalid entropy file`)
  }
}

const router = ThrowableRouter({ stack: true })

router.get('/', () => {
  throw new StatusError(404, 'Not Found : try GET /latest')
})

router.get('/latest', async () => {
  try {
    let entropy = await fetchEntropy()
    return json(entropy)
  } catch (error) {
    throw new StatusError(404, `Not Found : ${error.message}`)
  }
})

// router.post('/latest', withContent, async ({ content }) => {
//   if (content && content.sha) {
//     await ENTROPY_KV.put('latest:sha', content.sha)
//   }

//   return new Response('Creating latest: ' + JSON.stringify(content))
// })

// router.get('/history', () => {
//   throw new StatusError(404, 'Not Found : try GET /history/commit/:sha')
// })

// router.get('/history/commit', () => {
//   throw new StatusError(404, 'Not Found : try GET /history/commit/:sha')
// })

// retrieve by the git commit ID when hash.json was created (for the previous commit)
router.get('/commit/:id', withParams, async ({ id }) => {
  try {
    let entropy = await fetchEntropy(id)
    return json(entropy)
  } catch (error) {
    throw new StatusError(404, `Not Found : ${error.message}`)
  }
})

// retrieve by the entropy hash value, which is an index lookup for the associated commit ID
router.get('/hash/:hash', withParams, async ({ hash }) => {
  try {
    let entropy = await fetchEntropy(sha)
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
