/**
 * Tool classification and capability extraction.
 *
 * MCP servers do not publish risk or capability metadata, so the plugin infers
 * both from each tool's name and description. The inference is deliberately
 * conservative: an operation that mentions a destructive verb is dangerous
 * even when it also reads, because the cost of over-asking is small and the
 * cost of a silent delete is not. Users can override every inferred result.
 */

/** Verbs that destroy or revoke state; these win over any read verb. */
const DANGEROUS = [
  'delete', 'destroy', 'remove', 'drop', 'purge', 'terminate', 'revoke', 'reset',
  'truncate', 'wipe', 'uninstall', 'deallocate',
]

/** Verbs that change remote state. */
const WRITE = [
  'create', 'update', 'edit', 'write', 'post', 'put', 'patch', 'add', 'insert',
  'set', 'merge', 'push', 'commit', 'upload', 'deploy', 'redeploy', 'run',
  'trigger', 'execute', 'start', 'stop', 'restart', 'assign', 'label', 'comment',
  'reply', 'move', 'rename', 'fork', 'transfer', 'invite', 'approve',
  'mark', 'enable', 'disable', 'open', 'reopen', 'sync', 'import', 'publish',
  'release', 'rollback', 'scale', 'resize', 'rebuild', 'provision', 'install',
]

/** Opening verbs that make an operation a read even when a noun looks like a verb. */
const READ_FIRST = [
  'get', 'list', 'search', 'read', 'fetch', 'describe', 'view', 'retrieve',
  'download', 'query', 'inspect', 'show', 'find', 'check', 'whoami', 'lookup',
]

/**
 * Split a tool name into lowercase words (`list_repos`, `listRepos`, `repos.list`).
 * @param {string} value raw tool name
 * @returns {string[]} lowercase words
 */
function words(value) {
  return String(value ?? '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map(word => word.toLowerCase())
}

/**
 * Classify one MCP tool.
 * @param {string} rawName tool name as published by the server
 * @param {string} [description] optional tool description
 * @returns {'read' | 'write' | 'dangerous'} inferred risk
 */
export function classifyTool(rawName, description = '') {
  const nameWords = words(rawName)
  const descriptionWords = words(description).slice(0, 24)
  const nameHit = (list) => nameWords.some(word => list.includes(word))
  const descriptionHit = (list) => descriptionWords.some(word => list.includes(word))
  if (nameHit(DANGEROUS)) return 'dangerous'
  // A destructive verb in the description still outranks a read verb in the name.
  if (descriptionHit(['delete', 'destroy', 'drop', 'purge', 'terminate', 'revoke'])
    && !nameWords.includes('get') && !nameWords.includes('list')) return 'dangerous'
  // `get_pull_request` and `list_workflow_runs` are reads even though a noun
  // (`request`, `runs`) also appears in the write verb list.
  if (READ_FIRST.includes(nameWords[0])) return 'read'
  if (nameHit(WRITE) || descriptionHit(WRITE)) return 'write'
  return 'read'
}

/** Capability groups inferred from tool names, most specific first. */
const CAPABILITIES = [
  [/pull|merge_request/, 'Pull requests'],
  [/issue/, 'Issues'],
  [/repo|repository/, 'Repositories'],
  [/action|workflow|pipeline|job/, 'Actions'],
  [/project/, 'Projects'],
  [/branch/, 'Branches'],
  [/commit/, 'Commits'],
  [/deploy|release/, 'Deployments'],
  [/droplet/, 'Droplets'],
  [/database|db/, 'Databases'],
  [/page|block/, 'Pages'],
  [/comment|discussion/, 'Comments'],
  [/team|member|collaborator/, 'Teams'],
  [/design|component|frame|node/, 'Design files'],
  [/document|doc/, 'Documents'],
  [/env|variable|secret/, 'Environments'],
  [/file|content|blob|tree/, 'Files'],
]

/**
 * Derive the capability labels shown on an integration's Overview.
 * @param {readonly { rawName: string, description?: string }[]} tools discovered tools
 * @returns {string[]} up to six unique labels
 */
export function capabilitiesFor(tools) {
  const found = new Set()
  for (const tool of tools) {
    const text = `${tool.rawName} ${tool.description ?? ''}`.toLowerCase()
    for (const [pattern, label] of CAPABILITIES) {
      if (pattern.test(text)) found.add(label)
    }
  }
  return [...found].slice(0, 6)
}

/**
 * The default permission for one inferred classification.
 * @param {'read' | 'write' | 'dangerous'} classification inferred risk
 * @param {boolean} requireApprovalForWrites whether write calls ask by default
 * @returns {'auto' | 'ask' | 'block'} policy
 */
export function defaultPolicy(classification, requireApprovalForWrites) {
  if (classification === 'dangerous') return 'block'
  if (classification === 'write') return requireApprovalForWrites ? 'ask' : 'auto'
  return 'auto'
}
