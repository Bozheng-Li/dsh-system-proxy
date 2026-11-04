import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createOverlayEnvironment,
  mergeBypass,
  normalizeConfig,
  parseWindowsProxyServer,
  resolveProxyConfig,
} from '../lib/system-proxy.js'
import { prepareInstall, redactProxy, DEFAULT_CONFIG } from '../lib/index.js'

function baseEnvironment(values = {}) {
  const normalized = new Map(
    Object.entries(values).map(([key, value]) => [key.toUpperCase(), value]),
  )
  return {
    get(name) {
      const value = normalized.get(name.toUpperCase())
      return value === undefined ? undefined : { value }
    },
  }
}

function context(values = {}) {
  return {
    get(name) {
      if (name === 'launchEnvironment') return baseEnvironment(values)
      return undefined
    },
  }
}

test('normalizes defaults and rejects invalid configuration', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG)
  assert.throws(() => normalizeConfig({ mode: 'automatic' }), /mode must be/)
  assert.throws(() => normalizeConfig({ proxyUrl: 7897 }), /proxyUrl must be a string/)
  assert.throws(() => normalizeConfig({ useWindowsBypass: 'yes' }), /useWindowsBypass must be a boolean/)
})

test('parses a single proxy as both schemes', () => {
  assert.deepEqual(parseWindowsProxyServer('127.0.0.1:7897'), {
    http: 'http://127.0.0.1:7897',
    https: 'http://127.0.0.1:7897',
  })
})

test('preserves distinct HTTP and HTTPS Windows proxies', () => {
  assert.deepEqual(
    parseWindowsProxyServer('http=127.0.0.1:7897;https=127.0.0.1:7898'),
    {
      http: 'http://127.0.0.1:7897',
      https: 'http://127.0.0.1:7898',
    },
  )
})

test('translates compatible Windows bypass forms without pretending CIDR works', () => {
  const value = mergeBypass(
    'api.internal,localhost',
    'localhost;127.*;*.corp.example;<local>;10.0.0.0/8;sub.example',
  )
  assert.equal(
    value,
    'api.internal,localhost,*.corp.example,sub.example,127.*,[::1],::1',
  )
})

test('explicit process HTTPS_PROXY outranks a detected system proxy', () => {
  const environment = createOverlayEnvironment(
    baseEnvironment({ no_proxy: 'internal.example', https_proxy: 'http://from-launch:1' }),
    { HTTPS_PROXY: 'http://explicit:2' },
    { http: 'http://system:3', https: 'http://system:3', bypass: '*.example' },
  )
  assert.equal(environment.get('http_proxy')?.value, 'http://system:3')
  assert.equal(environment.get('https_proxy')?.value, 'http://explicit:2')
  assert.equal(environment.get('HTTPS_PROXY')?.value, 'http://explicit:2')
  assert.match(environment.get('no_proxy')?.value, /internal\.example/)
  assert.match(environment.get('no_proxy')?.value, /\*\.example/)
})

test('auto mode follows enabled Windows settings', () => {
  const system = {
    state: 'enabled',
    url: 'http://127.0.0.1:7897',
    http: 'http://127.0.0.1:7897',
    https: 'http://127.0.0.1:7897',
    bypass: 'localhost',
  }
  assert.equal(resolveProxyConfig(DEFAULT_CONFIG, system), system)
})

test('manual mode normalizes host:port and off does not enable a stale proxy', () => {
  const system = { state: 'disabled', bypass: 'localhost' }
  assert.deepEqual(
    resolveProxyConfig({ mode: 'manual', proxyUrl: '127.0.0.1:10809', useWindowsBypass: false }, system),
    {
      state: 'enabled',
      url: 'http://127.0.0.1:10809',
      http: 'http://127.0.0.1:10809',
      https: 'http://127.0.0.1:10809',
      bypass: '',
    },
  )
  assert.equal(
    resolveProxyConfig({ mode: 'off', proxyUrl: '', useWindowsBypass: true }, system).state,
    'disabled',
  )
})

test('disabled system proxy leaves the launcher baseline untouched', async () => {
  const calls = []
  const task = await prepareInstall(
    context({ http_proxy: 'http://launch:1' }),
    DEFAULT_CONFIG,
    {
      detect: async () => ({ state: 'disabled' }),
      install: async () => {
        calls.push('install')
        return () => Promise.resolve()
      },
    },
  )
  assert.equal(calls.length, 0)
  assert.equal(typeof task.dispose, 'function')
})

test('enabled detection overlays Windows values and ignores explicit .env proxy', async () => {
  const calls = []
  const task = await prepareInstall(
    context({ https_proxy: 'http://from-dotenv:1' }),
    DEFAULT_CONFIG,
    {
      detect: async () => ({
        state: 'enabled',
        http: 'http://127.0.0.1:7897',
        https: 'http://127.0.0.1:7897',
        bypass: 'localhost',
      }),
      launchEnvironmentOf: (value) => value,
      environment: {},
      install: async (environment) => {
        calls.push(environment)
        return () => Promise.resolve()
      },
    },
  )
  assert.equal(calls[0].get('http_proxy')?.value, 'http://127.0.0.1:7897')
  assert.equal(calls[0].get('https_proxy')?.value, 'http://127.0.0.1:7897')
  assert.equal(typeof task.dispose, 'function')
})

test('manual mode installs its URL and redacts credentials in diagnostics', async () => {
  const seen = []
  await prepareInstall(
    context(),
    { mode: 'manual', proxyUrl: 'http://user:secret@127.0.0.1:7897', useWindowsBypass: false },
    {
      detect: async () => ({ state: 'disabled' }),
      launchEnvironmentOf: () => baseEnvironment(),
      environment: {},
      install: async (environment) => {
        seen.push(environment.get('https_proxy')?.value)
        return () => Promise.resolve()
      },
      report: () => {},
    },
  )
  assert.equal(seen[0], 'http://user:secret@127.0.0.1:7897')
  assert.doesNotMatch(redactProxy('http://user:secret@127.0.0.1:7897'), /user|secret/)
})
