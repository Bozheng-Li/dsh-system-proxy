import assert from 'node:assert/strict'
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
  const dispose = await installGlobalProxy({
    proxyUrl,
    http: proxyUrl,
    https: proxyUrl,
    bypass: 'localhost,127.0.0.1',
  })
  t.after(dispose)

  const response = await fetch('http://example.com/check')
  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'via-proxy')
  assert.deepEqual(seen, [{ method: 'GET', url: 'http://example.com/check' }])
})
