/**
 * Durable state for DSH DevTools.
 *
 * One JSON document holds provider choices, tool enablement, permission
 * overrides and a bounded activity ring. The host writes it to
 * `$DSH_HOME/devtools/state.json` atomically, so it survives restarts without
 * touching the user's Cordis patch. Secrets never enter this document: bearer
 * tokens live in the credential provider and only their reference is stored
 * here. Corrupt rows are dropped rather than failing the whole file, because
 * the file also carries disposable activity data.
 */
/** How often one inferred tool is enabled. */
export const TOOL_FLAGS = ['enabled', 'disabled']

/** What the runtime does before a governed tool call. */
export const POLICY_LEVELS = ['auto', 'ask', 'block']

/** Activity classifications. */
const CLASSIFICATIONS = ['read', 'write', 'dangerous']

/** Activity statuses. */
const STATUSES = ['success', 'error']

/** Provider ids accepted from stored state. */
const PROVIDER_ID = /^[A-Za-z0-9_-]{1,32}$/

/**
 * @param {unknown} value candidate
 * @returns {value is Record<string, unknown>} plain object
 */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Keep only known flag entries.
 * @param {unknown} value candidate record
 * @returns {Record<string, 'enabled' | 'disabled'>} validated flags
 */
function toolFlags(value) {
  /** @type {Record<string, 'enabled' | 'disabled'>} */
  const out = {}
  if (!isRecord(value)) return out
  for (const [key, flag] of Object.entries(value)) {
    if (flag === 'enabled' || flag === 'disabled') out[key] = flag
  }
  return out
}

/**
 * Keep only positive integer call counts.
 * @param {unknown} value candidate record
 * @returns {Record<string, number>} validated usage counts
 */
function usageMap(value) {
  /** @type {Record<string, number>} */
  const out = {}
  if (!isRecord(value)) return out
  for (const [key, count] of Object.entries(value)) {
    if (typeof count === 'number' && Number.isSafeInteger(count) && count > 0) out[key] = count
  }
  return out
}

/**
 * Keep only known policy entries.
 * @param {unknown} value candidate record
 * @returns {Record<string, 'auto' | 'ask' | 'block'>} validated policies
 */
function policyMap(value) {
  /** @type {Record<string, 'auto' | 'ask' | 'block'>} */
  const out = {}
  if (!isRecord(value)) return out
  for (const [key, policy] of Object.entries(value)) {
    if (policy === 'auto' || policy === 'ask' || policy === 'block') out[key] = policy
  }
  return out
}

/**
 * Validate one provider state.
 * @param {unknown} value candidate
 * @returns {Record<string, unknown> | undefined} normalized provider state
 */
function providerState(value) {
  if (!isRecord(value)) return undefined
  /** @type {Record<string, unknown>} */
  const out = { requireApproval: value.requireApproval !== false }
  if (typeof value.url === 'string' && value.url !== '') out.url = value.url
  if (typeof value.credentialRef === 'string' && value.credentialRef !== '') out.credentialRef = value.credentialRef
  if (typeof value.account === 'string' && value.account !== '') out.account = value.account
  if (value.authMode === 'oauth' || value.authMode === 'token' || value.authMode === 'local') out.authMode = value.authMode
  if (value.toolPolicy === 'all' || value.toolPolicy === 'recommended' || value.toolPolicy === 'custom' || value.toolPolicy === 'pending') out.toolPolicy = value.toolPolicy
  if (typeof value.toolPolicyAuto === 'boolean') out.toolPolicyAuto = value.toolPolicyAuto
  if (typeof value.oauthError === 'string' && value.oauthError !== '') out.oauthError = value.oauthError
  if (typeof value.enabled === 'boolean') out.enabled = value.enabled
  if (typeof value.lastChecked === 'number' && Number.isFinite(value.lastChecked)) out.lastChecked = value.lastChecked
  const flags = toolFlags(value.tools)
  if (Object.keys(flags).length > 0) out.tools = flags
  const policies = policyMap(value.policies)
  if (Object.keys(policies).length > 0) out.policies = policies
  const usage = usageMap(value.toolUsage)
  if (Object.keys(usage).length > 0) out.toolUsage = usage
  return out
}

/**
 * Validate one custom provider.
 * @param {unknown} value candidate
 * @returns {{ id: string, name: string, description?: string, url: string } | undefined} normalized entry
 */
function customProvider(value) {
  if (!isRecord(value)) return undefined
  const { id, name, url, description } = value
  if (typeof id !== 'string' || !PROVIDER_ID.test(id)) return undefined
  if (typeof name !== 'string' || name === '') return undefined
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return undefined
  return {
    id,
    name,
    url,
    ...(typeof description === 'string' && description !== '' ? { description } : {}),
  }
}

/**
 * Validate one activity record; malformed records are dropped.
 * @param {unknown} value candidate
 * @returns {object | undefined} normalized entry
 */
function activityEntry(value) {
  if (!isRecord(value)) return undefined
  const {
    id, ts, providerId, providerName, toolName, rawName,
    classification, status, durationMs, summary, error, args, source,
  } = value
  if (typeof id !== 'string' || typeof ts !== 'number' || !Number.isFinite(ts)) return undefined
  if (typeof providerId !== 'string' || !PROVIDER_ID.test(providerId)) return undefined
  if (typeof providerName !== 'string' || typeof toolName !== 'string' || typeof rawName !== 'string') return undefined
  if (!CLASSIFICATIONS.includes(classification)) return undefined
  if (!STATUSES.includes(status)) return undefined
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs)) return undefined
  if (typeof summary !== 'string') return undefined
  if (source !== 'agent' && source !== 'test') return undefined
  return {
    id,
    ts,
    providerId,
    providerName,
    toolName,
    rawName,
    classification,
    status,
    durationMs,
    summary,
    source,
    ...(typeof error === 'string' && error !== '' ? { error } : {}),
    ...(typeof args === 'string' && args !== '' ? { args } : {}),
  }
}

/**
 * Validate and normalize a stored document.
 * @param {unknown} raw stored value
 * @returns {{ version: 1, providers: Record<string, object>, custom: object[], activity: object[] }} normalized state
 */
function validateState(raw) {
  if (!isRecord(raw)) throw new TypeError('dsh-devtools state must be an object')
  /** @type {Record<string, object>} */
  const providers = {}
  if (isRecord(raw.providers)) {
    for (const [id, value] of Object.entries(raw.providers)) {
      if (!PROVIDER_ID.test(id)) continue
      const normalized = providerState(value)
      if (normalized !== undefined) providers[id] = normalized
    }
  }
  const custom = []
  if (Array.isArray(raw.custom)) {
    for (const value of raw.custom) {
      const normalized = customProvider(value)
      if (normalized !== undefined) custom.push(normalized)
    }
  }
  const activity = []
  if (Array.isArray(raw.activity)) {
    for (const value of raw.activity) {
      const normalized = activityEntry(value)
      if (normalized !== undefined) activity.push(normalized)
      if (activity.length >= 200) break
    }
  }
  return { version: 1, providers, custom, activity }
}

/** Duck-typed schema: the domain only needs `parse` and `safeParse`. */
const StateSchema = {
  parse: validateState,
  safeParse(value) {
    try {
      return { success: true, data: validateState(value) }
    } catch (error) {
      return { success: false, error }
    }
  },
}

/**
 * Create the state served before the first stored write.
 * @returns {{ version: 1, providers: Record<string, object>, custom: object[], activity: object[] }} empty state
 */
export function emptyState() {
  return { version: 1, providers: {}, custom: [], activity: [] }
}

/**
 * Accept whatever a backend returned and produce a complete state.
 * @param {unknown} raw stored value
 * @returns {ReturnType<typeof emptyState>} normalized state
 */
export function normalizeState(raw) {
  const parsed = StateSchema.safeParse(raw)
  if (!parsed.success) return emptyState()
  return parsed.data
}

/**
 * Replace likely credentials in a free-form string.
 * @param {string} text input text
 * @returns {string} redacted text
 */
export function redactText(text) {
  return String(text ?? '')
    .replace(/(gh[pousr]_[A-Za-z0-9]{10,})/g, '[redacted]')
    .replace(/(github_pat_[A-Za-z0-9_]{10,})/g, '[redacted]')
    .replace(/(sk-[A-Za-z0-9_-]{12,})/g, '[redacted]')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, '$1[redacted]')
    .replace(/((?:access|refresh)_token=|api[_-]?key=|token=)[^&\s"']+/gi, '$1[redacted]')
    .replace(/("(?:token|secret|password|api[_-]?key|authorization)"\s*:\s*")[^"]*(")/gi, '$1[redacted]$2')
}

/** Keys whose values are sensitive in recorded arguments. */
const SENSITIVE_KEY = /token|secret|password|passwd|authorization|api[-_]?key|credential|cookie/i

/**
 * Deep-copy a JSON value while redacting sensitive keys and credential-shaped text.
 * @param {unknown} value input value
 * @param {number} [depth] recursion guard
 * @returns {unknown} redacted clone
 */
export function redactValue(value, depth = 0) {
  if (depth > 6) return '[truncated]'
  if (typeof value === 'string') return redactText(value)
  if (Array.isArray(value)) return value.slice(0, 40).map(item => redactValue(item, depth + 1))
  if (value !== null && typeof value === 'object') {
    /** @type {Record<string, unknown>} */
    const out = {}
    for (const [key, item] of Object.entries(value)) {
      out[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : redactValue(item, depth + 1)
    }
    return out
  }
  return value
}

/**
 * Serialize a value for display and storage, bounded in size.
 * @param {unknown} value input value
 * @param {number} [limit] maximum characters
 * @returns {string} compact JSON or the value's string form
 */
export function boundedJson(value, limit = 1200) {
  let text
  try {
    text = JSON.stringify(redactValue(value))
  } catch {
    text = String(value)
  }
  if (text === undefined) text = String(value)
  return text.length > limit ? `${text.slice(0, limit)}…` : text
}
