import {
  Agent,
  ProxyAgent,
  getGlobalDispatcher,
  setGlobalDispatcher,
} from 'undici'

/**
 * Install a process-wide dispatcher that sends proxied URLs through an HTTP
 * proxy and leaves bypassed URLs on a direct agent. Disposal restores the
 * exact dispatcher that was active before this plugin mounted.
 *
 * @param {{ proxyUrl: string, http?: string, https?: string, bypass?: string }} policy
 * @returns {Promise<() => Promise<void>>}
 */
export async function installGlobalProxy(policy) {
  const direct = new Agent()
  const httpProxy = policy.http ?? policy.proxyUrl
  const httpsProxy = policy.https ?? policy.proxyUrl
  const httpAgent = httpProxy ? new ProxyAgent({ uri: httpProxy }) : direct
  const httpsAgent = httpsProxy ? new ProxyAgent({ uri: httpsProxy }) : direct
  const bypass = parseBypass(policy.bypass)
  const previous = getGlobalDispatcher()

  const dispatcher = {
    dispatch(options, handler) {
      const origin = options.origin instanceof URL ? options.origin : new URL(options.origin)
      const agent = shouldBypass(origin, bypass)
        ? direct
        : origin.protocol === 'https:'
          ? httpsAgent
          : httpAgent
      return agent.dispatch(options, handler)
    },
  }
  // Avoid double-closing the direct agent when no proxy is configured.
  dispatcher.close = async () => {
    const closers = new Set([direct, httpAgent, httpsAgent])
    await Promise.allSettled([...closers].map((agent) => agent.close()))
  }
  dispatcher.destroy = async () => {
    const closers = new Set([direct, httpAgent, httpsAgent])
    await Promise.allSettled([...closers].map((agent) => agent.destroy()))
  }

  setGlobalDispatcher(dispatcher)
  const restoreEnv = publishProxyEnv(policy, bypass)
  return async () => {
    setGlobalDispatcher(previous)
    restoreEnv()
    await dispatcher.close()
  }
}

/**
 * Publish the active proxy to child processes. DSH spawns pnpm, git and MCP
 * servers with an environment copied from this process, so a dispatcher alone
 * does not cover plugin installation or other managed subprocesses.
 *
 * @param {{ proxyUrl: string, http?: string, https?: string }} policy
 * @param {string[]} bypass
 * @returns {() => void}
 */
function publishProxyEnv(policy, bypass) {
  const values = {
    HTTP_PROXY: policy.http ?? policy.proxyUrl,
    HTTPS_PROXY: policy.https ?? policy.proxyUrl,
    NO_PROXY: mergeLoopback(bypass).join(','),
    NODE_USE_ENV_PROXY: '1',
  }
  const names = [
    ...Object.keys(values),
    ...Object.keys(values).map((name) => name.toLowerCase()),
  ]
  const previous = new Map(names.map((name) => [name, process.env[name]]))
  for (const [name, value] of Object.entries(values)) {
    process.env[name] = value
    process.env[name.toLowerCase()] = value
  }
  return () => {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
}

function mergeLoopback(bypass) {
  return [...new Set([...bypass, 'localhost', '127.0.0.1', '[::1]', '::1'])]
}

/**
 * Translate a Windows bypass list into the token format used by
 * `installGlobalProxy`.
 *
 * @param {string | undefined} bypass
 * @returns {string}
 */
export function windowsBypassTokens(bypass) {
  const entries = String(bypass ?? '')
    .split(';')
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => value !== '<local>')
    .map((value) => {
      if (value === '127.*') return '127.0.0.0/8'
      if (value.startsWith('*.')) return value.slice(2)
      return value
    })
    .filter((value) => value === '*' || /^[A-Za-z0-9](?:[A-Za-z0-9.:/-]*[A-Za-z0-9])?$/.test(value))
  return entries.join(',')
}

function parseBypass(value) {
  return String(value ?? '')
    .split(/[,\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function shouldBypass(origin, bypass) {
  if (!origin) return false
  const hostname = origin.hostname.toLowerCase()
  const port = origin.port || (origin.protocol === 'https:' ? '443' : '80')
  for (const raw of bypass) {
    const [entryHost, entryPort] = splitBypass(raw)
    if (entryPort && entryPort !== port) continue
    if (entryHost === '*') return true
    if (entryHost.startsWith('.')) {
      const suffix = entryHost.slice(1)
      if (hostname === suffix || hostname.endsWith(`.${suffix}`)) return true
    } else if (entryHost.includes('/')) {
      if (matchesCidr(hostname, entryHost)) return true
    } else if (hostname === entryHost || hostname.endsWith(`.${entryHost}`)) {
      return true
    }
  }
  return false
}

function splitBypass(entry) {
  const ipv6 = /^\[([^\]]+)\](?::(\d+))?$/.exec(entry)
  if (ipv6) return [ipv6[1].toLowerCase(), ipv6[2]]
  const match = /^(.+):(\d+)$/.exec(entry)
  if (match && !match[1].includes(':')) return [match[1].toLowerCase(), match[2]]
  return [entry.toLowerCase(), undefined]
}

function matchesCidr(hostname, cidr) {
  const [network, bitsRaw] = cidr.split('/')
  const bits = Number(bitsRaw)
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false
  const toNumber = (value) => {
    const parts = value.split('.').map(Number)
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return undefined
    return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0
  }
  const host = toNumber(hostname)
  const base = toNumber(network)
  if (host === undefined || base === undefined) return false
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
  return (host & mask) === (base & mask)
}
