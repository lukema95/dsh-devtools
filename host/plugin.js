/**
 * DSH DevTools host half.
 *
 * Owns the MCP registrations, the durable provider/tool/permission state, the
 * permission gate in front of every MCP tool call, the activity log, and the
 * exact Fetch route the browser page talks to. The route is owner-only: DSH's
 * connection layer rejects non-owner peers before this handler runs.
 */
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { BUILTIN_PROVIDERS, credentialRefFor, tokenHeaderFor } from './presets.js'
import { OAuthBroker } from './oauth.js'
import { boundedJson, emptyState, normalizeState, redactText } from './state.js'
import { capabilitiesFor, classifyTool, defaultPolicy } from './classify.js'
import { AUTO_ALL_LIMIT, FREQUENT_USAGE_THRESHOLD, estimateToolTokens, recommendTools } from './selection.js'

/** Services this plugin needs; without them it stays inactive. */
export const inject = ['tools', 'connection']

/** The single owner-only endpoint the page uses. */
const API_PATH = '/api/dsh-devtools'
const ACTIVITY_LIMIT = 200

/**
 * Content blocks reduced to one readable string.
 * @param {{ content?: readonly unknown[] } | undefined} result tool result
 * @returns {string} joined text
 */
function contentText(result) {
  const parts = []
  for (const block of result?.content ?? []) {
    if (block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string') {
      parts.push(block.text)
    } else if (block !== null && typeof block === 'object' && block.type === 'image') {
      parts.push('[image]')
    } else {
      parts.push(boundedJson(block, 240))
    }
  }
  const joined = parts.join('\n').trim()
  if (joined === '' && result?.value !== undefined) return boundedJson(result.value, 4000)
  return joined
}

/**
 * Human-facing error text.
 * @param {unknown} error thrown value
 * @returns {string} message
 */
function messageOf(error) {
  if (error instanceof Error) return error.message
  return String(error)
}

/** The host feature. One instance per plugin activation. */
class DevToolsHost {
  /**
   * @param {import('@deepseek-ai/cordis').Context} ctx owning context
   */
  constructor(ctx) {
    this.ctx = ctx
    /** @type {ReturnType<typeof emptyState>} */
    this.state = emptyState()
    const home = process.env.DSH_HOME || join(homedir(), '.dsh')
    this.stateDir = join(home, 'devtools')
    this.stateFile = join(this.stateDir, 'state.json')
    this.manager = undefined
    this.managerScope = undefined
    /** @type {Map<string, () => void>} provider id → effect disposer */
    this.connections = new Map()
    /** @type {Map<string, number>} call id → start time */
    this.starts = new Map()
    /** @type {Set<string>} call ids started by the in-page tester */
    this.testCalls = new Set()
    /** @type {Map<string, { agent: any, dispose: (() => void) | undefined }>} agent id → visibility entry */
    this.agents = new Map()
    this.restrictTimer = undefined
    this.toolPolicyTimer = undefined
    this.toolPolicySignature = new Map()
    this.saveTimer = undefined
    this.writeChain = Promise.resolve()
    this.credentialCache = new Map()
    this.disposed = false
    this.oauth = new OAuthBroker({
      ctx,
      findProvider: id => this.findProvider(id),
      providerState: id => this.providerState(id),
      setProviderState: (id, value) => { this.state.providers[id] = value },
      persist: () => this.persistNow(),
      register: (id, value) => { this.registerProvider(id, value) },
      warn: (message, error) => this.warn(message, error),
      credentialRef: id => credentialRefFor(id),
      invalidateCredential: ref => { this.credentialCache.delete(ref) },
    })
    this.ready = this.init()

    ctx.effect(() => () => this.dispose(), 'dsh-devtools: lifecycle')

    ctx.effect(() => ctx.connection.fetch.register({
      path: API_PATH,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: request => this.handle(request),
    }), 'dsh-devtools: api')

    ctx.effect(() => ctx.tools.guard(exec => this.guard(exec)), 'dsh-devtools: guard')
    ctx.effect(() => ctx.on('tools/pre-execute', (exec, next) => this.beforeExecute(exec, next)), 'dsh-devtools: gate')
    ctx.effect(() => ctx.on('tools/result', (exec, result) => { this.afterExecute(exec, result) }), 'dsh-devtools: activity')
    ctx.effect(() => ctx.on('agent/created', ({ agent }) => { this.trackAgent(agent) }), 'dsh-devtools: agent visibility')
    ctx.effect(() => ctx.on('agent/disposed', ({ agent }) => { this.untrackAgent(String(agent.id)) }), 'dsh-devtools: agent visibility')
    ctx.effect(() => ctx.on('tools/change', () => {
      this.scheduleRestrictions()
      this.scheduleToolPolicy()
    }), 'dsh-devtools: tool visibility')

    this.registerDiscoveryTools()
    ctx.inject(['mcpManager'], (scope) => {
      this.managerScope = scope
      this.manager = scope.mcpManager
      void this.ready.then(() => {
        if (!this.disposed) void this.startEnabled()
      })
      return () => {
        this.manager = undefined
        this.managerScope = undefined
      }
    })
  }

  /** @param {string} message diagnostic text @param {unknown} [error] cause */
  warn(message, error) {
    const factory = this.ctx.logger
    const logger = typeof factory === 'function' ? factory('dsh-devtools') : undefined
    if (logger?.warn) logger.warn(`${message}${error === undefined ? '' : `: ${messageOf(error)}`}`)
    else console.warn(`[dsh-devtools] ${message}`, error ?? '')
  }

  /** Read the durable state file. */
  async init() {
    try {
      const text = await readFile(this.stateFile, 'utf8')
      this.state = normalizeState(JSON.parse(text))
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        this.warn('reading stored state failed; starting with defaults', error)
        this.state = emptyState()
      }
    }
    // Figma changed from a remote token connection to the desktop server.
    for (const provider of BUILTIN_PROVIDERS) {
      const stored = this.state.providers[provider.id]
      if (stored === undefined) continue
      if (provider.auth === 'local' && stored.authMode !== 'local') {
        this.state.providers[provider.id] = {
          ...stored,
          authMode: 'local',
          url: provider.url,
          enabled: false,
        }
        delete this.state.providers[provider.id].credentialRef
        continue
      }
      if (provider.id === 'figma' && stored.authMode !== 'oauth') {
        // 0.5.x used the desktop server; 0.6 uses the official remote server.
        this.state.providers[provider.id] = {
          ...stored,
          authMode: 'oauth',
          url: provider.url,
          enabled: false,
        }
        delete this.state.providers[provider.id].credentialRef
        delete this.state.providers[provider.id].toolPolicy
        delete this.state.providers[provider.id].toolPolicyAuto
        delete this.state.providers[provider.id].tools
        delete this.state.providers[provider.id].oauthError
        delete this.state.providers[provider.id].lastChecked
        continue
      }
      // A token saved by 0.1.0 stays usable until the user signs in again.
      if (provider.auth === 'oauth' && stored.authMode === undefined && stored.credentialRef !== undefined) {
        this.state.providers[provider.id] = { ...stored, authMode: 'token' }
      }
    }
    this.scheduleRestrictions()
  }

  /**
   * Track one agent so disabled MCP tools disappear from its next request.
   * @param {any} agent calling agent
   */
  trackAgent(agent, apply = true) {
    if (agent === null || typeof agent !== 'object' || agent.ctx === undefined) return undefined
    const id = String(agent.id ?? '')
    if (id === '') return undefined
    let entry = this.agents.get(id)
    if (entry === undefined) {
      entry = { agent, dispose: undefined }
      this.agents.set(id, entry)
    }
    if (apply) this.applyAgentRestriction(entry)
    return entry
  }

  /** @param {string} id agent id */
  untrackAgent(id) {
    const entry = this.agents.get(id)
    if (entry === undefined) return
    try { entry.dispose?.() } catch { /* the agent context is already gone */ }
    this.agents.delete(id)
  }

  /** The public names of MCP tools the user disabled. */
  disabledToolNames() {
    const names = []
    for (const definition of this.toolDefinitions()) {
      const info = this.describeTool(definition.name)
      if (info !== undefined && !this.toolEnabled(info.providerId, info.rawName)) names.push(definition.name)
    }
    return names
  }

  /**
   * Apply the current visibility mask on one agent's context.
   * @param {{ agent: any, dispose: (() => void) | undefined }} entry tracked agent
   */
  applyAgentRestriction(entry) {
    try { entry.dispose?.() } catch { /* the previous mask is already lifted */ }
    entry.dispose = undefined
    const denied = this.disabledToolNames()
    if (denied.length === 0) return
    try {
      const agent = entry.agent
      entry.dispose = agent.ctx.effect(() => agent.ctx.tools.restrict({ deny: denied }))
    } catch (error) {
      // A tool can vanish between schema read and mask application; the next
      // tools/change or toggle retries with the current set.
      this.warn('applying tool visibility failed', error)
    }
  }

  /** Reapply restrictions to every live agent after a tool or agent change. */
  refreshRestrictions() {
    this.restrictTimer = undefined
    try {
      const agents = this.ctx.get('agents')
      if (agents !== undefined && typeof agents.list === 'function') {
        for (const agent of agents.list()) this.trackAgent(agent, false)
      }
    } catch (error) {
      this.warn('enumerating agents for tool visibility failed', error)
    }
    for (const entry of this.agents.values()) this.applyAgentRestriction(entry)
  }

  /**
   * Two small tools let the agent discover and enable tools that the
   * recommended set hides, without injecting the whole catalog.
   */
  registerDiscoveryTools() {
    const search = {
      name: 'devtools_search_tools',
      description: 'Search every MCP tool from connected DevTools providers, including tools currently hidden by the recommended set. Use this when the user asks for a provider capability that is not in your visible tool list, then call devtools_enable_tool with the exact tool name.',
      parameters: {
        query: { type: 'string', required: true, description: 'What capability to look for, e.g. "list deployments" or "create issue".' },
        provider: { type: 'string', description: 'Optional provider id, e.g. vercel or github.' },
        limit: { type: 'number', description: 'Maximum results, 1-50. Defaults to 25.' },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: String(value) }],
      },
      execute: async (args) => this.searchDiscoveredTools(args),
    }
    const enable = {
      name: 'devtools_enable_tool',
      description: 'Enable one MCP tool returned by devtools_search_tools. The tool becomes visible on the next model step and keeps the provider permission policy. Do not enable destructive tools unless the user asked for that operation.',
      parameters: {
        name: { type: 'string', required: true, description: 'Exact tool name, e.g. mcp__vercel__list_deployments.' },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: String(value) }],
      },
      execute: async (args) => this.enableDiscoveredTool(args),
    }
    for (const definition of [search, enable]) {
      try {
        this.ctx.effect(() => this.ctx.tools.register(definition), `dsh-devtools: ${definition.name}`)
      } catch (error) {
        this.warn(`registering ${definition.name} failed`, error)
      }
    }
  }

  /** @param {Record<string, unknown>} args search arguments */
  searchDiscoveredTools(args) {
    const raw = args !== null && typeof args === 'object' ? args : {}
    const query = String(raw.query ?? '').trim().toLowerCase()
    if (query === '') return 'Provide a search query.'
    const providerId = typeof raw.provider === 'string' ? raw.provider.trim() : ''
    const limit = Math.min(50, Math.max(1, Number(raw.limit) > 0 ? Math.floor(Number(raw.limit)) : 25))
    const hits = []
    for (const definition of this.toolDefinitions()) {
      if (!definition.name.startsWith('mcp__')) continue
      const info = this.describeTool(definition.name)
      if (info === undefined) continue
      if (providerId !== '' && info.providerId !== providerId) continue
      const haystack = `${info.rawName} ${definition.description ?? ''} ${info.providerName}`.toLowerCase()
      if (!haystack.includes(query)) continue
      const enabled = this.toolEnabled(info.providerId, info.rawName)
      const policy = this.policyFor(this.providerState(info.providerId), info.rawName, info.classification)
      hits.push({ info, enabled, policy, description: definition.description ?? '' })
    }
    hits.sort((left, right) => Number(right.enabled) - Number(left.enabled)
      || left.info.rawName.length - right.info.rawName.length
      || left.info.rawName.localeCompare(right.info.rawName))
    if (hits.length === 0) return `No MCP tool matched "${query}".`
    const lines = hits.slice(0, limit).map((hit) => {
      const state = hit.enabled ? 'enabled' : 'disabled'
      const warning = hit.policy === 'block' ? ', blocked by policy' : ''
      return `- ${hit.info.toolName} (${hit.info.providerName}, ${hit.info.classification}, ${state}${warning}) — ${hit.description}`
    })
    const extra = hits.length > limit ? `\n… ${hits.length - limit} more; narrow the query.` : ''
    return `Found ${hits.length} matching tools:\n${lines.join('\n')}${extra}\n\nEnable a disabled tool with devtools_enable_tool and its exact name.`
  }

  /** @param {Record<string, unknown>} args enable arguments */
  async enableDiscoveredTool(args) {
    const raw = args !== null && typeof args === 'object' ? args : {}
    const name = String(raw.name ?? '')
    const info = this.describeTool(name)
    if (info === undefined) return `"${name}" is not an MCP tool from a connected DevTools provider.`
    const provider = this.requireProvider(info.providerId)
    const current = this.providerState(info.providerId)
    if (current.enabled !== true) return `${provider.name} is not connected; connect it first.`
    if (this.toolEnabled(info.providerId, info.rawName)) return `${name} is already enabled.`
    const enabledCount = this.providerFacts(info.providerId).filter(tool => this.toolEnabled(info.providerId, tool.rawName)).length
    if (enabledCount >= 40) return `${provider.name} already has ${enabledCount} enabled tools. Ask the user to review the Tools tab before enabling more.`
    const tools = { ...current.tools, [info.rawName]: 'enabled' }
    const policy = current.toolPolicy === 'all' || current.toolPolicy === undefined ? 'all' : 'custom'
    this.state.providers[info.providerId] = { ...current, toolPolicy: policy, toolPolicyAuto: false, tools }
    this.scheduleRestrictions()
    await this.persistNow()
    const policyName = this.policyFor(this.providerState(info.providerId), info.rawName, info.classification)
    return `Enabled ${name}. It will be visible on the next model step; its policy is ${policyName}.`
  }

  /** Debounce restriction refreshes so a burst of tool changes settles once. */
  scheduleRestrictions() {
    if (this.restrictTimer !== undefined) return
    this.restrictTimer = setTimeout(() => this.refreshRestrictions(), 40)
  }

  /**
   * Wait for a provider's tool burst to settle, then choose the initial
   * enabled set. A Vercel-sized catalog must never be enabled wholesale.
   */
  scheduleToolPolicy() {
    // Do not reset an already scheduled pass: a burst of tools/change events
    // can otherwise postpone the initial selection forever.
    if (this.toolPolicyTimer !== undefined) return
    this.toolPolicyTimer = setTimeout(() => {
      this.toolPolicyTimer = undefined
      void this.applyToolPolicies()
    }, 900)
  }

  /**
   * Enumerate registered tools across DSH versions. `definitions()` exists in
   * 0.2.2+; 0.2.1 exposed the same registry through `schemas()`. Falling back
   * keeps the panel from failing to render on an otherwise supported host.
   * @returns {readonly { name: string, description?: string, parameters?: unknown }[]} tool definitions
   */
  toolDefinitions() {
    const tools = this.ctx.tools
    try {
      if (typeof tools?.definitions === 'function') return tools.definitions()
    } catch (error) {
      this.warn('reading tool definitions failed; trying schemas', error)
    }
    try {
      if (typeof tools?.schemas === 'function') return tools.schemas()
    } catch (error) {
      this.warn('reading tool schemas failed', error)
    }
    return []
  }

  /** Discover one provider's tools without going through the public snapshot. */
  providerFacts(id) {
    const facts = []
    for (const definition of this.toolDefinitions()) {
      const info = this.describeTool(definition.name)
      if (info === undefined || info.providerId !== id) continue
      facts.push({
        rawName: info.rawName,
        classification: info.classification,
        description: definition.description ?? '',
        tokens: estimateToolTokens(definition),
      })
    }
    return facts.sort((left, right) => left.rawName.localeCompare(right.rawName))
  }

  /** Apply the default selection, retrying after a transient discovery failure. */
  async applyToolPolicies() {
    try {
      await this.applyToolPoliciesOnce()
    } catch (error) {
      this.warn('selecting default tools failed', error)
      this.scheduleToolPolicy()
    }
  }

  /** One selection pass. */
  async applyToolPoliciesOnce() {
    if (this.disposed) return
    let changed = false
    for (const provider of this.providers()) {
      const current = this.state.providers[provider.id]
      if (current?.enabled !== true) continue
      if (current.toolPolicy != null && current.toolPolicy !== 'pending') continue
      // Tool definitions are the real signal here: a transient status value
      // must not leave a provider stuck in `pending` with zero enabled tools.
      const facts = this.providerFacts(provider.id)
      if (facts.length === 0) {
        this.scheduleToolPolicy()
        continue
      }
      const signature = facts.map(fact => fact.rawName).join('|')
      if (this.toolPolicySignature.get(provider.id) !== signature) {
        this.toolPolicySignature.set(provider.id, signature)
        this.scheduleToolPolicy()
        continue
      }
      const pending = current.toolPolicy === 'pending'
      const existing = pending ? {} : current.tools ?? {}
      const flags = pending ? {} : { ...existing }
      let policy = 'all'
      if (facts.length > AUTO_ALL_LIMIT) {
        policy = 'recommended'
        const recommended = new Set(recommendTools(facts, current.toolUsage ?? {}))
        for (const fact of facts) {
          if (existing[fact.rawName] === undefined) {
            flags[fact.rawName] = recommended.has(fact.rawName) ? 'enabled' : 'disabled'
          }
        }
      }
      this.state.providers[provider.id] = {
        ...current,
        toolPolicy: policy,
        toolPolicyAuto: policy === 'recommended',
        tools: flags,
      }
      changed = true
    }
    if (!changed) return
    this.scheduleRestrictions()
    await this.persistNow()
  }

  /** Remove every provider connection, credential, policy and activity entry. */
  async resetAll() {
    for (const provider of this.providers()) {
      this.unregisterProvider(provider.id)
      await this.oauth.clear(provider.id).catch(() => {})
      const credentials = this.ctx.get('credentials')
      const ref = credentialRefFor(provider.id)
      try { await credentials?.unset(ref) } catch { /* already absent */ }
      try { await credentials?.deleteRecord(`dsh-devtools/${provider.id}`) } catch { /* already absent */ }
    }
    const credentials = this.ctx.get('credentials')
    if (credentials !== undefined && typeof credentials.listRecords === 'function') {
      try {
        for (const record of await credentials.listRecords()) {
          if (String(record.key).startsWith('dsh-devtools/')) {
            await credentials.deleteRecord(record.key)
          }
        }
      } catch (error) {
        this.warn('removing DevTools credential records failed', error)
      }
    }
    this.credentialCache.clear()
    this.toolPolicySignature.clear()
    this.oauth.forgetFlows()
    this.state = emptyState()
    this.scheduleRestrictions()
    await this.persistNow()
    return await this.snapshot()
  }

  /**
   * Apply a deliberate provider-level selection.
   * @param {string} id provider id
   * @param {'all' | 'recommended' | 'none'} mode selection mode
   */
  async setProviderToolMode(id, mode) {
    const provider = this.requireProvider(id)
    const current = this.providerState(id)
    const facts = this.providerFacts(id)
    if (facts.length === 0) throw new Error(`${provider.name} has not discovered any tools yet`)
    /** @type {Record<string, 'enabled' | 'disabled'>} */
    const flags = {}
    if (mode === 'all') {
      this.state.providers[id] = { ...current, toolPolicy: 'all', toolPolicyAuto: false, tools: flags }
    } else if (mode === 'recommended') {
      const recommended = new Set(recommendTools(facts, current.toolUsage ?? {}))
      for (const fact of facts) flags[fact.rawName] = recommended.has(fact.rawName) ? 'enabled' : 'disabled'
      this.state.providers[id] = { ...current, toolPolicy: 'recommended', toolPolicyAuto: true, tools: flags }
    } else if (mode === 'none') {
      for (const fact of facts) flags[fact.rawName] = 'disabled'
      this.state.providers[id] = { ...current, toolPolicy: 'custom', toolPolicyAuto: false, tools: flags }
    } else {
      throw new Error('Unknown tool selection mode')
    }
    this.toolPolicySignature.set(id, facts.map(fact => fact.rawName).join('|'))
    this.scheduleRestrictions()
    await this.persistNow()
    return await this.snapshot()
  }

  /** Register every provider the user left enabled, refreshing OAuth tokens first. */
  async startEnabled() {
    for (const provider of this.providers()) {
      const providerState = this.state.providers[provider.id]
      if (providerState?.enabled !== true) continue
      const authMode = providerState.authMode ?? provider.auth
      if (authMode === 'oauth') {
        try {
          await this.oauth.ensureFresh(provider.id)
        } catch (error) {
          this.warn(`restoring the ${provider.id} OAuth session failed`, error)
          continue
        }
      }
      try {
        this.registerProvider(provider.id, this.state.providers[provider.id] ?? providerState)
      } catch (error) {
        this.warn(`restoring the ${provider.id} MCP connection failed`, error)
      }
    }
    this.scheduleToolPolicy()
  }

  /** Built-ins first, then user-added endpoints. */
  providers() {
    const custom = this.state.custom.map(entry => ({
      id: entry.id,
      name: entry.name,
      description: entry.description ?? 'Custom MCP server',
      url: entry.url,
      site: '',
      auth: 'token',
      token: { name: 'Authorization', prefix: 'Bearer ', label: 'Access token' },
      tokenFallback: true,
      kind: 'custom',
    }))
    return [
      ...BUILTIN_PROVIDERS.map(provider => ({ ...provider, kind: 'builtin' })),
      ...custom,
    ]
  }

  /** @param {string} id provider id @returns {ReturnType<DevToolsHost['providers']>[number] | undefined} provider */
  findProvider(id) {
    return this.providers().find(provider => provider.id === id)
  }

  /** @param {string} id provider id */
  requireProvider(id) {
    const provider = this.findProvider(id)
    if (provider === undefined) throw new Error(`Unknown provider "${id}"`)
    return provider
  }

  /** Provider ids longest-first so `custom-1` never shadows a longer prefix. */
  orderedProviderIds() {
    return this.providers().map(provider => provider.id).sort((left, right) => right.length - left.length)
  }

  /**
   * Resolve one model-facing tool name to its provider and raw tool name.
   * @param {string} name public tool name
   * @returns {{ providerId: string, providerName: string, rawName: string, toolName: string, classification: 'read' | 'write' | 'dangerous' } | undefined} tool facts
   */
  describeTool(name) {
    if (typeof name !== 'string' || !name.startsWith('mcp__')) return undefined
    const rest = name.slice('mcp__'.length)
    for (const id of this.orderedProviderIds()) {
      const prefix = `${id}__`
      if (!rest.startsWith(prefix)) continue
      const rawName = rest.slice(prefix.length)
      const provider = this.findProvider(id)
      const definition = this.ctx.tools.get(name)
      return {
        providerId: id,
        providerName: provider?.name ?? id,
        rawName,
        toolName: name,
        classification: classifyTool(rawName, definition?.description ?? ''),
      }
    }
    return undefined
  }

  /** @param {string} id provider id */
  providerState(id) {
    const existing = this.state.providers[id]
    if (existing === undefined) {
      return { requireApproval: true }
    }
    return existing
  }

  /**
   * Effective policy for one tool: explicit override, else its inferred default.
   * @param {ReturnType<DevToolsHost['providerState']>} providerState provider entry
   * @param {string} rawName raw tool name
   * @param {'read' | 'write' | 'dangerous'} classification inferred risk
   * @returns {'auto' | 'ask' | 'block'} policy
   */
  policyFor(providerState, rawName, classification) {
    const explicit = providerState.policies?.[rawName]
    if (explicit !== undefined) return explicit
    return defaultPolicy(classification, providerState.requireApproval !== false)
  }

  /** @param {string} id provider id @param {string} rawName raw tool name */
  toolEnabled(id, rawName) {
    const state = this.providerState(id)
    if (state.toolPolicy === 'pending') return false
    if (state.toolPolicy === 'recommended' || state.toolPolicy === 'custom') {
      return state.tools?.[rawName] === 'enabled'
    }
    return state.tools?.[rawName] !== 'disabled'
  }

  /**
   * Whether a provider has a stored token; short cache because Settings may
   * change the credential outside this page.
   * @param {string | undefined} ref credential reference
   * @returns {Promise<boolean>} configured
   */
  async hasCredential(ref) {
    if (ref === undefined) return false
    const cached = this.credentialCache.get(ref)
    if (cached !== undefined && Date.now() - cached.at < 10_000) return cached.value
    const credentials = this.ctx.get('credentials')
    let value = false
    if (credentials !== undefined) {
      try {
        value = (await credentials.describe(ref)).configured === true
      } catch {
        value = false
      }
    }
    this.credentialCache.set(ref, { value, at: Date.now() })
    return value
  }

  /** Map an mcp-client status to the page's vocabulary. */
  mapStatus(status) {
    if (status === undefined) return { state: 'disconnected', detail: null }
    switch (status.state) {
      case 'connected':
        return { state: 'connected', detail: `${status.toolCount} tools` }
      case 'connecting':
        return { state: 'connecting', detail: status.attempt > 0 ? `Retrying (attempt ${status.attempt + 1})` : 'Connecting' }
      case 'reconnecting':
        return { state: 'connecting', detail: `Retrying ${status.attempt}/${status.maxAttempts}` }
      case 'waiting-credentials':
        return { state: 'needs-auth', detail: status.lastError ?? 'Waiting for credentials' }
      case 'failed':
        return { state: 'error', detail: status.lastError ?? status.reason ?? 'Connection failed' }
      case 'closed':
        return { state: 'disconnected', detail: 'Closed' }
      default:
        return { state: 'disconnected', detail: null }
    }
  }

  /**
   * The complete page snapshot.
   * @returns {Promise<Record<string, unknown>>} snapshot
   */
  async snapshot() {
    const entries = new Map()
    if (this.manager !== undefined) {
      try {
        for (const entry of this.manager.list()) entries.set(entry.name, entry)
      } catch (error) {
        this.warn('listing MCP servers failed', error)
      }
    }
    const definitions = this.toolDefinitions()
    /** @type {Map<string, typeof definitions>} */
    const byProvider = new Map()
    for (const definition of definitions) {
      const info = this.describeTool(definition.name)
      if (info === undefined) continue
      const list = byProvider.get(info.providerId) ?? []
      list.push(definition)
      byProvider.set(info.providerId, list)
    }

    const providers = []
    const tools = []
    for (const provider of this.providers()) {
      const state = this.providerState(provider.id)
      const status = this.mapStatus(entries.get(provider.id)?.status)
      const providerTools = byProvider.get(provider.id) ?? []
      const authMode = state.authMode ?? provider.auth
      const hasCredential = await this.hasCredential(state.credentialRef)
      const needsAuth = authMode === 'oauth' && state.enabled === true && !hasCredential
      const rows = providerTools.map((definition) => {
        const info = this.describeTool(definition.name)
        return {
          name: definition.name,
          rawName: info?.rawName ?? definition.name,
          providerId: provider.id,
          providerName: provider.name,
          description: definition.description ?? '',
          classification: info?.classification ?? 'read',
          enabled: this.toolEnabled(provider.id, info?.rawName ?? definition.name),
          policy: this.policyFor(state, info?.rawName ?? definition.name, info?.classification ?? 'read'),
          tokens: estimateToolTokens(definition),
          usage: state.toolUsage?.[info?.rawName ?? definition.name] ?? 0,
        }
      }).sort((left, right) => left.rawName.localeCompare(right.rawName))
      tools.push(...rows)
      const enabledToolCount = rows.filter(row => row.enabled).length
      const schemaTokens = rows.reduce((sum, row) => sum + row.tokens, 0)
      const enabledSchemaTokens = rows.reduce((sum, row) => sum + (row.enabled ? row.tokens : 0), 0)
      providers.push({
        id: provider.id,
        name: provider.name,
        description: provider.description,
        kind: provider.kind,
        url: state.url ?? provider.url,
        site: provider.site,
        enabled: state.enabled === true,
        status: needsAuth ? 'needs-auth' : status.state,
        statusDetail: needsAuth
          ? (state.oauthError ?? null)
          : status.detail === null ? null : redactText(status.detail).slice(0, 240),
        toolCount: rows.length,
        enabledToolCount,
        toolPolicy: state.toolPolicy ?? 'all',
        schemaTokens,
        enabledSchemaTokens,
        hasCredential,
        auth: authMode === 'local' ? 'none' : hasCredential ? 'bearer' : 'none',
        authMode,
        oauth: provider.auth === 'oauth',
        local: provider.auth === 'local',
        tokenFallback: provider.tokenFallback === true,
        needsAuth,
        oauthError: state.oauthError ?? null,
        tokenLabel: provider.token?.label ?? null,
        tokenDocs: provider.token?.docs ?? null,
        tokenScopes: provider.token?.scopes ?? [],
        account: state.account ?? null,
        lastChecked: entries.get(provider.id)?.status?.state === 'connected'
          ? entries.get(provider.id)?.status?.connectedAt ?? null
          : state.lastChecked ?? null,
        requireApproval: state.requireApproval !== false,
        capabilities: capabilitiesFor(rows),
      })
    }

    const totals = {
      integrations: providers.length,
      connected: providers.filter(provider => provider.status === 'connected').length,
      tools: tools.length,
      enabled: tools.filter(tool => tool.enabled).length,
      schemaTokens: providers.reduce((sum, provider) => sum + provider.schemaTokens, 0),
      enabledSchemaTokens: providers.reduce((sum, provider) => sum + provider.enabledSchemaTokens, 0),
    }
    return {
      now: Date.now(),
      providers,
      tools,
      activity: this.state.activity.slice(0, ACTIVITY_LIMIT),
      totals,
    }
  }

  /**
   * Register one provider's MCP server in the manager.
   * @param {string} id provider id
   * @param {ReturnType<DevToolsHost['providerState']>} providerState provider entry
   */
  registerProvider(id, providerState) {
    if (this.manager === undefined || this.managerScope === undefined) {
      throw new Error('MCP server management is not available in this DSH profile')
    }
    const provider = this.findProvider(id)
    if (provider === undefined) throw new Error(`Unknown provider "${id}"`)
    const stored = this.state.providers[id]
    if (provider.largeCatalog === true && stored !== undefined) {
      const hasUsage = Object.values(stored.toolUsage ?? {}).some(count => count >= FREQUENT_USAGE_THRESHOLD)
      // A legacy "all" selection (no explicit user choice) should get the new
      // recommended default on the next connection.
      const resetLegacyAll = stored.toolPolicy === 'all' && stored.toolPolicyAuto !== false
      if (stored.toolPolicy == null
        || resetLegacyAll
        || (stored.toolPolicy === 'recommended' && stored.toolPolicyAuto !== false && hasUsage)) {
        this.state.providers[id] = { ...stored, toolPolicy: 'pending' }
      }
    }
    const url = providerState.url ?? provider.url
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      throw new Error('The MCP endpoint must be an http(s) URL')
    }
    this.unregisterProvider(id)
    /** @type {Record<string, unknown>} */
    const entry = {
      transport: 'streamable-http',
      url,
      startupTimeoutMs: 25_000,
      toolCallTimeoutMs: 60_000,
      failOnStartupError: false,
      reconnect: { enabled: true, initialDelayMs: 1_000, maxDelayMs: 15_000, maxAttempts: 3 },
    }
    const authMode = providerState.authMode ?? provider.auth
    if (authMode !== 'local' && providerState.credentialRef !== undefined) {
      const header = tokenHeaderFor(provider)
      entry.headers = {
        [header.name]: `${header.prefix}${'${credential:'}${providerState.credentialRef}}`,
      }
    }
    const manager = this.manager
    const release = this.managerScope.effect(() => manager.register(id, entry))
    this.connections.set(id, release)
    this.scheduleToolPolicy()
  }

  /**
   * Wait until the freshly registered server has connected, so a token dialog
   * can stay open on a bad credential instead of closing optimistically.
   * @param {string} id provider id
   * @param {number} [timeoutMs] deadline
   */
  async waitForConnection(id, timeoutMs = 20_000) {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      if (this.disposed) throw new Error('The DevTools plugin is shutting down')
      const entry = this.manager?.list().find(item => item.name === id)
      const status = entry?.status
      if (status?.state === 'connected') return
      if (status?.state === 'failed' || status?.state === 'waiting-credentials' || status?.state === 'closed') {
        throw new Error(status.lastError ?? status.reason ?? 'The MCP server rejected the connection')
      }
      await new Promise(resolve => setTimeout(resolve, 150))
    }
    throw new Error('Timed out waiting for the MCP server to connect')
  }

  /**
   * Let the connect dialog close on a settled tool set rather than a pending
   * provider that still shows 0 or all tools for a moment.
   * @param {string} id provider id
   * @param {number} [timeoutMs] deadline
   */
  async waitForToolPolicy(id, timeoutMs = 5_000) {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      if (this.providerState(id).toolPolicy !== 'pending') return
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  /** @param {string} id provider id */
  unregisterProvider(id) {
    const release = this.connections.get(id)
    this.connections.delete(id)
    if (release === undefined) return
    try {
      release()
    } catch (error) {
      this.warn(`closing the ${id} MCP connection failed`, error)
    }
  }

  /** Persist after a short delay so activity bursts do not thrash the file. */
  scheduleSave() {
    if (this.saveTimer !== undefined) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = undefined
      void this.persistNow()
    }, 350)
  }

  /** Write the state file atomically, serialized behind earlier writes. */
  async persistNow() {
    if (this.saveTimer !== undefined) {
      clearTimeout(this.saveTimer)
      this.saveTimer = undefined
    }
    const write = async () => {
      const temporary = `${this.stateFile}.${process.pid}.${randomUUID()}.tmp`
      try {
        await mkdir(this.stateDir, { recursive: true, mode: 0o700 })
        await writeFile(temporary, JSON.stringify(this.state), { encoding: 'utf8', mode: 0o600 })
        await rename(temporary, this.stateFile)
      } catch (error) {
        await rm(temporary, { force: true }).catch(() => {})
        this.warn('saving DevTools state failed', error)
      }
    }
    const next = this.writeChain.then(write, write)
    this.writeChain = next
    await next
  }

  /** @param {string} id provider id */
  requireManager() {
    if (this.manager === undefined) {
      throw new Error('MCP server management is not available in this DSH profile')
    }
    return this.manager
  }

  /**
   * Run one page action.
   * @param {string} action action name
   * @param {Record<string, unknown>} body request body
   * @returns {Promise<Record<string, unknown>>} response payload
   */
  async dispatch(action, body) {
    switch (action) {
      case 'state': {
        return await this.snapshot()
      }
      case 'connect': {
        await this.connect(body)
        return await this.snapshot()
      }
      case 'disconnect': {
        const id = String(body.id ?? '')
        this.requireProvider(id)
        const current = this.providerState(id)
        // Disconnect only closes the connection. Stored credentials and tool
        // settings stay for a quick reconnect; Reset DevTools data removes them.
        this.unregisterProvider(id)
        this.state.providers[id] = { ...current, enabled: false }
        this.scheduleRestrictions()
        await this.persistNow()
        return await this.snapshot()
      }
      case 'reconnect': {
        const id = String(body.id ?? '')
        this.requireProvider(id)
        const provider = this.findProvider(id)
        if (provider === undefined) throw new Error(`Unknown provider "${id}"`)
        const current = this.providerState(id)
        if (current.enabled !== true) {
          await this.connect({ id })
        } else {
          if ((current.authMode ?? provider.auth) === 'oauth') {
            await this.oauth.ensureFresh(id)
          }
          try {
            await this.requireManager().restart(id)
          } catch {
            this.registerProvider(id, this.providerState(id))
          }
          this.state.providers[id] = { ...this.providerState(id), lastChecked: Date.now() }
          await this.persistNow()
        }
        return await this.snapshot()
      }
      case 'probe': {
        const id = String(body.id ?? '')
        this.requireProvider(id)
        const manager = this.requireManager()
        const result = await manager.probe(id, { timeoutMs: 20_000, maxToolNames: 200 })
        const current = this.providerState(id)
        this.state.providers[id] = { ...current, lastChecked: Date.now() }
        this.scheduleSave()
        return { probe: result }
      }
      case 'oauthStart': {
        const id = String(body.id ?? '')
        this.requireProvider(id)
        return await this.oauth.start(id)
      }
      case 'oauthStatus': {
        return { status: this.oauth.status(String(body.flowId ?? '')) }
      }
      case 'addProvider': {
        return await this.addProvider(body)
      }
      case 'removeProvider': {
        const id = String(body.id ?? '')
        if (!this.state.custom.some(entry => entry.id === id)) {
          throw new Error('Only user-added servers can be removed')
        }
        await this.oauth.clear(id).catch(() => {})
        this.unregisterProvider(id)
        delete this.state.providers[id]
        this.state.custom = this.state.custom.filter(entry => entry.id !== id)
        await this.persistNow()
        return await this.snapshot()
      }
      case 'setToolEnabled': {
        const name = String(body.name ?? '')
        const info = this.describeTool(name)
        if (info === undefined) throw new Error(`Unknown MCP tool "${name}"`)
        const current = this.providerState(info.providerId)
        const tools = { ...current.tools }
        const policy = current.toolPolicy === 'all' || current.toolPolicy === undefined ? 'all' : 'custom'
        if (body.enabled === true) {
          if (policy === 'all') delete tools[info.rawName]
          else tools[info.rawName] = 'enabled'
        } else {
          tools[info.rawName] = 'disabled'
        }
        this.state.providers[info.providerId] = { ...current, toolPolicy: policy, toolPolicyAuto: false, tools }
        this.scheduleRestrictions()
        await this.persistNow()
        return { ok: true }
      }
      case 'setProviderToolsEnabled': {
        const id = String(body.id ?? '')
        this.requireProvider(id)
        const enabled = body.enabled === true
        const { tools } = await this.toolRows()
        const current = this.providerState(id)
        const flags = { ...current.tools }
        for (const tool of tools) {
          if (tool.providerId !== id) continue
          if (enabled) flags[tool.rawName] = 'enabled'
          else flags[tool.rawName] = 'disabled'
        }
        this.state.providers[id] = {
          ...current,
          toolPolicy: enabled ? 'all' : 'custom',
          toolPolicyAuto: false,
          tools: enabled ? {} : flags,
        }
        this.scheduleRestrictions()
        await this.persistNow()
        return await this.snapshot()
      }
      case 'resetAll': {
        return await this.resetAll()
      }
      case 'setProviderToolMode': {
        const id = String(body.id ?? '')
        const mode = String(body.mode ?? '')
        return await this.setProviderToolMode(id, mode)
      }
      case 'setPolicy': {
        const name = String(body.name ?? '')
        const policy = String(body.policy ?? '')
        if (!['auto', 'ask', 'block'].includes(policy)) throw new Error('Unknown policy')
        const info = this.describeTool(name)
        if (info === undefined) throw new Error(`Unknown MCP tool "${name}"`)
        const current = this.providerState(info.providerId)
        this.state.providers[info.providerId] = {
          ...current,
          policies: { ...current.policies, [info.rawName]: policy },
        }
        await this.persistNow()
        return { ok: true }
      }
      case 'setRequireApproval': {
        const id = String(body.id ?? '')
        this.requireProvider(id)
        const current = this.providerState(id)
        this.state.providers[id] = { ...current, requireApproval: body.value !== false }
        await this.persistNow()
        return { ok: true }
      }
      case 'applyProfile': {
        const profile = String(body.profile ?? '')
        const map = {
          'read-only': { read: 'auto', write: 'block', dangerous: 'block', approval: false },
          standard: { read: 'auto', write: 'ask', dangerous: 'block', approval: true },
          unattended: { read: 'auto', write: 'auto', dangerous: 'ask', approval: false },
        }
        const selected = map[profile]
        if (selected === undefined) throw new Error('Unknown permission profile')
        for (const provider of this.providers()) {
          this.state.providers[provider.id] = {
            ...this.providerState(provider.id),
            requireApproval: selected.approval,
          }
        }
        const { tools } = await this.toolRows()
        for (const tool of tools) {
          const current = this.providerState(tool.providerId)
          const policies = { ...current.policies }
          const wanted = selected[tool.classification]
          // Leave the inferred default implicit so the per-provider approval
          // switch keeps controlling tools the profile did not special-case.
          if (wanted === defaultPolicy(tool.classification, selected.approval)) delete policies[tool.rawName]
          else policies[tool.rawName] = wanted
          this.state.providers[tool.providerId] = {
            ...current,
            policies,
            requireApproval: selected.approval,
          }
        }
        await this.persistNow()
        return await this.snapshot()
      }
      case 'tool': {
        const name = String(body.name ?? '')
        return await this.toolDetail(name)
      }
      case 'invoke': {
        return await this.invoke(body)
      }
      case 'clearActivity': {
        this.state.activity = []
        await this.persistNow()
        return { ok: true }
      }
      default:
        throw new Error(`Unknown action "${String(action)}"`)
    }
  }

  /**
   * Connect or reconfigure one provider.
   * @param {Record<string, unknown>} body request body
   */
  async connect(body) {
    const id = String(body.id ?? '')
    const provider = this.findProvider(id)
    if (provider === undefined) throw new Error(`Unknown provider "${id}"`)
    const current = this.providerState(id)
    const url = String(body.url ?? current.url ?? provider.url).trim()
    if (!/^https?:\/\//i.test(url)) throw new Error('The MCP endpoint must be an http(s) URL')
    const token = typeof body.token === 'string' ? body.token.trim() : ''
    const authMode = body.mode === 'token' ? 'token' : provider.auth
    const storedOauth = authMode === 'oauth' && current.credentialRef !== undefined
      && await this.hasCredential(current.credentialRef)
    if (authMode === 'oauth' && token === '' && !storedOauth) {
      throw new Error('This provider uses browser authorization; start it from the connect dialog.')
    }
    if (authMode === 'local') {
      const next = {
        ...current,
        enabled: true,
        url,
        authMode: 'local',
        lastChecked: Date.now(),
        oauthError: undefined,
      }
      delete next.credentialRef
      this.state.providers[id] = next
      await this.persistNow()
      try {
        this.registerProvider(id, next)
        await this.waitForConnection(id)
        await this.waitForToolPolicy(id)
      } catch (error) {
        this.unregisterProvider(id)
        this.state.providers[id] = { ...next, enabled: false }
        await this.persistNow()
        throw error
      }
      return
    }

    let credentialRef = current.credentialRef
    if (token !== '') {
      const credentials = this.ctx.get('credentials')
      if (credentials === undefined) {
        throw new Error('The credential store is unavailable, so a token cannot be saved')
      }
      const ref = credentialRefFor(id)
      await credentials.set(ref, token)
      credentialRef = ref
      this.credentialCache.delete(ref)
    }
    if (credentialRef !== undefined && !(await this.hasCredential(credentialRef))) {
      credentialRef = undefined
    }
    if (credentialRef === undefined && provider.kind !== 'custom') {
      throw new Error(authMode === 'oauth'
        ? 'This provider uses browser authorization; start it from the connect dialog.'
        : `${provider.name} requires an access token.`)
    }
    const next = {
      ...current,
      enabled: true,
      url,
      authMode,
      requireApproval: current.requireApproval !== false,
      credentialRef,
      lastChecked: Date.now(),
      oauthError: undefined,
    }
    this.state.providers[id] = next
    await this.persistNow()
    try {
      this.registerProvider(id, next)
      await this.waitForConnection(id)
      await this.waitForToolPolicy(id)
    } catch (error) {
      this.unregisterProvider(id)
      this.state.providers[id] = { ...next, enabled: false }
      await this.persistNow()
      throw error
    }
  }

  /**
   * Add a custom endpoint and connect it.
   * @param {Record<string, unknown>} body request body
   */
  async addProvider(body) {
    const name = String(body.name ?? '').trim() || 'Custom MCP'
    const url = String(body.url ?? '').trim()
    if (!/^https?:\/\//i.test(url)) throw new Error('The MCP endpoint must be an http(s) URL')
    let index = 1
    while (this.state.custom.some(entry => entry.id === `custom-${index}`)) index += 1
    const id = `custom-${index}`
    this.state.custom.push({ id, name, description: 'Custom MCP server', url })
    try {
      await this.connect({ id, url, token: body.token })
    } catch (error) {
      this.state.custom = this.state.custom.filter(entry => entry.id !== id)
      delete this.state.providers[id]
      await this.persistNow()
      throw error
    }
    return await this.snapshot()
  }

  /** All tool rows with provider facts, used by profiles and snapshots. */
  async toolRows() {
    const snapshot = await this.snapshot()
    return { tools: /** @type {any[]} */ (snapshot.tools) }
  }

  /**
   * One tool's schema and current governance.
   * @param {string} name public tool name
   */
  async toolDetail(name) {
    const definition = this.ctx.tools.get(name)
    if (definition === undefined) throw new Error(`Unknown tool "${name}"`)
    const info = this.describeTool(name)
    if (info === undefined) throw new Error(`"${name}" is not an MCP tool`)
    const current = this.providerState(info.providerId)
    let parameters
    try {
      parameters = JSON.parse(JSON.stringify(definition.parameters ?? { type: 'object', properties: {} }))
    } catch {
      parameters = { type: 'object', properties: {} }
    }
    return {
      tool: {
        name,
        rawName: info.rawName,
        providerId: info.providerId,
        providerName: info.providerName,
        description: definition.description ?? '',
        classification: info.classification,
        enabled: this.toolEnabled(info.providerId, info.rawName),
        policy: this.policyFor(current, info.rawName, info.classification),
        tokens: estimateToolTokens(definition),
        parameters,
      },
    }
  }

  /**
   * Invoke one tool for the in-page tester.
   * @param {Record<string, unknown>} body request body
   */
  async invoke(body) {
    const name = String(body.name ?? '')
    const info = this.describeTool(name)
    if (info === undefined) throw new Error(`"${name}" is not an MCP tool`)
    const args = body.args !== null && typeof body.args === 'object' && !Array.isArray(body.args) ? body.args : {}
    const callId = randomUUID()
    const controller = new AbortController()
    const timer = setTimeout(() => { controller.abort() }, 65_000)
    const startedAt = Date.now()
    this.testCalls.add(callId)
    try {
      const batch = await this.ctx.tools.execute({
        calls: [{ type: 'tool-call', id: callId, name, arguments: JSON.stringify(args) }],
        signal: controller.signal,
      })
      const result = batch.results[0]?.result
      if (result === undefined) throw new Error('The tool produced no result')
      const text = contentText(result)
      return {
        ok: result.isError !== true,
        text,
        error: result.isError === true ? result.error?.message ?? 'Tool call failed' : null,
        durationMs: Date.now() - startedAt,
        startedAt,
      }
    } catch (error) {
      this.testCalls.delete(callId)
      throw error
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * Monotonic guard: disabled and blocked tools never reach the remote server.
   * Programmatic calls without an agent (including this page's tester) pass.
   * @param {{ name: string, agent?: unknown }} exec pending call
   */
  guard(exec) {
    const info = this.describeTool(exec.name)
    if (info === undefined) return undefined
    if (exec.agent === undefined) return undefined
    if (!this.toolEnabled(info.providerId, info.rawName)) {
      return { reason: `${info.toolName} is disabled in DSH DevTools. Enable it on the Tools page to let the agent use it.` }
    }
    const state = this.providerState(info.providerId)
    if (this.policyFor(state, info.rawName, info.classification) === 'block') {
      return { reason: `${info.toolName} is blocked by DSH DevTools permissions (${info.classification}). Change its policy on the Permissions page to allow it.` }
    }
    return undefined
  }

  /**
   * Ask the user before governed writes; record call start times for duration.
   * @param {any} exec pending call
   * @param {() => Promise<any>} next next waterfall step
   */
  beforeExecute(exec, next) {
    const info = this.describeTool(exec.name)
    if (info === undefined) return next()
    if (this.starts.size > 500) this.starts.clear()
    this.starts.set(exec.callId, Date.now())
    if (exec.agent === undefined) return next()
    const state = this.providerState(info.providerId)
    if (!this.toolEnabled(info.providerId, info.rawName)) {
      // The guard denies this call after the waterfall; no approval is useful.
      return next()
    }
    if (this.policyFor(state, info.rawName, info.classification) !== 'ask') return next()
    const reason = `${info.providerName}: ${info.rawName} (${info.classification})`
    return Promise.resolve({
      kind: 'ask',
      reason,
      displayReason: {
        en: `Allow ${info.providerName} to run “${info.rawName}”?`,
        zh: `允许 ${info.providerName} 执行“${info.rawName}”吗？`,
        'zh-cn': `允许 ${info.providerName} 执行“${info.rawName}”吗？`,
      },
    })
  }

  /**
   * Record one finished MCP call in the activity ring.
   * @param {any} exec finished call
   * @param {any} result final result
   */
  afterExecute(exec, result) {
    const started = this.starts.get(exec.callId)
    this.starts.delete(exec.callId)
    const info = this.describeTool(exec.name)
    if (info === undefined) return
    const source = this.testCalls.delete(exec.callId) ? 'test' : 'agent'
    if (source === 'agent') {
      const current = this.providerState(info.providerId)
      const counts = { ...current.toolUsage, [info.rawName]: (current.toolUsage?.[info.rawName] ?? 0) + 1 }
      this.state.providers[info.providerId] = { ...current, toolUsage: counts }
    }
    const durationMs = started === undefined ? 0 : Math.max(0, Date.now() - started)
    const text = contentText(result)
    const failed = result?.isError === true
    this.state.activity.unshift({
      id: randomUUID(),
      ts: Date.now(),
      providerId: info.providerId,
      providerName: info.providerName,
      toolName: info.toolName,
      rawName: info.rawName,
      classification: info.classification,
      status: failed ? 'error' : 'success',
      durationMs,
      summary: redactText((failed ? result?.error?.message ?? text : text) || `${info.rawName} completed`).slice(0, 220),
      ...(failed ? { error: redactText(result?.error?.message ?? 'Tool call failed').slice(0, 400) } : {}),
      args: boundedJson(exec.arguments, 900),
      source,
    })
    if (this.state.activity.length > ACTIVITY_LIMIT) this.state.activity.length = ACTIVITY_LIMIT
    this.scheduleSave()
  }

  /**
   * Handle one POST from the page.
   * @param {Request} request browser request
   */
  async handle(request) {
    try {
      await this.ready
      const body = await request.json().catch(() => ({}))
      if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        throw new Error('Expected a JSON object')
      }
      const action = typeof body.action === 'string' ? body.action : ''
      const data = await this.dispatch(action, body)
      return Response.json(data, { headers: { 'cache-control': 'no-store' } })
    } catch (error) {
      return Response.json(
        { ok: false, error: messageOf(error) },
        { status: 400, headers: { 'cache-control': 'no-store' } },
      )
    }
  }

  /** Release connections and flush pending state. */
  dispose() {
    this.disposed = true
    this.oauth.dispose()
    if (this.restrictTimer !== undefined) {
      clearTimeout(this.restrictTimer)
      this.restrictTimer = undefined
    }
    for (const entry of this.agents.values()) {
      try { entry.dispose?.() } catch { /* the agent context may already be gone */ }
    }
    this.agents.clear()
    for (const id of [...this.connections.keys()]) this.unregisterProvider(id)
    if (this.saveTimer !== undefined) {
      clearTimeout(this.saveTimer)
      this.saveTimer = undefined
      void this.persistNow()
    }
  }
}

/**
 * Mount the feature.
 * @param {import('@deepseek-ai/cordis').Context} ctx owning context
 */
export function apply(ctx) {
  new DevToolsHost(ctx)
}
