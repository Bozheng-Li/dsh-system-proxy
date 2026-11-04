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
  return async () => {
    setGlobalDispatcher(previous)
    await dispatcher.close()
  }
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
