/**
 * OAuth refresh behavior with a stubbed credential store and token endpoint.
 * Run: node test/oauth.test.mjs
 */
import assert from 'node:assert/strict'
import { OAuthBroker } from '../host/oauth.js'

const refs = new Map()
const records = new Map()
const credentials = {
  describe: async ref => ({ configured: refs.has(ref) }),
  resolve: async ref => refs.has(ref) ? { value: refs.get(ref), source: 'stored' } : undefined,
  set: async (ref, value) => { refs.set(ref, value) },
  unset: async ref => { refs.delete(ref) },
  readRecord: async key => records.get(key),
  modifyRecord: async (key, mutate) => {
    const next = await mutate(records.get(key))
    if (next === undefined) records.delete(key)
    else records.set(key, next)
    return next
  },
  deleteRecord: async key => { records.delete(key) },
}
const state = { requireApproval: true, enabled: true, authMode: 'oauth' }
const provider = { id: 'linear', name: 'Linear', url: 'https://mcp.linear.app/mcp', auth: 'oauth', oauth: { scopes: ['read', 'write'] } }
const ctx = {
  get: name => name === 'credentials' ? credentials : undefined,
  effect: () => () => {},
  logger: () => ({ warn() {} }),
}
const broker = new OAuthBroker({
  ctx,
  findProvider: () => provider,
  providerState: () => state,
  setProviderState: (id, value) => { Object.assign(state, value) },
  persist: async () => {},
  register: () => {},
  warn: (message) => { throw new Error(`unexpected warning: ${message}`) },
  credentialRef: id => `DSH_DEVTOOLS_${id.toUpperCase()}`,
})

const baseGrant = {
  version: 1,
  providerId: 'linear',
  issuer: 'https://mcp.linear.app',
  resource: 'https://mcp.linear.app/mcp',
  authorizationEndpoint: 'https://mcp.linear.app/authorize',
  tokenEndpoint: 'https://mcp.linear.app/token',
  clientId: 'client-1',
  redirectUri: 'http://127.0.0.1:45871/oauth/callback',
  refreshToken: 'refresh-1',
  expiresAt: Date.now() - 1_000,
  tokenEndpointAuthMethod: 'none',
}
await broker.writeGrant('linear', baseGrant)
refs.set('DSH_DEVTOOLS_LINEAR', 'expired-access')

const realFetch = globalThis.fetch
let requests = 0
globalThis.fetch = async (url, init) => {
  requests += 1
  assert.equal(String(url), 'https://mcp.linear.app/token')
  const body = new URLSearchParams(init.body)
  assert.equal(body.get('grant_type'), 'refresh_token')
  assert.equal(body.get('refresh_token'), 'refresh-1')
  assert.equal(body.get('resource'), 'https://mcp.linear.app/mcp')
  return new Response(JSON.stringify({
    access_token: 'fresh-access',
    refresh_token: 'refresh-2',
    expires_in: 3600,
  }), { headers: { 'content-type': 'application/json' } })
}
try {
  await broker.ensureFresh('linear')
  assert.equal(refs.get('DSH_DEVTOOLS_LINEAR'), 'fresh-access')
  const grant = records.get('dsh-devtools/linear').payload
  assert.equal(grant.refreshToken, 'refresh-2')
  assert.ok(grant.expiresAt > Date.now())
  assert.equal(requests, 1)

  // invalid_grant marks the connection as needing a new sign-in.
  await broker.writeGrant('linear', { ...baseGrant, refreshToken: 'dead-refresh', expiresAt: Date.now() - 1_000 })
  refs.set('DSH_DEVTOOLS_LINEAR', 'stale')
  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'invalid_grant' }), {
    status: 400,
    headers: { 'content-type': 'application/json' },
  })
  await assert.rejects(() => broker.ensureFresh('linear'), /sign in again/i)
  assert.equal(refs.has('DSH_DEVTOOLS_LINEAR'), false)
  assert.match(state.oauthError, /expired|renew/i)
  assert.equal(records.get('dsh-devtools/linear').payload.refreshToken, undefined)
  // Disconnect revokes the refresh and access tokens when the provider
  // advertises a revocation endpoint.
  const revocations = []
  await broker.writeGrant('linear', {
    ...baseGrant,
    refreshToken: 'revoke-refresh',
    revocationEndpoint: 'https://mcp.linear.app/revoke',
  })
  refs.set('DSH_DEVTOOLS_LINEAR', 'revoke-access')
  globalThis.fetch = async (url, init) => {
    revocations.push({ url: String(url), body: new URLSearchParams(init.body) })
    return new Response('', { status: 200 })
  }
  await broker.clear('linear')
  assert.equal(revocations.length, 2)
  assert.equal(revocations[0].url, 'https://mcp.linear.app/revoke')
  assert.equal(revocations[0].body.get('token'), 'revoke-refresh')
  assert.equal(revocations[0].body.get('token_type_hint'), 'refresh_token')
  assert.equal(revocations[1].body.get('token'), 'revoke-access')
  assert.equal(refs.has('DSH_DEVTOOLS_LINEAR'), false)
  assert.equal(records.has('dsh-devtools/linear'), false)
} finally {
  globalThis.fetch = realFetch
  broker.dispose()
}

console.log('oauth refresh test: all assertions passed')
