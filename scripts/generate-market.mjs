import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const repository = 'https://github.com/Bozheng-Li/dsh-system-proxy'
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
const timestamp = Number(execFileSync('git', ['show', '-s', '--format=%ct', commit], { cwd: root, encoding: 'utf8' }).trim())

const index = {
  format: 1,
  title: { en: 'DSH System Utilities', zh: 'DSH 系统工具' },
  description: {
    en: 'Small utilities for DeepSeek Harness.',
    zh: 'DeepSeek Harness 的小型实用插件。',
  },
  metadata: {
    categories: {
      network: { title: { en: 'Network', zh: '网络' } },
    },
    labels: {
      windows: { title: { en: 'Windows', zh: 'Windows' } },
      proxy: { title: { en: 'Proxy', zh: '代理' } },
    },
  },
  plugins: [
    {
      name: manifest.name,
      title: { en: 'Windows System Proxy', zh: 'Windows 系统代理' },
      description: {
        en: 'Let DSH reuse the Windows system HTTP proxy without TUN mode.',
        zh: '让 DSH 复用 Windows 系统 HTTP 代理，无需开启 TUN。',
      },
      author: 'Bozheng-Li',
      homepage: `${repository}#readme`,
      repository: { url: repository },
      metadata: {
        category: 'network',
        keywords: ['windows', 'proxy', 'system-proxy', 'tun', 'clash', 'mihomo'],
        labels: ['windows', 'proxy'],
      },
      versions: [
        {
          version: manifest.version,
          publishTimestamp: timestamp,
          source: { type: 'npm' },
          engines: { dsh: manifest.dsh.compatibility.dsh },
        },
      ],
    },
  ],
}

await writeFile(join(root, 'market', 'index.json'), `${JSON.stringify(index, null, 2)}\n`, 'utf8')
