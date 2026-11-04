import { execFile } from 'node:child_process'

/** Proxy variables that the DSH launcher treats as explicit user policy. */
export const EXPLICIT_PROXY_NAMES = Object.freeze([
  'HTTP_PROXY',
  'HTTPS_PROXY',
])

const LOOPBACK_ENTRIES = ['localhost', '127.*', '[::1]', '::1']

/**
 * Construct a launch environment snapshot with an overlay over the process layer.
 * Explicit process variables win over both Windows settings and `.env` values.
 * @param {{ get(name: string): { value: string } | undefined }} base
 * @param {Record<string, string | undefined>} processEnv
 * @param {{ http?: string, https?: string, bypass?: string }} system
 */
export function createOverlayEnvironment(base, processEnv, system) {
  const overlay = new Map()
  const explicit = new Map()
  for (const key of Object.keys(processEnv)) {
    if (EXPLICIT_PROXY_NAMES.some((name) => name.toUpperCase() === key.toUpperCase())) {
      const value = processEnv[key]
      if (value !== undefined && value.trim() !== '') {
        explicit.set(key.toUpperCase(), value.trim())
      }
    }
  }

  const hasExplicit = (name) => explicit.has(name.toUpperCase())
  // The official policy resolves a missing HTTPS slot from HTTP. Supply both
  // slots when Windows names both so independent configurations remain exact.
  if (!hasExplicit('HTTP_PROXY')) overlay.set('http_proxy', system.http)
  if (!hasExplicit('HTTPS_PROXY')) overlay.set('https_proxy', system.https ?? system.http)
  overlay.delete('HTTP_PROXY')
  overlay.delete('HTTPS_PROXY')

  const inheritedNoProxy = base.get?.('no_proxy')?.value?.trim()
  overlay.set('no_proxy', mergeBypass(inheritedNoProxy, system.bypass))

  return {
    get(name) {
      const wanted = name.toUpperCase()
      for (const [key, value] of explicit) {
        if (key === wanted) return { value }
      }
      for (const [key, value] of overlay) {
        if (key.toUpperCase() === wanted && value !== undefined) return { value }
      }
      return base.get(name)
    },
  }
}

/**
 * Merge Windows proxy bypass entries with an inherited NO_PROXY list.
 * Windows uses semicolons and wildcard host suffixes; DSH accepts
 * comma-separated host suffixes, so only compatible entries are translated.
 * @param {string | undefined} inherited
 * @param {string | undefined} windowsBypass
 */
export function mergeBypass(inherited, windowsBypass) {
  const entries = []
  const add = (value) => {
    const normalized = String(value ?? '').trim()
    if (normalized !== '' && !entries.some((entry) => entry.toLowerCase() === normalized.toLowerCase())) {
      entries.push(normalized)
    }
  }

  for (const value of String(inherited ?? '').split(/[,\s]+/)) add(value)
  for (const raw of String(windowsBypass ?? '').split(';')) {
    const value = raw.trim()
    if (value === '') continue
    if (value === '<local>' || /^localhost$/i.test(value) || /^127(?:\.\d{1,3}){3}$/.test(value) || /^(?:\[::1\]|::1)$/i.test(value)) {
      continue
    }
    if (value === '*' || /^\*\.[A-Za-z0-9.-]+$/.test(value)) {
      add(value)
      continue
    }
    if (/^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(value)) {
      add(value)
      continue
    }
    // Windows supports CIDR and wildcard forms that DSH's host-suffix matcher
    // cannot express faithfully. Routing those to the proxy is safer than
    // claiming a bypass the transport will not honor.
  }

  for (const entry of LOOPBACK_ENTRIES) add(entry)
  return entries.join(',')
}

/**
 * Normalize the Windows ProxyServer value.
 * A scheme-specific list (`http=host:port;https=host:port`) is supported.
 * @param {string} value
 */
export function parseWindowsProxyServer(value) {
  const input = String(value ?? '').trim()
  if (input === '') return {}

  const mapped = {}
  for (const part of input.split(';')) {
    const match = /^(https?)=(.+)$/i.exec(part.trim())
    if (match) mapped[match[1].toLowerCase()] = match[2]
  }
  if (Object.keys(mapped).length > 0) {
    return {
      http: toProxyUrl(mapped.http),
      https: toProxyUrl(mapped.https),
    }
  }
  const url = toProxyUrl(input)
  return { http: url, https: url }
}

/**
 * Normalize a host:port or proxy URL.
 * @param {string | undefined} value
 */
export function toProxyUrl(value) {
  const input = String(value ?? '').trim()
  if (input === '') return undefined
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `http://${input}`
}

function execPowerShell(script, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(options.powershell ?? 'powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true,
      timeout: options.timeoutMs ?? 5000,
      encoding: 'utf8',
    }, (error, stdout) => error === null ? resolve(stdout.trim()) : reject(error))
  })
}

/**
 * Read the current user's WinINET proxy configuration, which is the "system
 * proxy" shown by Windows Settings. Machine policy and WinHTTP are separate
 * mechanisms and are intentionally not conflated with it.
 * @param {{ powershell?: string, timeoutMs?: number }} [options]
 */
export async function readWindowsSystemProxy(options = {}) {
  if (process.platform !== 'win32') {
    return { state: 'unsupported', reason: `system proxy detection requires Windows, found ${process.platform}` }
  }

  const script = String.raw`
$ErrorActionPreference = 'Stop'
$key = Get-ItemProperty -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings'
$enabled = [int]$key.ProxyEnable -eq 1
$server = [string]$key.ProxyServer
$bypass = [string]$key.ProxyOverride
$autoConfigUrl = [string]$key.AutoConfigURL
$autoDetect = $false
$connections = Get-ItemProperty -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings\Connections' -ErrorAction SilentlyContinue
if ($null -ne $connections -and $null -ne $connections.DefaultConnectionSettings) {
  $bytes = [byte[]]$connections.DefaultConnectionSettings
  if ($bytes.Length -gt 8) { $autoDetect = (([int]$bytes[8]) -band 8) -ne 0 }
}
[pscustomobject]@{
  enabled = $enabled
  server = $server
  bypass = $bypass
  autoConfigUrl = $autoConfigUrl
  autoDetect = $autoDetect
} | ConvertTo-Json -Compress
`
  let raw
  try {
    raw = await execPowerShell(script, options)
  } catch (error) {
    return { state: 'error', reason: `could not read Windows Internet Settings: ${error.message}` }
  }

  let settings
  try {
    settings = JSON.parse(raw)
  } catch {
    return { state: 'error', reason: 'Windows Internet Settings returned invalid JSON' }
  }
  const bypass = typeof settings.bypass === 'string' ? settings.bypass : ''
  const proxies = parseWindowsProxyServer(settings.server)
  if (settings.enabled) {
    if (proxies.http === undefined && proxies.https === undefined) {
      return { state: 'error', reason: 'Windows system proxy is enabled but ProxyServer is empty' }
    }
    return {
      state: 'enabled',
      url: proxies.https ?? proxies.http,
      http: proxies.http,
      https: proxies.https,
      bypass,
    }
  }
  if (settings.autoConfigUrl) {
    return { state: 'pac', reason: 'Windows uses a PAC URL; dsh-system-proxy does not evaluate PAC scripts' }
  }
  if (settings.autoDetect) {
    return { state: 'pac', reason: 'Windows has proxy auto-detect enabled; dsh-system-proxy does not evaluate WPAD' }
  }
  return { state: 'disabled', bypass }
}

/**
 * Validate and normalize plugin configuration before making a proxy decision.
 * @param {Partial<{ mode: string, proxyUrl: string, useWindowsBypass: boolean }>} input
 */
export function normalizeConfig(input = {}) {
  const mode = input.mode ?? 'auto'
  if (!['auto', 'manual', 'off'].includes(mode)) {
    throw new TypeError(`mode must be "auto", "manual", or "off"; received ${JSON.stringify(mode)}`)
  }
  if (typeof input.proxyUrl !== 'undefined' && typeof input.proxyUrl !== 'string') {
    throw new TypeError('proxyUrl must be a string')
  }
  if (typeof input.useWindowsBypass !== 'undefined' && typeof input.useWindowsBypass !== 'boolean') {
    throw new TypeError('useWindowsBypass must be a boolean')
  }
  return {
    mode,
    proxyUrl: input.proxyUrl ?? '',
    useWindowsBypass: input.useWindowsBypass ?? true,
  }
}

/**
 * Convert the plugin's settings into a resolved proxy decision.
 * @param {{ mode: string, proxyUrl: string, useWindowsBypass: boolean }} config
 * @param {Awaited<ReturnType<typeof readWindowsSystemProxy>>} system
 */
export function resolveProxyConfig(config, system) {
  if (config.mode === 'off') return { state: 'disabled', reason: 'disabled by dsh-system-proxy configuration' }
  if (config.mode === 'manual') {
    const url = toProxyUrl(config.proxyUrl)
    if (url === undefined) return { state: 'error', reason: 'manual mode requires a non-empty proxyUrl' }
    return {
      state: 'enabled',
      url,
      http: url,
      https: url,
      bypass: config.useWindowsBypass ? system.bypass ?? '' : '',
    }
  }
  return system
}
