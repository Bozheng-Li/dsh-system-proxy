import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { parseMarketIndex } from '@deepseek-ai/dsh-plugin-market-index'

test('market index is valid and lists this plugin', async () => {
  const path = new URL('../market/index.json', import.meta.url)
  const raw = JSON.parse(await readFile(path, 'utf8'))
  const index = parseMarketIndex(raw, 'https://raw.githubusercontent.com/Bozheng-Li/dsh-system-proxy/main/market/index.json')
  const plugin = index.plugins.find((entry) => entry.name === 'dsh-system-proxy')

  assert.ok(plugin)
  assert.equal(plugin.versions.length, 1)
  assert.equal(plugin.versions[0].source.type, 'git')
  assert.match(plugin.versions[0].source.commit, /^[0-9a-f]{40}$/)
})
