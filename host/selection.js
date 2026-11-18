/**
 * Default tool selection for large MCP servers.
 *
 * A server such as Vercel publishes 200+ tools. Exposing every schema on every
 * request costs more than the task itself, so a provider whose catalog is
 * larger than `AUTO_ALL_LIMIT` starts with a small read-only recommended set.
 * The user can still enable any tool explicitly from the Tools tab.
 */

/** Providers at or below this size keep the historical "all enabled" default. */
export const AUTO_ALL_LIMIT = 30

/** How many read-only tools a large provider gets before any usage exists. */
export const RECOMMENDED_LIMIT = 20

/** A tool must be called at least this often to count as frequently used. */
export const FREQUENT_USAGE_THRESHOLD = 3

/** Safety ceiling for a usage-derived recommended set, in approximate tokens. */
export const RECOMMENDED_TOKEN_BUDGET = 16_000

/** How many common read tools supplement the frequently used set. */
const BASELINE_READS = 5

/** Resource words that make a read tool useful in ordinary sessions. */
const PRIORITY = [
  ['project', 100],
  ['deployment', 96],
  ['runtime', 92],
  ['error', 90],
  ['log', 86],
  ['domain', 82],
  ['environment', 78],
  ['env', 78],
  ['team', 74],
  ['user', 70],
  ['billing', 66],
  ['usage', 64],
  ['alias', 60],
  ['certificate', 56],
  ['dns', 54],
  ['firewall', 50],
  ['integration', 46],
  ['webhook', 42],
  ['database', 38],
  ['app', 34],
]

/** Words that usually mean a niche or expensive read. */
const NOISY = ['raw', 'debug', 'test', 'preview', 'metadata', 'schema', 'history', 'export']

/**
 * Approximate the prompt tokens a tool definition adds to every request.
 * The exact serializer is internal to DSH; this is a sizing hint for the UI.
 * @param {{ description?: string, parameters?: unknown }} definition tool definition
 * @returns {number} estimated tokens
 */
export function estimateToolTokens(definition) {
  let schema = ''
  try {
    schema = JSON.stringify(definition.parameters ?? {})
  } catch {
    schema = ''
  }
  const text = `${definition.description ?? ''}${schema}`
  return Math.max(20, Math.ceil(text.length / 4))
}

/**
 * Build the recommended set for a large provider.
 *
 * With no call history this is the cold-start read-first set. Once the user
 * has used tools, frequently called tools (including writes) become the base,
 * a few common reads cover new tasks, and low-frequency tools stay hidden.
 * There is no fixed count for the usage-derived set; a token ceiling is only a
 * safety guard against an unexpectedly huge catalog.
 * @param {readonly { rawName: string, classification: 'read' | 'write' | 'dangerous', description?: string, tokens?: number }[]} tools all discovered tools
 * @param {Record<string, number>} [usage] raw tool name → call count
 * @param {number} [coldLimit] cold-start maximum tools
 * @returns {string[]} raw names to enable
 */
export function recommendTools(tools, usage = {}, coldLimit = RECOMMENDED_LIMIT) {
  const score = (tool) => {
    const name = tool.rawName.toLowerCase()
    const description = (tool.description ?? '').toLowerCase()
    let value = tool.classification === 'read' ? 20 : 0
    for (const [word, points] of PRIORITY) {
      if (name.includes(word)) value += points
      else if (description.includes(word)) value += Math.round(points / 4)
    }
    if (name.startsWith('list_')) value += 8
    else if (name.startsWith('get_')) value += 6
    else if (name.startsWith('search_')) value += 4
    for (const word of NOISY) if (name.includes(word)) value -= 15
    value -= Math.min(12, Math.floor(name.length / 8))
    return value
  }
  const reads = tools.filter(tool => tool.classification === 'read')
  const counts = usage !== null && typeof usage === 'object' ? usage : {}
  const frequent = tools
    .filter(tool => tool.classification !== 'dangerous' && (counts[tool.rawName] ?? 0) >= FREQUENT_USAGE_THRESHOLD)
    .sort((left, right) => (counts[right.rawName] ?? 0) - (counts[left.rawName] ?? 0)
      || score(right) - score(left)
      || left.rawName.localeCompare(right.rawName))
  // Without meaningful usage history, keep the cold-start read-only set.
  if (frequent.length === 0) {
    return reads
      .map(tool => ({ tool, score: score(tool) }))
      .sort((left, right) => right.score - left.score || left.tool.rawName.localeCompare(right.tool.rawName))
      .slice(0, coldLimit)
      .map(entry => entry.tool.rawName)
  }
  const baseline = reads
    .filter(tool => !frequent.some(hit => hit.rawName === tool.rawName))
    .map(tool => ({ tool, score: score(tool) }))
    .sort((left, right) => right.score - left.score || left.tool.rawName.localeCompare(right.tool.rawName))
    .slice(0, BASELINE_READS)
    .map(entry => entry.tool)
  const ordered = [...frequent, ...baseline]
  const selected = []
  let tokens = 0
  for (const tool of ordered) {
    const cost = Math.max(0, Number(tool.tokens) || 0)
    if (selected.length > 0 && tokens + cost > RECOMMENDED_TOKEN_BUDGET) break
    selected.push(tool.rawName)
    tokens += cost
  }
  return selected
}
