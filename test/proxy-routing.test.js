import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import http from 'node:http'
import test from 'node:test'
import { installGlobalProxy } from '../lib/proxy-policy.js'

test('plugin dispatcher routes external requests and bypasses loopback', async (t) => {
  const seen = []
  const proxy = http.createServer((request, response) => {
    seen.push({ method: request.method, url: request.url })
    response.writeHead(200, { 'content-type': 'text/plain' })
    response.end('via-proxy')
  })
  await new Promise((resolve, reject) => {
    proxy.once('error', reject)
    proxy.listen(0, '127.0.0.1', resolve)
  })
  t.after(() => new Promise((resolve) => proxy.close(resolve)))

  const address = proxy.address()
  assert.equal(typeof address, 'object')
  const proxyUrl = `http://127.0.0.1:${address.port}`
  const before = {
    HTTPS_PROXY: process.env.HTTPS_PROXY,
    https_proxy: process.env.https_proxy,
    NODE_USE_ENV_PROXY: process.env.NODE_USE_ENV_PROXY,
  }
  const dispose = await installGlobalProxy({
    proxyUrl,
    http: proxyUrl,
    https: proxyUrl,
    bypass: 'localhost,127.0.0.1',
  })
  t.after(dispose)

  assert.equal(process.env.HTTPS_PROXY, proxyUrl)
  assert.equal(process.env.https_proxy, proxyUrl)
  assert.equal(process.env.NODE_USE_ENV_PROXY, '1')
  assert.match(process.env.NO_PROXY, /127\.0\.0\.1/)
  const childValue = execFileSync(process.execPath, [
    '-e',
    'process.stdout.write(process.env.HTTPS_PROXY)',
  ], { env: { ...process.env }, encoding: 'utf8' })
  assert.equal(childValue, proxyUrl)
  t.after(() => {
    for (const [name, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  })

  const response = await fetch('http://example.com/check')
  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'via-proxy')
  assert.deepEqual(seen, [{ method: 'GET', url: 'http://example.com/check' }])
})
