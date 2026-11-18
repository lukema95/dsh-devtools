/** Default tool selection keeps large catalogs from flooding every request. */
import assert from 'node:assert/strict'
import { AUTO_ALL_LIMIT, RECOMMENDED_LIMIT, estimateToolTokens, recommendTools } from '../host/selection.js'

const make = (name, classification = 'read', description = '') => ({
  rawName: name,
  classification,
  description,
})

const tools = [
  make('list_projects', 'read', 'List projects'),
  make('get_project', 'read', 'Get a project'),
  make('list_deployments', 'read', 'List deployments'),
  make('get_runtime_errors', 'read', 'Runtime errors'),
  make('get_runtime_logs', 'read', 'Runtime logs'),
  make('delete_project', 'dangerous', 'Delete a project'),
  make('update_project', 'write', 'Update a project'),
  make('get_debug_metadata_raw', 'read', 'Debug metadata'),
  ...Array.from({ length: 60 }, (_, index) => make(`list_item_${index}`, 'read', 'List an item')),
]

const recommended = recommendTools(tools, RECOMMENDED_LIMIT)
assert.equal(recommended.length, RECOMMENDED_LIMIT)
assert.equal(new Set(recommended).size, recommended.length)
assert.ok(recommended.includes('list_projects'))
assert.ok(recommended.includes('list_deployments'))
assert.ok(recommended.includes('get_runtime_logs'))
assert.ok(!recommended.includes('delete_project'))
assert.ok(!recommended.includes('update_project'))
assert.ok(!recommended.includes('get_debug_metadata_raw'))
assert.equal(AUTO_ALL_LIMIT, 30)
assert.ok(estimateToolTokens({ description: 'x', parameters: { type: 'object', properties: { q: { type: 'string' } } } }) > 0)

// Usage-based selection keeps frequently used tools (including writes), drops
// dangerous and unused ones, and adds a small read baseline instead of a count.
const used = recommendTools(tools, {
  list_projects: 5,
  update_project: 4,
  list_deployments: 3,
  get_runtime_logs: 3,
  delete_project: 20,
  get_project: 1,
})
assert.ok(used.includes('list_projects'))
assert.ok(used.includes('update_project'))
assert.ok(used.includes('list_deployments'))
assert.ok(used.includes('get_runtime_logs'))
assert.ok(!used.includes('delete_project'))
assert.ok(used.length < tools.length)

console.log('tool selection test: all assertions passed')
