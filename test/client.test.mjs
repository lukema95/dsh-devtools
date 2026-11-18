/**
 * Client-side registration smoke test: evaluate the browser bundle with a stub
 * module loader and React, then run apply() against a stub client context.
 * Run: node test/client.test.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

let registration
const sandbox = {
  window: {
    __ModuleLoader__: {
      load(config) { registration = config },
    },
  },
  console,
  document: { addEventListener() {}, removeEventListener() {}, visibilityState: 'visible' },
  navigator: {},
  fetch: async () => { throw new Error('network disabled in test') },
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
}
sandbox.globalThis = sandbox
vm.runInNewContext(readFileSync(new URL('../client.js', import.meta.url), 'utf8'), sandbox, { filename: 'client.js' })

assert.equal(registration.id, '@lukema/dsh-devtools')
assert.equal(typeof registration.factory, 'function')

const React = {
  Component: class {
    constructor(props) { this.props = props; this.state = {} }
    setState() {}
  },
  createElement: () => null,
  useState: () => [undefined, () => {}],
  useEffect: () => {},
  useMemo: () => undefined,
  useRef: () => ({ current: null }),
  useCallback: fn => fn,
}
const plugin = registration.factory((specifier) => {
  if (specifier === 'react') return React
  throw new Error(`unexpected external ${specifier}`)
})
assert.equal(typeof plugin.apply, 'function')
assert.deepEqual([...plugin.inject], ['slots', 'locale'])

let dictionaries
let boundNamespace
const registrations = []
const ctx = {
  effect(fn) {
    const cleanup = fn()
    return typeof cleanup === 'function' ? cleanup : () => {}
  },
  locale: {
    register(namespace, value) {
      dictionaries = { namespace, value }
      return () => {}
    },
    bind(namespace) {
      boundNamespace = namespace
      return key => key
    },
  },
  slots: {
    inject(name, callback) {
      callback()
      return () => {}
    },
    register(options) {
      registrations.push(options)
      return () => {}
    },
  },
}
plugin.apply(ctx)

assert.equal(dictionaries.namespace, 'dshDevtools')
assert.ok(Object.keys(dictionaries.value.en).length > 100)
assert.equal(Object.keys(dictionaries.value.en).length, Object.keys(dictionaries.value.zh).length)
assert.equal(boundNamespace, 'dshDevtools')

const main = registrations.find(entry => entry.name === 'main')
assert.ok(main, 'main panel registration')
assert.equal(main.key, 'dsh-devtools')
assert.equal(main.locale, 'dshDevtools')

const sidebar = registrations.find(entry => entry.name === 'sidebar.panellist')
assert.ok(sidebar, 'sidebar registration')
assert.equal(sidebar.id, 'dsh-devtools')
assert.equal(typeof sidebar.label, 'function')
assert.equal(sidebar.label(), 'panel.title')

console.log('client registration test: all assertions passed')
