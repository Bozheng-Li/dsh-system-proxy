import {
  normalizeConfig,
  readWindowsSystemProxy,
  resolveProxyConfig,
} from './system-proxy.js'
import { installGlobalProxy, windowsBypassTokens } from './proxy-policy.js'

/** Stable Loader identity. */
export const name = 'dsh-system-proxy'

/** Default plugin configuration. */
export const DEFAULT_CONFIG = Object.freeze({
  mode: 'auto',
  proxyUrl: '',
  useWindowsBypass: true,
})

/**
 * Read Windows system proxy settings and install the matching process-wide
 * undici dispatcher. The plugin owns both the dispatcher and its disposal.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {Partial<typeof DEFAULT_CONFIG>} [input]
 */
export async function apply(ctx, input = {}) {
  const config = normalizeConfig({ ...DEFAULT_CONFIG, ...input })
  const detected = await readWindowsSystemProxy()
  const resolved = resolveProxyConfig(config, detected)
  const proxyUrl = resolved.state === 'enabled' ? resolved.https ?? resolved.http : undefined

  let dispose
  if (proxyUrl) {
    dispose = await installGlobalProxy({
      proxyUrl,
      http: resolved.http,
      https: resolved.https ?? resolved.http,
      bypass: bypassFor(resolved, config),
    })
    report(`using ${redactProxy(proxyUrl)} from ${config.mode === 'manual' ? 'manual configuration' : 'Windows system proxy'}`)
  } else {
    dispose = async () => {}
    report(`not active: ${resolved.reason ?? 'no enabled Windows system proxy'}`)
  }

  if (typeof ctx.effect === 'function') {
    ctx.effect(() => dispose, 'dsh-system-proxy: global dispatcher')
  }
}

function bypassFor(resolved, config) {
  return config.useWindowsBypass ? windowsBypassTokens(resolved.bypass) : ''
}

function report(message) {
  process.stderr.write(`dsh-system-proxy: ${message}\n`)
}

/** Hide credentials before a proxy URL reaches a log. */
export function redactProxy(value) {
  try {
    const parsed = new URL(value)
    if (parsed.username || parsed.password) {
      parsed.username = '***'
      parsed.password = '***'
    }
    return parsed.toString().replace(/\/$/, '')
  } catch {
    return value
  }
}

export * from './proxy-policy.js'
export * from './system-proxy.js'
