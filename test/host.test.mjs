/**
 * Host-side smoke test with stubbed Cordis services. Run:
 *   node test/host.test.mjs
 */
import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// The Host persists provider state under DSH_HOME; isolate the test from the
// user's real DevTools state and credentials.
const testHome = await mkdtemp(join(tmpdir(), 'dsh-devtools-host-'))
process.env.DSH_HOME = testHome
process.on('exit', () => rmSync(testHome, { recursive: true, force: true }))

let state = { version: 1, providers: {}, custom: [], activity: [] }
const credentials = new Map()
const grants = new Map()
const registrations = new Map()
const listeners = new Map()
const tools = []
const discoveryTools = []

const objects = [
  ['list_repositories', 'List repositories for the authenticated user'],
  ['create_issue', 'Create a new issue'],
  ['delete_repository', 'Delete a repository'],
].map(([rawName, description]) => ({
  name: `mcp__github__${rawName}`,
  description,
  parameters: { type: 'object', properties: { owner: { type: 'string' } }, required: ['owner'] },
}))

const restrictCalls = []
let agentMaskActive = false
const manifest = {
  id: 'agent-1',
  ctx: {
    effect(fn) {
      const cleanup = fn()
      agentMaskActive = true
      let done = false
      return () => {
        if (done) return
        done = true
        agentMaskActive = false
        if (typeof cleanup === 'function') cleanup()
      }
    },
    tools: {
      restrict(filter) {
        restrictCalls.push(filter)
        return () => {}
      },
    },
  },
}

const services = {
  agents: { list: () => [manifest] },
  storageDomain: {
    open: async () => domain,
    get: () => domain,
  },
  credentials: {
    describe: async ref => ({ configured: credentials.has(ref) }),
    set: async (ref, value) => { credentials.set(ref, value) },
    unset: async ref => { credentials.delete(ref) },
    readRecord: async key => grants.get(key),
    modifyRecord: async (key, mutate) => {
      const next = await mutate(grants.get(key))
      if (next === undefined) grants.delete(key)
      else grants.set(key, next)
      return next
    },
    deleteRecord: async key => { grants.delete(key) },
  },
  mcpManager: {
    register(name, entry) {
      registrations.set(name, entry)
      return () => { registrations.delete(name) }
    },
    list() {
      return [...registrations.keys()].map(name => ({
        name,
        configured: false,
        status: { state: 'connected', toolCount: 3, connectedAt: 1_700_000_000_000 },
      }))
    },
    restart: async () => {},
    probe: async () => ({ ok: true, toolNames: ['a', 'b'], durationMs: 4 }),
  },
  tools: {
    definitions: () => tools,
    get: name => tools.find(tool => tool.name === name),
    register(definition) {
      discoveryTools.push(definition)
      return () => {}
    },
    guard: guard => { services.tools._guard = guard; return () => {} },
    execute: async ({ calls }) => {
      const results = calls.map(call => ({
        callId: call.id,
        result: { isError: false, content: [{ type: 'text', text: 'done' }], value: null },
      }))
      for (const call of calls) {
        listeners.get('tools/result')?.[0]?.(
          { name: call.name, callId: call.id, arguments: JSON.parse(call.arguments) },
          { isError: false, content: [{ type: 'text', text: 'done' }] },
        )
      }
      return { results }
    },
  },
  connection: {
    fetch: {
      register(route) {
        services.connection.route = route
        return async () => {}
      },
    },
  },
}

const domain = {
  global: {
    get: () => state,
    set: async value => { state = JSON.parse(JSON.stringify(value)) },
  },
  close: async () => {},
}

const cleanups = []
const ctx = {
  logger: () => ({ warn() {}, error() {} }),
  effect(fn) {
    const cleanup = fn()
    let done = false
    const dispose = () => {
      if (done) return
      done = true
      if (typeof cleanup === 'function') cleanup()
    }
    cleanups.push(dispose)
    return dispose
  },
  on(event, fn) {
    const list = listeners.get(event) ?? []
    list.push(fn)
    listeners.set(event, list)
    return () => {}
  },
  inject(deps, cb) { cb(ctx); return ctx },
  get(name) { return services[name] },
  tools: services.tools,
  connection: services.connection,
  mcpManager: services.mcpManager,
  agents: services.agents,
  credentials: services.credentials,
  loggerFactory: null,
}

const { apply } = await import('../host/plugin.js')
apply(ctx)
await new Promise(resolve => setTimeout(resolve, 80))

async function post(action, body = {}) {
  const request = new Request('http://localhost/api/dsh-devtools', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, ...body }),
  })
  const response = await services.connection.route.fetch(request)
  const payload = await response.json()
  return { status: response.status, payload }
}

// Initial page state.
let result = await post('state')
assert.equal(result.status, 200)
assert.equal(result.payload.providers.length, 6)
assert.equal(result.payload.providers[0].id, 'github')
assert.equal(result.payload.providers[0].status, 'disconnected')
assert.equal(result.payload.totals.connected, 0)
assert.equal(result.payload.providers[0].authMode, 'token')
assert.equal(result.payload.providers[0].oauth, false)
const figmaPreset = result.payload.providers.find(provider => provider.id === 'figma')
assert.equal(figmaPreset.authMode, 'oauth')
assert.equal(figmaPreset.oauth, true)
assert.equal(figmaPreset.url, 'https://mcp.figma.com/mcp')

// GitHub is token-only: a tokenless connect is refused.
result = await post('connect', { id: 'github' })
assert.equal(result.status, 400)
assert.match(result.payload.error, /requires an access token/)
assert.ok(!registrations.has('github'))

// A connect with a token stores a credential and rewrites the header template.
tools.push(...objects)
result = await post('connect', { id: 'github', token: 'ghp_secret_token_value' })
assert.equal(result.status, 200, JSON.stringify(result.payload))
assert.equal(credentials.get('DSH_DEVTOOLS_GITHUB'), 'ghp_secret_token_value')
assert.equal(registrations.get('github').headers.Authorization, 'Bearer ${credential:DSH_DEVTOOLS_GITHUB}')
assert.equal(result.payload.providers[0].hasCredential, true)
assert.equal(result.payload.providers[0].status, 'connected')
await new Promise(resolve => setTimeout(resolve, 2_100))
result = await post('state')

// Discovered tools appear with inferred risk and default policies.
result = await post('state')
const list = result.payload.tools.find(tool => tool.rawName === 'list_repositories')
const create = result.payload.tools.find(tool => tool.rawName === 'create_issue')
const remove = result.payload.tools.find(tool => tool.rawName === 'delete_repository')
assert.equal(list.classification, 'read')
assert.equal(list.policy, 'auto')
assert.equal(create.classification, 'write')
assert.equal(create.policy, 'ask')
assert.equal(remove.classification, 'dangerous')
assert.equal(remove.policy, 'block')

// The guard denies agent calls to blocked and disabled tools.
const guard = services.tools._guard
assert.ok(guard({ name: 'mcp__github__delete_repository', agent: { id: 'a' } }))
assert.equal(guard({ name: 'mcp__github__list_repositories', agent: { id: 'a' } }), undefined)
assert.equal(guard({ name: 'mcp__github__delete_repository' }), undefined, 'programmatic calls pass the guard')

// Disabling a tool denies it for the agent.
result = await post('setToolEnabled', { name: 'mcp__github__list_repositories', enabled: false })
assert.equal(result.status, 200)
assert.ok(guard({ name: 'mcp__github__list_repositories', agent: { id: 'a' } }))
result = await post('state')
assert.equal(result.payload.tools.find(tool => tool.rawName === 'list_repositories').enabled, false)

// The pre-execute gate asks for a write and allows a read.
const pre = listeners.get('tools/pre-execute')[0]
let asked
const ask = await pre({ name: 'mcp__github__create_issue', callId: 'c1', agent: { id: 'a' }, arguments: {} }, () => Promise.resolve({ kind: 'allow' }))
assert.equal(ask.kind, 'ask')
assert.match(ask.displayReason.zh, /创建|执行/)
const allowed = await pre({ name: 'mcp__github__list_repositories', callId: 'c2', agent: { id: 'a' }, arguments: {} }, () => Promise.resolve({ kind: 'allow' }))
assert.equal(allowed.kind, 'allow')

// A finished call lands in activity with redacted arguments.
const postResult = listeners.get('tools/result')[0]
postResult(
  { name: 'mcp__github__create_issue', callId: 'c1', arguments: { owner: 'acme', token: 'ghp_abcdefghijklmnop' }, agent: { id: 'a' } },
  { isError: false, content: [{ type: 'text', text: 'Created issue #7' }] },
)
result = await post('state')
const entry = result.payload.activity[0]
assert.equal(entry.rawName, 'create_issue')
assert.equal(entry.status, 'success')
assert.match(entry.args, /\[redacted]/)
assert.ok(!entry.args.includes('ghp_abcdefghijklmnop'))
assert.equal(entry.source, 'agent')
assert.equal(result.payload.tools.find(tool => tool.rawName === 'create_issue').usage, 1)

// The in-page tester runs through the tools pipeline and records a test call.
result = await post('invoke', { name: 'mcp__github__list_repositories', args: { owner: 'acme' } })
assert.equal(result.status, 200, JSON.stringify(result.payload))
assert.equal(result.payload.ok, true)
assert.equal(result.payload.text, 'done')
result = await post('state')
assert.equal(result.payload.activity[0].source, 'test')

// Tool detail returns the schema.
result = await post('tool', { name: 'mcp__github__delete_repository' })
assert.equal(result.status, 200)
assert.equal(result.payload.tool.parameters.properties.owner.type, 'string')

// Disabling a tool hides it from every live agent's next request.
restrictCalls.length = 0
result = await post('setToolEnabled', { name: 'mcp__github__list_repositories', enabled: false })
assert.equal(result.status, 200)
await new Promise(resolve => setTimeout(resolve, 80))
assert.equal(restrictCalls.length, 1, 'one restriction applied')
assert.deepEqual(restrictCalls[0].deny, ['mcp__github__list_repositories'])
assert.equal(agentMaskActive, true)
result = await post('setToolEnabled', { name: 'mcp__github__list_repositories', enabled: true })
await new Promise(resolve => setTimeout(resolve, 80))
assert.equal(agentMaskActive, false, 'restriction lifted when the tool is re-enabled')

// A newly created agent receives the current mask immediately.
result = await post('setToolEnabled', { name: 'mcp__github__delete_repository', enabled: false })
const created = listeners.get('agent/created')[0]
const laterMask = []
const laterAgent = {
  id: 'agent-2',
  ctx: {
    effect(fn) { const cleanup = fn(); return () => { if (typeof cleanup === 'function') cleanup() } },
    tools: { restrict(filter) { laterMask.push(filter); return () => {} } },
  },
}
created({ agent: laterAgent })
assert.deepEqual(laterMask[0].deny, ['mcp__github__delete_repository'])
await post('setToolEnabled', { name: 'mcp__github__delete_repository', enabled: true })

// Bulk tool switches operate on one provider.
result = await post('setProviderToolsEnabled', { id: 'github', enabled: false })
assert.equal(result.status, 200, JSON.stringify(result.payload))
assert.ok(result.payload.tools.filter(tool => tool.providerId === 'github').every(tool => tool.enabled === false))

// Profiles rewrite policies and approval defaults.
result = await post('applyProfile', { profile: 'unattended' })
assert.equal(result.status, 200, JSON.stringify(result.payload))
const afterProfile = result.payload.tools.find(tool => tool.rawName === 'delete_repository')
assert.equal(afterProfile.policy, 'ask')

// A custom provider can be added, used and removed.
result = await post('addProvider', { name: 'Example', url: 'https://mcp.example.com/mcp', token: 'tok' })
assert.equal(result.status, 200, JSON.stringify(result.payload))
const custom = result.payload.providers.find(provider => provider.kind === 'custom')
assert.ok(custom)
assert.ok(registrations.has(custom.id))
result = await post('removeProvider', { id: custom.id })
assert.equal(result.status, 200)
assert.ok(!registrations.has(custom.id))
assert.equal(result.payload.providers.some(provider => provider.kind === 'custom'), false)

// Disconnect unmounts the registration and keeps the credential.
result = await post('disconnect', { id: 'github' })
assert.equal(result.status, 200)
assert.ok(!registrations.has('github'))
assert.equal(credentials.get('DSH_DEVTOOLS_GITHUB'), 'ghp_secret_token_value')
assert.equal(result.payload.providers[0].enabled, false)

// Figma's official remote MCP uses DCR with the temporary compatibility
// client name and a confidential client_secret_post flow.
for (let index = 0; index < 35; index += 1) {
  tools.push({
    name: `mcp__figma__read_${index}`,
    description: `Read Figma design data ${index}`,
    parameters: { type: 'object', properties: {} },
  })
}
const figmaFetch = globalThis.fetch
const figmaRequests = []
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input.href ?? input.url
  if (url.startsWith('http://127.0.0.1:')) return figmaFetch(input, init)
  figmaRequests.push({ url, body: init.body })
  if (url === 'https://mcp.figma.com/mcp') {
    return new Response('', {
      status: 401,
      headers: { 'www-authenticate': 'Bearer resource_metadata="https://mcp.figma.com/.well-known/oauth-protected-resource"' },
    })
  }
  if (url === 'https://mcp.figma.com/.well-known/oauth-protected-resource') {
    return new Response(JSON.stringify({
      resource: 'https://mcp.figma.com/mcp',
      authorization_servers: ['https://api.figma.com'],
      scopes_supported: ['mcp:connect'],
    }), { headers: { 'content-type': 'application/json' } })
  }
  if (url === 'https://api.figma.com/.well-known/oauth-authorization-server') {
    return new Response(JSON.stringify({
      issuer: 'https://api.figma.com',
      authorization_endpoint: 'https://www.figma.com/oauth/mcp',
      token_endpoint: 'https://api.figma.com/v1/oauth/token',
      registration_endpoint: 'https://api.figma.com/v1/oauth/mcp/register',
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
      scopes_supported: ['mcp:connect'],
    }), { headers: { 'content-type': 'application/json' } })
  }
  if (url === 'https://api.figma.com/v1/oauth/mcp/register') {
    const body = JSON.parse(init.body)
    assert.equal(body.client_name, 'Claude Code')
    assert.equal(body.token_endpoint_auth_method, 'client_secret_post')
    assert.deepEqual(body.redirect_uris.length, 1)
    return new Response(JSON.stringify({
      client_id: 'figma-client',
      client_secret: 'figma-secret',
      token_endpoint_auth_method: 'client_secret_post',
    }), { status: 201, headers: { 'content-type': 'application/json' } })
  }
  if (url === 'https://api.figma.com/v1/oauth/token') {
    const body = new URLSearchParams(init.body)
    assert.equal(body.get('grant_type'), 'authorization_code')
    assert.equal(body.get('client_id'), 'figma-client')
    assert.equal(body.get('client_secret'), 'figma-secret')
    assert.ok((body.get('code_verifier') ?? '').length > 20)
    assert.equal(body.get('resource'), null)
    return new Response(JSON.stringify({
      access_token: 'figma-access',
      refresh_token: 'figma-refresh',
      expires_in: 3600,
      scope: 'mcp:connect',
    }), { headers: { 'content-type': 'application/json' } })
  }
  throw new Error(`unexpected Figma fetch ${url}`)
}
try {
  result = await post('oauthStart', { id: 'figma' })
  assert.equal(result.status, 200, JSON.stringify(result.payload))
  const authorize = new URL(result.payload.authorizeUrl)
  assert.equal(`${authorize.origin}${authorize.pathname}`, 'https://www.figma.com/oauth/mcp')
  assert.equal(authorize.searchParams.get('client_id'), 'figma-client')
  assert.equal(authorize.searchParams.get('code_challenge_method'), 'S256')
  assert.equal(authorize.searchParams.get('scope'), 'mcp:connect')
  assert.equal(authorize.searchParams.get('resource'), null)
  const redirect = authorize.searchParams.get('redirect_uri')
  const oauthState = authorize.searchParams.get('state')
  // Keep firing tools/change while the selection is pending. The timer must
  // not be reset forever by a burst, or the provider stays at 0 tools.
  const churn = setInterval(() => listeners.get('tools/change')?.[0]?.(), 100)
  let callback
  try {
    callback = await figmaFetch(`${redirect}?code=figma-code&state=${encodeURIComponent(oauthState)}`)
  } finally {
    clearInterval(churn)
  }
  assert.equal(callback.status, 200)
  result = await post('oauthStatus', { flowId: result.payload.flowId })
  assert.equal(result.payload.status.phase, 'success')
  result = await post('state')
  const figma = result.payload.providers.find(provider => provider.id === 'figma')
  assert.equal(figma.status, 'connected')
  assert.equal(figma.authMode, 'oauth')
  assert.equal(figma.hasCredential, true)
  assert.equal(credentials.get('DSH_DEVTOOLS_FIGMA'), 'figma-access')
  // A newly OAuth-connected large catalog must get a recommended selection,
  // not remain connected with zero enabled tools.
  await new Promise(resolve => setTimeout(resolve, 2300))
  result = await post('state')
  const selectedFigma = result.payload.providers.find(provider => provider.id === 'figma')
  assert.equal(selectedFigma.toolPolicy, 'recommended')
  assert.ok(result.payload.tools.some(tool => tool.providerId === 'figma' && tool.enabled === true))
  const figmaGrant = grants.get('dsh-devtools/figma')
  assert.equal(figmaGrant.payload.clientSecret, 'figma-secret')
  assert.equal(figmaGrant.payload.refreshToken, 'figma-refresh')
  assert.equal(figmaGrant.payload.omitResource, true)
  assert.equal(Object.values(figmaGrant.payload).some(value => value === undefined), false)
  assert.equal(registrations.get('figma').headers.Authorization, 'Bearer ${credential:DSH_DEVTOOLS_FIGMA}')
  result = await post('disconnect', { id: 'figma' })
  assert.equal(result.status, 200)
  assert.ok(credentials.has('DSH_DEVTOOLS_FIGMA'))
} finally {
  globalThis.fetch = figmaFetch
}

// Browser OAuth: discovery, dynamic registration, PKCE, callback and token exchange.
const realFetch = globalThis.fetch
const json = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } })
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : (input.href ?? input.url)
  if (url.startsWith('http://127.0.0.1:')) return realFetch(input, init)
  if (url === 'https://mcp.linear.app/mcp') {
    return new Response('', {
      status: 401,
      headers: { 'www-authenticate': 'Bearer realm="OAuth", resource_metadata="https://mcp.linear.app/.well-known/oauth-protected-resource/mcp"' },
    })
  }
  if (url.endsWith('/.well-known/oauth-protected-resource/mcp')) {
    return json({ resource: 'https://mcp.linear.app/mcp', authorization_servers: ['https://mcp.linear.app'], scopes_supported: ['read', 'write'] })
  }
  if (url.endsWith('/.well-known/oauth-authorization-server')) {
    return json({
      issuer: 'https://mcp.linear.app',
      authorization_endpoint: 'https://mcp.linear.app/authorize',
      token_endpoint: 'https://mcp.linear.app/token',
      registration_endpoint: 'https://mcp.linear.app/register',
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
    })
  }
  if (url === 'https://mcp.linear.app/register') {
    return json({ client_id: 'test-client', token_endpoint_auth_method: 'none' })
  }
  if (url === 'https://mcp.linear.app/token') {
    const body = new URLSearchParams(init.body)
    assert.equal(body.get('grant_type'), 'authorization_code')
    assert.ok((body.get('code_verifier') ?? '').length > 20)
    assert.equal(body.get('code'), 'test-code')
    return json({ access_token: 'oauth-access', refresh_token: 'oauth-refresh', expires_in: 3600, scope: 'read write' })
  }
  throw new Error(`unexpected fetch ${url}`)
}
try {
  result = await post('oauthStart', { id: 'linear' })
  assert.equal(result.status, 200, JSON.stringify(result.payload))
  const authorize = new URL(result.payload.authorizeUrl)
  assert.equal(authorize.origin + authorize.pathname, 'https://mcp.linear.app/authorize')
  assert.equal(authorize.searchParams.get('client_id'), 'test-client')
  assert.equal(authorize.searchParams.get('code_challenge_method'), 'S256')
  assert.equal(authorize.searchParams.get('resource'), 'https://mcp.linear.app/mcp')
  assert.ok((authorize.searchParams.get('code_challenge') ?? '').length > 20)
  const redirect = authorize.searchParams.get('redirect_uri')
  const state = authorize.searchParams.get('state')
  assert.match(redirect, /^http:\/\/127\.0\.0\.1:\d+\/oauth\/callback$/)
  const callback = await realFetch(`${redirect}?code=test-code&state=${encodeURIComponent(state)}`)
  assert.equal(callback.status, 200)
  result = await post('oauthStatus', { flowId: result.payload.flowId })
  assert.equal(result.payload.status.phase, 'success')
  result = await post('state')
  const linear = result.payload.providers.find(provider => provider.id === 'linear')
  assert.equal(linear.status, 'connected')
  assert.equal(linear.authMode, 'oauth')
  assert.equal(linear.hasCredential, true)
  assert.equal(credentials.get('DSH_DEVTOOLS_LINEAR'), 'oauth-access')
  const grant = grants.get('dsh-devtools/linear')
  assert.equal(grant.kind, 'grant')
  assert.equal(grant.payload.refreshToken, 'oauth-refresh')
  assert.equal(registrations.get('linear').headers.Authorization, 'Bearer ${credential:DSH_DEVTOOLS_LINEAR}')
  result = await post('disconnect', { id: 'linear' })
  assert.equal(result.status, 200)
  // Disconnect keeps the OAuth session for a quick reconnect; Reset removes it.
  assert.ok(credentials.has('DSH_DEVTOOLS_LINEAR'))
  assert.ok(grants.has('dsh-devtools/linear'))
} finally {
  globalThis.fetch = realFetch
}

// OAuth actions reject providers that do not use browser authorization.
result = await post('oauthStart', { id: 'github' })
assert.equal(result.status, 400)
assert.match(result.payload.error, /does not use browser authorization/)
result = await post('oauthStatus', { flowId: 'missing' })
assert.equal(result.payload.status.phase, 'missing')

// Large catalogs default to a small recommended, read-only set.
const vercelTools = Array.from({ length: 40 }, (_, index) => ({
  name: `mcp__vercel__list_item_${index}`,
  description: `List item ${index}`,
  parameters: { type: 'object', properties: { teamId: { type: 'string' } } },
}))
tools.push(...vercelTools)
result = await post('connect', { id: 'vercel', token: 'vca_test_token' })
assert.equal(result.status, 200, JSON.stringify(result.payload))
await new Promise(resolve => setTimeout(resolve, 2_100))
result = await post('state')
let vercel = result.payload.providers.find(provider => provider.id === 'vercel')
assert.equal(vercel.toolPolicy, 'recommended')
assert.equal(vercel.toolCount, 40)

assert.equal(vercel.enabledToolCount, 20)
assert.ok(vercel.enabledSchemaTokens > 0)
const vercelRows = result.payload.tools.filter(tool => tool.providerId === 'vercel')
assert.equal(vercelRows.filter(tool => tool.enabled).length, 20)
assert.ok(vercelRows.filter(tool => tool.enabled).every(tool => tool.classification === 'read'))

result = await post('setProviderToolMode', { id: 'vercel', mode: 'all' })
assert.equal(result.status, 200)
vercel = result.payload.providers.find(provider => provider.id === 'vercel')
assert.equal(vercel.toolPolicy, 'all')
assert.equal(vercel.enabledToolCount, 40)

// Usage changes the recommended set: a frequently used tool is kept, the
// unused tools are not forced back in by a fixed count.
for (let index = 0; index < 3; index += 1) {
  postResult(
    { name: 'mcp__vercel__list_item_39', callId: `usage-${index}`, arguments: {}, agent: { id: 'a' } },
    { isError: false, content: [{ type: 'text', text: 'ok' }] },
  )
}
result = await post('setProviderToolMode', { id: 'vercel', mode: 'recommended' })
assert.equal(result.status, 200)
vercel = result.payload.providers.find(provider => provider.id === 'vercel')
assert.ok(vercel.enabledToolCount < 20)
const usedRow = result.payload.tools.find(tool => tool.rawName === 'list_item_39')
assert.equal(usedRow.usage, 3)
assert.equal(usedRow.enabled, true)

result = await post('setToolEnabled', { name: 'mcp__vercel__list_item_38', enabled: true })
assert.equal(result.status, 200)
result = await post('state')
vercel = result.payload.providers.find(provider => provider.id === 'vercel')
assert.equal(vercel.toolPolicy, 'custom')
assert.equal(vercel.enabledToolCount, 7)

result = await post('setProviderToolsEnabled', { id: 'vercel', enabled: false })
assert.equal(result.status, 200)
vercel = result.payload.providers.find(provider => provider.id === 'vercel')
assert.equal(vercel.enabledToolCount, 0)
assert.equal(vercel.toolPolicy, 'custom')
const searchTool = discoveryTools.find(tool => tool.name === 'devtools_search_tools')
const enableTool = discoveryTools.find(tool => tool.name === 'devtools_enable_tool')
assert.ok(searchTool)
assert.ok(enableTool)
const searchResult = await searchTool.execute({ query: 'list item 39' }, {})
assert.match(searchResult, /mcp__vercel__list_item_39/)
assert.match(searchResult, /disabled/)
const enableResult = await enableTool.execute({ name: 'mcp__vercel__list_item_39' }, {})
assert.match(enableResult, /Enabled/)
result = await post('state')
vercel = result.payload.providers.find(provider => provider.id === 'vercel')
assert.equal(vercel.enabledToolCount, 1)

result = await post('disconnect', { id: 'vercel' })
assert.equal(result.status, 200)

// Bad actions and unknown providers fail cleanly.
result = await post('nope')
assert.equal(result.status, 400)
assert.ok(result.payload.error)
result = await post('disconnect', { id: 'nope' })
assert.equal(result.status, 400)
assert.match(result.payload.error, /Unknown provider/)

// Explicit reset removes connections, credentials, policies and activity.
tools.length = 0 // the real manager unregisters these with the connection
const resetFetch = globalThis.fetch
globalThis.fetch = async () => new Response('', { status: 200 })
try {
  result = await post('resetAll')
} finally {
  globalThis.fetch = resetFetch
}
assert.equal(result.status, 200, JSON.stringify(result.payload))
assert.equal(result.payload.totals.connected, 0)
assert.equal(result.payload.totals.enabled, 0)
assert.equal(result.payload.activity.length, 0)
assert.equal(credentials.size, 0)
assert.equal(grants.size, 0)
assert.equal(registrations.size, 0)

console.log('host smoke test: all assertions passed')
