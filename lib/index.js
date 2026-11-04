import {
  createOverlayEnvironment,
  normalizeConfig,
  readWindowsSystemProxy,
  resolveProxyConfig,
} from './system-proxy.js'

// Both packages are host services rather than bundle contents. Resolve them
// through the installed host when the plugin mounts, so a directory-linked
// development profile does not need a second copy of DSH's undici policy.
const hostModules = {
  async load() {
    const [proxy, launch] = await Promise.all([
      import('@deepseek-ai/dsh-http-proxy'),
      import('@deepseek-ai/dsh-launch-environment'),
    ])
    return { install: proxy.installProxyFromEnvironment, launchEnvironmentOf: launch.launchEnvironmentOf }
  },
}

/** Stable Loader identity. */
export const name = 'dsh-system-proxy'

/**
 * Configuration defaults. Kept as a plain object so the plugin has no
 * schemastery peer dependency and remains loadable in minimal host profiles.
 */
export const DEFAULT_CONFIG = Object.freeze({
  mode: 'auto',
  proxyUrl: '',
  useWindowsBypass: true,
})

/**
 * Install the enabled Windows system proxy into DSH's process-wide HTTP policy.
 *
 * The launcher installed a policy from its immutable launch snapshot before
 * plugins loaded. This plugin rebuilds that environment from the current
 * Windows setting and calls the same official installer.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {Partial<typeof DEFAULT_CONFIG>} [input]
 */
export async function apply(ctx, input = {}) {
  const config = normalizeConfig({ ...DEFAULT_CONFIG, ...input })
  const task = await prepareInstall(ctx, config)
  if (typeof ctx.effect === 'function') {
    ctx.effect(() => task.dispose, 'dsh-system-proxy: global dispatcher')
  } else {
    task.announce()
  }
}

/**
 * Build the install operation without requiring a Cordis context. The optional
 * dependencies are seams for host-compatible testing.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {typeof DEFAULT_CONFIG} config
 * @param {{
 *   detect?: typeof readWindowsSystemProxy,
 *   install?: (environment: unknown, report: (message: string) => void) => Promise<() => unknown>,
 *   launchEnvironmentOf?: (ctx: unknown) => { get(name: string): { value: string } | undefined },
 *   environment?: Record<string, string | undefined>,
 *   report?: (message: string) => void,
 * }} [dependencies]
 */
export async function prepareInstall(ctx, config, dependencies = {}) {
  const detect = dependencies.detect ?? readWindowsSystemProxy
  const environment = dependencies.environment ?? process.env
  const report = dependencies.report ?? reportDiagnostic
  const detected = await detect()
  const resolved = resolveProxyConfig(config, detected)

  if (resolved.state === 'enabled') {
    const modules = await hostModules.load()
    const install = dependencies.install ?? modules.install
    const launchEnvironmentOf = dependencies.launchEnvironmentOf ?? modules.launchEnvironmentOf
    const overlay = createOverlayEnvironment(launchEnvironmentOf(ctx), environment, resolved)
    const dispose = await install(overlay, report)
    return lifecycle(dispose, `using ${redactProxy(resolved.https ?? resolved.http)} from ${config.mode === 'manual' ? 'manual configuration' : 'Windows system proxy'}`)
  }

  // The launcher already installed the baseline policy before this plugin
  // mounted. Reinstalling it would only replace that dispatcher with an
  // equivalent one; when no proxy is requested there is nothing to own.
  return lifecycle(async () => {}, `not active: ${resolved.reason ?? 'no enabled Windows system proxy'}`)
}

function lifecycle(dispose, message) {
  let announced = false
  return {
    dispose,
    announce() {
      if (announced) return
      announced = true
      process.stderr.write(`dsh-system-proxy: ${message}\n`)
    },
  }
}

function reportDiagnostic(message) {
  process.stderr.write(`dsh-system-proxy: ${message}\n`)
}

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

export * from './system-proxy.js'
