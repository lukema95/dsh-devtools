/**
 * Minimal streamable-HTTP MCP server used by the DevTools end-to-end check.
 * It answers initialize/list/call with JSON, which the MCP SDK accepts.
 */
import http from 'node:http'

const tools = [
  {
    name: 'list_repositories',
    description: 'List repositories for the authenticated user.',
    inputSchema: {
      type: 'object',
      properties: { owner: { type: 'string', description: 'Repository owner' } },
      required: ['owner'],
    },
  },
  {
    name: 'create_issue',
    description: 'Create a new issue in a repository.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        title: { type: 'string' },
      },
      required: ['owner', 'repo', 'title'],
    },
  },
  {
    name: 'delete_repository',
    description: 'Delete a repository permanently.',
    inputSchema: {
      type: 'object',
      properties: { owner: { type: 'string' }, repo: { type: 'string' } },
      required: ['owner', 'repo'],
    },
  },
]

const extra = Number(process.env.MOCK_MCP_TOOL_COUNT ?? 0)
if (Number.isFinite(extra) && extra > 0) {
  for (let index = 0; index < extra; index += 1) {
    tools.push({
      name: `list_generated_${index}`,
      description: `List generated item ${index}.`,
      inputSchema: { type: 'object', properties: { page: { type: 'number' } } },
    })
  }
}

const server = http.createServer(async (request, response) => {
  if (request.method === 'GET') {
    response.writeHead(405, { allow: 'POST, DELETE' })
    response.end()
    return
  }
  if (request.method === 'DELETE') {
    response.writeHead(204)
    response.end()
    return
  }
  if (request.method !== 'POST') {
    response.writeHead(405)
    response.end()
    return
  }
  let body = ''
  for await (const chunk of request) body += chunk
  let message
  try {
    message = JSON.parse(body)
  } catch {
    response.writeHead(400)
    response.end()
    return
  }
  const send = (payload) => {
    response.writeHead(200, {
      'content-type': 'application/json',
      'mcp-session-id': 'mock-session',
    })
    response.end(JSON.stringify(payload))
  }
  const result = (value) => send({ jsonrpc: '2.0', id: message.id, result: value })

  switch (message.method) {
    case 'initialize':
      return result({
        protocolVersion: message.params?.protocolVersion ?? '2025-06-18',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'mock-devtools', version: '1.0.0' },
      })
    case 'notifications/initialized':
      response.writeHead(202)
      response.end()
      return
    case 'ping':
      return result({})
    case 'tools/list':
      return result({ tools })
    case 'tools/call': {
      const name = message.params?.name
      return result({
        content: [{ type: 'text', text: `${name} ok: ${JSON.stringify(message.params?.arguments ?? {})}` }],
        isError: false,
      })
    }
    default:
      if (message.id === undefined) {
        response.writeHead(202)
        response.end()
        return
      }
      return send({
        jsonrpc: '2.0',
        id: message.id,
        error: { code: -32601, message: `Method not found: ${String(message.method)}` },
      })
  }
})

const port = Number(process.env.MOCK_MCP_PORT ?? 59001)
server.listen(port, '127.0.0.1', () => {
  console.log(`mock mcp listening on http://127.0.0.1:${port}/mcp`)
})
