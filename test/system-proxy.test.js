import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createOverlayEnvironment,
  mergeBypass,
  normalizeConfig,
  parseWindowsProxyServer,
  resolveProxyConfig,
} from '../lib/system-proxy.js'
import { redactProxy, DEFAULT_CONFIG } from '../lib/index.js'
import { windowsBypassTokens } from '../lib/proxy-policy.js'

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
  assert.equal(
    windowsBypassTokens('localhost;127.*;*.corp.example;<local>;10.*;192.168.*;172.16.*;sub.example'),
    'localhost,127.0.0.0/8,corp.example,10.0.0.0/8,192.168.0.0/16,172.16.0.0/16,sub.example',
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

test('redacts credentials in diagnostics', () => {
  assert.doesNotMatch(redactProxy('http://user:secret@127.0.0.1:7897'), /user|secret/)
})
