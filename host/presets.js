/**
 * Provider presets shown on the Integrations page.
 *
 * Each preset names one remote or local streamable-HTTP MCP endpoint and the
 * authentication route the plugin uses:
 *
 * - `oauth` — authorization code + PKCE through the provider's own browser
 *   consent page, with dynamic client registration where offered.
 * - `token` — a personal access token or API token stored in DSH credentials.
 * - `local` — a loopback MCP server started by a desktop application.
 *
 * The URL is only a default: a user can override it for any provider, and
 * custom servers are added with their own endpoint.
 */

/**
 * @typedef {{
 *   name: string,
 *   prefix: string,
 *   label: string,
 *   docs?: string,
 *   scopes?: readonly string[],
 * }} TokenHeader
 */

/**
 * @typedef {{
 *   scopes?: readonly string[],
 *   prompt?: string,
 * }} OAuthOptions
 */

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   description: string,
 *   url: string,
 *   site: string,
 *   auth: 'oauth' | 'token' | 'local',
 *   oauth?: OAuthOptions,
 *   token?: TokenHeader,
 *   tokenFallback?: boolean,
 *   local?: { instructions?: string },
 * }} ProviderPreset
 */

/** @type {readonly ProviderPreset[]} */
export const BUILTIN_PROVIDERS = Object.freeze([
  {
    id: 'github',
    name: 'GitHub',
    description: 'Repositories, pull requests, issues and more.',
    url: 'https://api.githubcopilot.com/mcp',
    site: 'https://github.com',
    auth: 'token',
    largeCatalog: true,
    token: {
      name: 'Authorization',
      prefix: 'Bearer ',
      label: 'Personal access token',
      docs: 'https://github.com/settings/tokens',
      scopes: ['repo', 'read:org', 'read:user', 'user:email', 'read:packages', 'write:packages', 'read:project', 'project', 'gist', 'notifications'],
    },
  },
  {
    id: 'figma',
    name: 'Figma',
    description: 'Design files, components and context.',
    url: 'https://mcp.figma.com/mcp',
    site: 'https://figma.com',
    auth: 'oauth',
    oauth: {
      scopes: ['mcp:connect'],
      // Figma currently rejects dynamic registration unless the client is in
      // its catalog. This temporary identity keeps the official remote server
      // usable until Figma admits DSH directly.
      clientName: 'Claude Code',
      tokenEndpointAuthMethod: 'client_secret_post',
      omitResource: true,
    },
    largeCatalog: true,
  },
  {
    id: 'vercel',
    name: 'Vercel',
    description: 'Projects, deployments and logs.',
    url: 'https://mcp.vercel.com',
    site: 'https://vercel.com',
    auth: 'oauth',
    oauth: { scopes: ['openid', 'offline_access'] },
    largeCatalog: true,
    tokenFallback: true,
    token: {
      name: 'Authorization',
      prefix: 'Bearer ',
      label: 'Vercel access token',
      docs: 'https://vercel.com/account/tokens',
    },
  },
  {
    id: 'digitalocean',
    name: 'DigitalOcean',
    description: 'Droplets, databases and infrastructure.',
    url: 'https://mcp.digitalocean.com/mcp',
    site: 'https://digitalocean.com',
    auth: 'oauth',
    oauth: {},
    tokenFallback: true,
    token: {
      name: 'Authorization',
      prefix: 'Bearer ',
      label: 'DigitalOcean API token',
      docs: 'https://cloud.digitalocean.com/account/api/tokens',
    },
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Pages, databases and knowledge base.',
    url: 'https://mcp.notion.com/mcp',
    site: 'https://notion.so',
    auth: 'oauth',
    oauth: { scopes: ['default'], prompt: 'consent' },
    largeCatalog: true,
  },
  {
    id: 'linear',
    name: 'Linear',
    description: 'Issues, projects and cycles.',
    url: 'https://mcp.linear.app/mcp',
    site: 'https://linear.app',
    auth: 'oauth',
    oauth: { scopes: ['read', 'write'] },
    largeCatalog: true,
    tokenFallback: true,
    token: {
      name: 'Authorization',
      prefix: 'Bearer ',
      label: 'Linear API key',
      docs: 'https://linear.app/settings/api',
    },
  },
])

/** @type {ReadonlyMap<string, ProviderPreset>} */
const BUILTIN_BY_ID = new Map(BUILTIN_PROVIDERS.map(provider => [provider.id, provider]))

/**
 * Resolve one built-in provider preset.
 * @param {string} id provider id
 * @returns {ProviderPreset | undefined} the preset
 */
export function builtinProvider(id) {
  return BUILTIN_BY_ID.get(id)
}

/**
 * Credential reference that holds one provider's access token.
 * @param {string} id provider id
 * @returns {string} an environment-style credential ref
 */
export function credentialRefFor(id) {
  return `DSH_DEVTOOLS_${id.replace(/[^A-Za-z0-9]+/g, '_').toUpperCase()}`
}

/**
 * Header that carries one provider's token to its MCP server.
 * @param {ProviderPreset} provider provider preset
 * @returns {TokenHeader} header name, prefix, and label
 */
export function tokenHeaderFor(provider) {
  return provider.token ?? {
    name: 'Authorization',
    prefix: 'Bearer ',
    label: 'Access token',
  }
}
