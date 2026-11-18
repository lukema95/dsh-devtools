/**
 * Browser OAuth for MCP servers.
 *
 * DSH's MCP client speaks streamable HTTP with a static header, so this module
 * obtains the access token itself and stores it where the MCP entry already
 * looks: a DSH credential reference. Refresh tokens and the dynamically
 * registered client live in a credential GrantRecord, never in the page or in
 * the plugin's state file.
 *
 * The authorization redirect lands on a loopback HTTP server owned by this
 * plugin (RFC 8252) rather than on DSH's `/api` route: Desktop opens the
 * consent page in the system browser, which may not carry the owner session a
 * DSH exact route requires. The page talks to the Host only through the normal
 * authenticated route and polls the flow status.
 */
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { createServer } from 'node:http'

const FLOW_TTL_MS = 10 * 60_000
const REFRESH_LEAD_MS = 5 * 60_000
const REQUEST_TIMEOUT_MS = 20_000
const PORTS = [45871, 45872, 45873, 45874, 45875, 45876]

/**
 * Stable credential key for one provider's OAuth grant.
 * @param {string} id provider id
 * @returns {string} `dsh-devtools/<id>`
 */
function grantKey(id) {
  return `dsh-devtools/${id}`
}

/**
 * @param {Buffer} bytes bytes
 * @returns {string} base64url text
 */
function base64url(bytes) {
  return bytes.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * @param {string} value raw text
 * @returns {string} base64url SHA-256 digest
 */
function sha256Base64url(value) {
  return base64url(createHash('sha256').update(value).digest())
}

/**
 * Escape text for a small HTML page.
 * @param {string} value raw text
 * @returns {string} escaped text
 */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * A tiny standalone page shown in the consent tab after the redirect.
 * @param {string} title page title
 * @param {string} body message
 * @param {boolean} ok success styling
 * @returns {string} HTML
 */
function resultPage(title, body, ok) {
  const accent = ok ? '#26a96c' : '#d33b3b'
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  html,body{height:100%;margin:0;background:#f6f6f9;color:#1f1f24;
    font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
  main{max-width:460px;margin:12vh auto;padding:28px 28px 24px;background:#fff;
    border:1px solid #e4e4ec;border-radius:16px;box-shadow:0 18px 50px rgba(20,20,40,.08)}
  .dot{width:10px;height:10px;border-radius:50%;background:${accent};display:inline-block;margin-right:8px}
  h1{font-size:17px;line-height:1.4;margin:0 0 8px}
  p{margin:0;color:#5b5b68;white-space:pre-wrap;overflow-wrap:anywhere}
  .hint{margin-top:14px;font-size:12px;color:#8a8a99}
  @media (prefers-color-scheme:dark){
    html,body{background:#15151a;color:#f0f0f4}
    main{background:#1e1e25;border-color:#33333d;box-shadow:none}
    p{color:#b7b7c4}.hint{color:#8f8f9e}
  }
</style></head><body><main>
  <h1><span class="dot"></span>${escapeHtml(title)}</h1>
  <p>${escapeHtml(body)}</p>
  <p class="hint">You can close this tab and return to DSH DevTools.</p>
</main></body></html>`
}

/** @typedef {{ phase: 'pending' | 'success' | 'error', error?: string }} FlowStatus */

/** Browser OAuth coordinator for one DevTools host. */
export class OAuthBroker {
  /**
   * @param {{
   *   ctx: import('@deepseek-ai/cordis').Context,
   *   findProvider: (id: string) => ({ id: string, name: string, url: string, auth: string, oauth?: { scopes?: readonly string[], prompt?: string } } | undefined),
   *   providerState: (id: string) => Record<string, any>,
   *   setProviderState: (id: string, value: Record<string, any>) => void,
   *   persist: () => Promise<void>,
   *   register: (id: string, state: Record<string, any>) => void,
   *   warn: (message: string, error?: unknown) => void,
   * }} host
   */
  constructor(host) {
    this.host = host
    this.ctx = host.ctx
    this.server = undefined
    this.port = undefined
    this.redirectUri = undefined
    /** @type {Map<string, any>} state → flow */
    this.flows = new Map()
    /** @type {Map<string, any>} flow id → flow */
    this.byId = new Map()
    /** @type {Map<string, any>} provider id → refresh timer */
    this.timers = new Map()
    /** @type {Map<string, Promise<void>>} provider id → in-flight refresh */
    this.refreshing = new Map()
    this.cleanupTimer = setInterval(() => this.expireFlows(), 60_000)
    this.cleanupTimer.unref?.()
  }

  /** @param {string} message @param {unknown} [error] */
  warn(message, error) {
    this.host.warn(message, error)
  }

  /**
   * Fetch an OAuth endpoint after rejecting insecure or non-loopback plain HTTP.
   * @param {string} url endpoint
   * @param {RequestInit} options request options
   * @returns {Promise<Response>} response
   */
  request(url, options) {
    return fetch(this.secureUrl(url), options)
  }

  /**
   * Parse an OAuth endpoint, accepting HTTPS and loopback HTTP only.
   * @param {string | URL} url endpoint
   * @returns {URL} parsed endpoint
   */
  secureUrl(url) {
    const parsed = url instanceof URL ? url : new URL(url)
    const loopback = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost'
      || parsed.hostname === '::1' || parsed.hostname === '[::1]'
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback)) {
      throw new Error(`Refusing an OAuth endpoint that is not HTTPS: ${parsed.origin}`)
    }
    return parsed
  }

  /** Start the loopback callback server once. */
  async ensureServer() {
    if (this.redirectUri !== undefined) return this.redirectUri
    const server = createServer((request, response) => {
      void this.handleHttp(request, response).catch((error) => {
        this.warn('OAuth callback handling failed', error)
        try {
          response.writeHead(500, { 'content-type': 'text/html; charset=utf-8' })
          response.end(resultPage('Authorization failed', String(error?.message ?? error), false))
        } catch { /* the response is already gone */ }
      })
    })
    let lastError
    for (const port of PORTS) {
      try {
        await new Promise((resolve, reject) => {
          const onError = (error) => { server.off('listening', onListening); reject(error) }
          const onListening = () => { server.off('error', onError); resolve(undefined) }
          server.once('error', onError)
          server.once('listening', onListening)
          server.listen(port, '127.0.0.1')
        })
        this.port = port
        break
      } catch (error) {
        lastError = error
        if (error?.code !== 'EADDRINUSE') break
      }
    }
    if (this.port === undefined) {
      await new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(0, '127.0.0.1', () => resolve(undefined))
      })
      this.port = server.address().port
      if (lastError !== undefined) this.warn('preferred OAuth callback ports were busy; using an ephemeral port', lastError)
    }
    server.unref?.()
    this.server = server
    this.redirectUri = `http://127.0.0.1:${this.port}/oauth/callback`
    this.ctx.effect(() => () => {
      try { server.close() } catch { /* already closed */ }
      this.server = undefined
      this.redirectUri = undefined
      this.port = undefined
    }, 'dsh-devtools: oauth callback server')
    return this.redirectUri
  }

  /**
   * Handle the browser redirect.
   * @param {import('node:http').IncomingMessage} request
   * @param {import('node:http').ServerResponse} response
   */
  async handleHttp(request, response) {
    const url = new URL(request.url ?? '/', `http://127.0.0.1:${this.port ?? 0}`)
    if (request.method !== 'GET' || url.pathname !== '/oauth/callback') {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      response.end('Not found')
      return
    }
    const state = url.searchParams.get('state') ?? ''
    const flow = this.flows.get(state)
    if (flow === undefined) {
      response.writeHead(400, { 'content-type': 'text/html; charset=utf-8' })
      response.end(resultPage('Authorization failed', 'This authorization request is unknown or has already finished. Start again from DSH DevTools.', false))
      return
    }
    const providerError = url.searchParams.get('error')
    if (providerError !== null) {
      const description = url.searchParams.get('error_description') ?? ''
      flow.phase = 'error'
      flow.error = description === '' ? providerError : `${providerError}: ${description}`
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      response.end(resultPage('Authorization was not completed', flow.error, false))
      return
    }
    const code = url.searchParams.get('code')
    if (code === null) {
      flow.phase = 'error'
      flow.error = 'The provider returned no authorization code.'
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      response.end(resultPage('Authorization failed', flow.error, false))
      return
    }
    try {
      await this.complete(flow, code)
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      response.end(resultPage(`${flow.providerName} is connected`, 'DSH DevTools received the authorization. You can return to the app.', true))
    } catch (error) {
      flow.phase = 'error'
      flow.error = error instanceof Error ? error.message : String(error)
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      response.end(resultPage('Authorization failed', flow.error, false))
    }
  }

  /**
   * Discover OAuth metadata for one MCP endpoint.
   * @param {string} mcpUrl MCP endpoint
   */
  async discover(mcpUrl) {
    const url = new URL(mcpUrl)
    const resource = await this.resourceMetadata(url)
    const issuer = Array.isArray(resource.authorization_servers) && resource.authorization_servers.length > 0
      ? String(resource.authorization_servers[0])
      : url.origin
    const metadata = await this.authorizationMetadata(issuer, url)
    return { resource, issuer, metadata, resourceUrl: String(resource.resource ?? mcpUrl) }
  }

  /**
   * Read RFC 9728 protected-resource metadata.
   * @param {URL} url MCP endpoint
   */
  async resourceMetadata(url) {
    let header = ''
    try {
      const probe = await this.request(url, {
        method: 'POST',
        redirect: 'follow',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          accept: 'application/json, text/event-stream',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'dsh-devtools', version: '0.1.0' } },
        }),
      })
      header = probe.headers.get('www-authenticate') ?? ''
      await probe.body?.cancel().catch(() => {})
    } catch (error) {
      this.warn(`probing ${url.origin} for OAuth metadata failed`, error)
    }
    const match = header.match(/resource_metadata=(?:"([^"]+)"|([^,\s]+))/i)
    const advertised = match?.[1] ?? match?.[2]
    const candidates = []
    if (advertised !== undefined) candidates.push(new URL(advertised, url).href)
    const path = url.pathname === '/' ? '' : url.pathname.replace(/\/$/, '')
    candidates.push(new URL(`/.well-known/oauth-protected-resource${path}`, url.origin).href)
    candidates.push(new URL('/.well-known/oauth-protected-resource', url.origin).href)
    for (const candidate of [...new Set(candidates)]) {
      try {
        const response = await this.request(candidate, {
          redirect: 'follow',
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          headers: { accept: 'application/json' },
        })
        if (!response.ok) continue
        const value = await response.json()
        if (value !== null && typeof value === 'object' && Array.isArray(value.authorization_servers)) {
          return value
        }
      } catch { /* try the next well-known location */ }
    }
    throw new Error(`This MCP server does not advertise OAuth metadata (${url.origin}). It may require a token instead.`)
  }

  /**
   * Read RFC 8414 / OpenID authorization-server metadata.
   * @param {string} issuer issuer URL
   * @param {URL} mcpUrl MCP endpoint
   */
  async authorizationMetadata(issuer, mcpUrl) {
    const base = issuer.replace(/\/$/, '')
    const candidates = [
      `${base}/.well-known/oauth-authorization-server`,
      `${base}/.well-known/openid-configuration`,
      `${mcpUrl.origin}/.well-known/oauth-authorization-server`,
    ]
    for (const candidate of [...new Set(candidates)]) {
      try {
        const response = await this.request(candidate, {
          redirect: 'follow',
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          headers: { accept: 'application/json' },
        })
        if (!response.ok) continue
        const value = await response.json()
        if (value !== null && typeof value === 'object'
          && typeof value.authorization_endpoint === 'string'
          && typeof value.token_endpoint === 'string') {
          return value
        }
      } catch { /* try the next metadata location */ }
    }
    throw new Error(`No OAuth authorization-server metadata was found for ${issuer}. GitHub remote MCP has no dynamic registration; use a personal access token instead.`)
  }

  /**
   * Obtain or reuse a dynamically registered client for this provider.
   * @param {string} id provider id
   * @param {any} provider provider preset
   * @param {any} discovered discovery result
   * @param {string} redirectUri loopback redirect
   */
  async registerClient(id, provider, discovered, redirectUri) {
    const { metadata, issuer, resourceUrl } = discovered
    const existing = await this.readGrant(id)
    if (existing?.clientId !== undefined
      && existing.issuer === issuer
      && existing.resource === resourceUrl
      && existing.redirectUri === redirectUri) {
      return existing
    }
    if (typeof metadata.registration_endpoint !== 'string') {
      throw new Error(`${provider.name} does not support dynamic client registration. Use a token instead.`)
    }
    const scopes = provider.oauth?.scopes ?? discovered.resource.scopes_supported ?? []
    const payload = {
      client_name: provider.oauth?.clientName ?? 'DSH DevTools',
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: provider.oauth?.tokenEndpointAuthMethod ?? 'none',
      ...(scopes.length > 0 ? { scope: scopes.join(' ') } : {}),
    }
    const response = await this.request(metadata.registration_endpoint, {
      method: 'POST',
      redirect: 'follow',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      const detail = text.length > 240 ? `${text.slice(0, 240)}…` : text
      if (response.status === 403) {
        throw new Error(`${provider.name} refuses dynamic client registration (HTTP 403). It may require an allow-listed client; use a token or the desktop MCP server instead.`)
      }
      throw new Error(`${provider.name} client registration failed (HTTP ${response.status})${detail === '' ? '' : `: ${detail}`}`)
    }
    const client = await response.json()
    if (typeof client.client_id !== 'string' || client.client_id === '') {
      throw new Error(`${provider.name} returned no OAuth client id.`)
    }
    const grant = {
      version: 1,
      providerId: id,
      issuer,
      resource: resourceUrl,
      authorizationEndpoint: metadata.authorization_endpoint,
      tokenEndpoint: metadata.token_endpoint,
      revocationEndpoint: metadata.revocation_endpoint,
      registrationEndpoint: metadata.registration_endpoint,
      clientId: client.client_id,
      redirectUri,
      scope: scopes.join(' '),
      omitResource: provider.oauth?.omitResource === true,
      ...(typeof client.client_secret === 'string' && client.client_secret !== '' ? { clientSecret: client.client_secret } : {}),
      tokenEndpointAuthMethod: typeof client.token_endpoint_auth_method === 'string'
        ? client.token_endpoint_auth_method
        : 'none',
    }
    await this.writeGrant(id, { ...existing, ...grant })
    return grant
  }

  /**
   * Start one browser authorization flow.
   * @param {string} id provider id
   */
  async start(id) {
    const provider = this.host.findProvider(id)
    if (provider === undefined) throw new Error(`Unknown provider "${id}"`)
    if (provider.auth !== 'oauth') throw new Error(`${provider.name} does not use browser authorization.`)
    const redirectUri = await this.ensureServer()
    const state = this.host.providerState(id)
    const mcpUrl = String(state.url ?? provider.url)
    const discovered = await this.discover(mcpUrl)
    const client = await this.registerClient(id, provider, discovered, redirectUri)
    const verifier = base64url(randomBytes(32))
    const challenge = sha256Base64url(verifier)
    const oauthState = base64url(randomBytes(24))
    const scopes = provider.oauth?.scopes ?? discovered.resource.scopes_supported ?? []
    const flow = {
      id: randomUUID(),
      providerId: id,
      providerName: provider.name,
      state: oauthState,
      verifier,
      client,
      mcpUrl,
      resource: discovered.resourceUrl,
      omitResource: provider.oauth?.omitResource === true,
      scopes,
      createdAt: Date.now(),
      phase: /** @type {'pending' | 'success' | 'error'} */ ('pending'),
      error: undefined,
    }
    this.flows.set(oauthState, flow)
    this.byId.set(flow.id, flow)
    const authorize = this.secureUrl(client.authorizationEndpoint)
    authorize.searchParams.set('response_type', 'code')
    authorize.searchParams.set('client_id', client.clientId)
    authorize.searchParams.set('redirect_uri', redirectUri)
    authorize.searchParams.set('state', oauthState)
    authorize.searchParams.set('code_challenge', challenge)
    authorize.searchParams.set('code_challenge_method', 'S256')
    if (provider.oauth?.omitResource !== true) authorize.searchParams.set('resource', discovered.resourceUrl)
    if (scopes.length > 0) authorize.searchParams.set('scope', scopes.join(' '))
    if (typeof provider.oauth?.prompt === 'string') authorize.searchParams.set('prompt', provider.oauth.prompt)
    return { flowId: flow.id, authorizeUrl: authorize.href, redirectUri }
  }

  /**
   * Complete one flow after the provider redirects.
   * @param {any} flow pending flow
   * @param {string} code authorization code
   */
  async complete(flow, code) {
    const client = flow.client
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: client.redirectUri,
      client_id: client.clientId,
      code_verifier: flow.verifier,
    })
    if (flow.omitResource !== true && flow.resource !== '') body.set('resource', flow.resource)
    const headers = { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }
    if (typeof client.clientSecret === 'string' && client.clientSecret !== '') {
      if (client.tokenEndpointAuthMethod === 'client_secret_basic') {
        headers.authorization = `Basic ${Buffer.from(`${encodeURIComponent(client.clientId)}:${encodeURIComponent(client.clientSecret)}`).toString('base64')}`
      } else {
        body.set('client_secret', client.clientSecret)
      }
    }
    const response = await this.request(client.tokenEndpoint, {
      method: 'POST',
      redirect: 'follow',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers,
      body: body.toString(),
    })
    const tokens = await response.json().catch(() => ({}))
    if (!response.ok || typeof tokens.access_token !== 'string' || tokens.access_token === '') {
      const reason = typeof tokens.error === 'string'
        ? `${tokens.error}${typeof tokens.error_description === 'string' ? `: ${tokens.error_description}` : ''}`
        : `HTTP ${response.status}`
      throw new Error(`Token exchange failed: ${reason}`)
    }
    const expiresAt = Date.now() + (Number(tokens.expires_in) > 0 ? Number(tokens.expires_in) * 1000 : 3_600_000)
    await this.writeGrant(flow.providerId, {
      ...client,
      version: 1,
      providerId: flow.providerId,
      issuer: client.issuer,
      resource: flow.resource,
      omitResource: flow.omitResource === true,
      scope: typeof tokens.scope === 'string' && tokens.scope !== '' ? tokens.scope : client.scope,
      refreshToken: typeof tokens.refresh_token === 'string' ? tokens.refresh_token : client.refreshToken,
      expiresAt,
      obtainedAt: Date.now(),
    })
    const credentials = this.ctx.get('credentials')
    if (credentials === undefined) throw new Error('The DSH credential store is unavailable.')
    await credentials.set(this.ref(flow.providerId), tokens.access_token)
    this.host.invalidateCredential?.(this.ref(flow.providerId))
    this.host.setProviderState(flow.providerId, {
      ...this.host.providerState(flow.providerId),
      enabled: true,
      authMode: 'oauth',
      credentialRef: this.ref(flow.providerId),
      url: flow.mcpUrl,
      lastChecked: Date.now(),
      oauthError: undefined,
    })
    await this.host.persist()
    this.host.register(flow.providerId, this.host.providerState(flow.providerId))
    await this.host.waitForToolPolicy?.(flow.providerId, 5_000)
    this.schedule(flow.providerId, expiresAt)
    flow.phase = 'success'
    flow.error = undefined
  }

  /**
   * Return one flow's status; a missing flow is reported explicitly.
   * @param {string} flowId flow id
   */
  status(flowId) {
    const flow = this.byId.get(flowId)
    if (flow === undefined) return { phase: 'missing', error: 'This authorization request is no longer active.' }
    return { phase: flow.phase, error: flow.error, providerId: flow.providerId }
  }

  /** @param {string} id provider id */
  ref(id) {
    return this.host.credentialRef(id)
  }

  /**
   * Read the stored grant payload for one provider.
   * @param {string} id provider id
   */
  async readGrant(id) {
    const credentials = this.ctx.get('credentials')
    if (credentials === undefined) return undefined
    try {
      const record = await credentials.readRecord(grantKey(id))
      return record?.kind === 'grant' ? record.payload : undefined
    } catch {
      return undefined
    }
  }

  /**
   * Replace one provider's grant payload.
   * @param {string} id provider id
   * @param {any} payload payload
   */
  async writeGrant(id, payload) {
    const credentials = this.ctx.get('credentials')
    if (credentials === undefined) throw new Error('The DSH credential store is unavailable.')
    // The credentials store accepts only JSON-representable payloads. Optional
    // OAuth metadata leaves keys such as revocationEndpoint undefined, which
    // JSON.stringify drops; normalize before writing.
    const jsonPayload = JSON.parse(JSON.stringify(payload))
    await credentials.modifyRecord(grantKey(id), async () => ({ kind: 'grant', payload: jsonPayload }))
  }

  /**
   * Ensure a usable access token exists, refreshing it when needed.
   * @param {string} id provider id
   * @param {boolean} [force] refresh even when not close to expiry
   */
  async ensureFresh(id, force = false) {
    const grant = await this.readGrant(id)
    if (grant === undefined || typeof grant.refreshToken !== 'string' || grant.refreshToken === '') {
      await this.markNeedsAuth(id, 'Sign in to renew this connection.')
      throw new Error('No OAuth session is stored; sign in again.')
    }
    const expiresAt = typeof grant.expiresAt === 'number' ? grant.expiresAt : 0
    if (!force && expiresAt > Date.now() + 120_000) {
      const credentials = this.ctx.get('credentials')
      const described = credentials === undefined ? undefined : await credentials.describe(this.ref(id)).catch(() => undefined)
      if (described?.configured === true) {
        this.schedule(id, expiresAt)
        return
      }
    }
    await this.refresh(id)
  }

  /**
   * Refresh one provider's access token and update its credential reference.
   * @param {string} id provider id
   */
  async refresh(id) {
    const existing = this.refreshing.get(id)
    if (existing !== undefined) return existing
    const task = this.refreshOnce(id).finally(() => { this.refreshing.delete(id) })
    this.refreshing.set(id, task)
    return task
  }

  /** @param {string} id provider id */
  async refreshOnce(id) {
    const grant = await this.readGrant(id)
    if (grant === undefined || typeof grant.refreshToken !== 'string' || grant.refreshToken === '') {
      await this.markNeedsAuth(id, 'Sign in to renew this connection.')
      throw new Error('No refresh token is stored; sign in again.')
    }
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: grant.refreshToken,
      client_id: grant.clientId,
    })
    if (grant.omitResource !== true && typeof grant.resource === 'string' && grant.resource !== '') body.set('resource', grant.resource)
    const headers = { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }
    if (typeof grant.clientSecret === 'string' && grant.clientSecret !== '') {
      if (grant.tokenEndpointAuthMethod === 'client_secret_basic') {
        headers.authorization = `Basic ${Buffer.from(`${encodeURIComponent(grant.clientId)}:${encodeURIComponent(grant.clientSecret)}`).toString('base64')}`
      } else {
        body.set('client_secret', grant.clientSecret)
      }
    }
    const response = await this.request(grant.tokenEndpoint, {
      method: 'POST',
      redirect: 'follow',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers,
      body: body.toString(),
    })
    const tokens = await response.json().catch(() => ({}))
    if (!response.ok || typeof tokens.access_token !== 'string') {
      const reason = typeof tokens.error === 'string' ? tokens.error : `HTTP ${response.status}`
      if (reason === 'invalid_grant' || reason === 'invalid_client' || reason === 'unauthorized_client') {
        await this.markNeedsAuth(id, 'The authorization expired or was revoked. Sign in again.')
        throw new Error(`Authorization expired (${reason}); sign in again.`)
      }
      throw new Error(`Token refresh failed: ${reason}`)
    }
    const expiresAt = Date.now() + (Number(tokens.expires_in) > 0 ? Number(tokens.expires_in) * 1000 : 3_600_000)
    await this.writeGrant(id, {
      ...grant,
      refreshToken: typeof tokens.refresh_token === 'string' && tokens.refresh_token !== '' ? tokens.refresh_token : grant.refreshToken,
      expiresAt,
      obtainedAt: Date.now(),
      ...(typeof tokens.scope === 'string' && tokens.scope !== '' ? { scope: tokens.scope } : {}),
    })
    const credentials = this.ctx.get('credentials')
    if (credentials === undefined) throw new Error('The DSH credential store is unavailable.')
    await credentials.set(this.ref(id), tokens.access_token)
    this.host.invalidateCredential?.(this.ref(id))
    const state = this.host.providerState(id)
    this.host.setProviderState(id, {
      ...state,
      authMode: 'oauth',
      credentialRef: this.ref(id),
      oauthError: undefined,
      lastChecked: Date.now(),
    })
    await this.host.persist()
    this.schedule(id, expiresAt)
  }

  /**
   * Mark one provider as requiring a new sign-in.
   * @param {string} id provider id
   * @param {string} message diagnostic shown in the UI
   */
  async markNeedsAuth(id, message) {
    const credentials = this.ctx.get('credentials')
    try { await credentials?.unset(this.ref(id)) } catch { /* the ref may never have been written */ }
    this.host.invalidateCredential?.(this.ref(id))
    const grant = await this.readGrant(id)
    if (grant !== undefined) {
      const { refreshToken: _removed, expiresAt: _expired, ...rest } = grant
      await this.writeGrant(id, rest).catch(() => {})
    }
    const state = this.host.providerState(id)
    this.host.setProviderState(id, { ...state, oauthError: message, lastChecked: Date.now() })
    await this.host.persist()
  }

  /**
   * Schedule a proactive refresh.
   * @param {string} id provider id
   * @param {number} expiresAt epoch milliseconds
   */
  schedule(id, expiresAt) {
    const previous = this.timers.get(id)
    if (previous !== undefined) clearTimeout(previous)
    if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) return
    const delay = Math.min(2_147_000_000, Math.max(30_000, expiresAt - Date.now() - REFRESH_LEAD_MS))
    const timer = setTimeout(() => {
      this.timers.delete(id)
      void this.refresh(id).catch((error) => {
        this.warn(`refreshing the ${id} OAuth token failed`, error)
      })
    }, delay)
    timer.unref?.()
    this.timers.set(id, timer)
  }

  /**
   * Forget one provider's OAuth session.
   * @param {string} id provider id
   */
  async clear(id) {
    const timer = this.timers.get(id)
    if (timer !== undefined) clearTimeout(timer)
    this.timers.delete(id)
    const credentials = this.ctx.get('credentials')
    const grant = await this.readGrant(id)
    let accessToken
    if (typeof credentials?.resolve === 'function') {
      try {
        accessToken = (await credentials.resolve(this.ref(id)))?.value
      } catch { /* the ref may be unreadable or absent */ }
    }
    if (grant !== undefined) {
      const revocations = []
      if (typeof grant.refreshToken === 'string' && grant.refreshToken !== '') {
        revocations.push(this.revoke(grant, grant.refreshToken, 'refresh_token'))
      }
      if (typeof accessToken === 'string' && accessToken !== '') {
        revocations.push(this.revoke(grant, accessToken, 'access_token'))
      }
      await Promise.allSettled(revocations)
    }
    try { await credentials?.unset(this.ref(id)) } catch { /* already absent */ }
    this.host.invalidateCredential?.(this.ref(id))
    try { await credentials?.deleteRecord(grantKey(id)) } catch { /* already absent */ }
  }

  /**
   * Best-effort RFC 7009 revocation. A provider that does not support it still
   * gets its local tokens removed.
   * @param {any} grant stored grant
   * @param {string} token token to revoke
   * @param {'refresh_token' | 'access_token'} hint token type
   */
  async revoke(grant, token, hint) {
    if (typeof grant.revocationEndpoint !== 'string' || grant.revocationEndpoint === '') return
    const body = new URLSearchParams({ token, token_type_hint: hint })
    if (typeof grant.clientId === 'string') body.set('client_id', grant.clientId)
    const headers = { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }
    if (typeof grant.clientSecret === 'string' && grant.clientSecret !== '') {
      if (grant.tokenEndpointAuthMethod === 'client_secret_basic') {
        headers.authorization = `Basic ${Buffer.from(`${encodeURIComponent(grant.clientId)}:${encodeURIComponent(grant.clientSecret)}`).toString('base64')}`
      } else {
        body.set('client_secret', grant.clientSecret)
      }
    }
    try {
      const response = await this.request(grant.revocationEndpoint, {
        method: 'POST',
        redirect: 'follow',
        signal: AbortSignal.timeout(5_000),
        headers,
        body: body.toString(),
      })
      if (!response.ok && response.status !== 400) {
        this.warn(`revoking the ${grant.providerId ?? 'OAuth'} token failed (HTTP ${response.status})`)
      }
    } catch (error) {
      this.warn('revoking the OAuth token failed', error)
    }
  }

  /** Forget pending browser flows after an explicit reset. */
  forgetFlows() {
    this.flows.clear()
    this.byId.clear()
  }

  /** Drop flows that no tab came back for. */
  expireFlows() {
    const cutoff = Date.now() - FLOW_TTL_MS
    for (const [state, flow] of this.flows) {
      if (flow.createdAt > cutoff) continue
      if (flow.phase === 'pending') {
        flow.phase = 'error'
        flow.error = 'The authorization request timed out. Start again.'
      }
      this.flows.delete(state)
      this.byId.delete(flow.id)
    }
  }

  /** Close the loopback server and stop timers. */
  dispose() {
    clearInterval(this.cleanupTimer)
    for (const timer of this.timers.values()) clearTimeout(timer)
    this.timers.clear()
    this.flows.clear()
    this.byId.clear()
    try { this.server?.close() } catch { /* already closed */ }
    this.server = undefined
    this.redirectUri = undefined
  }
}
