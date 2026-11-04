import assert from 'node:assert/strict'
import http from 'node:http'
import test from 'node:test'
import { createLaunchEnvironmentSnapshot } from '@deepseek-ai/dsh-launch-environment'
import { installProxyFromEnvironment } from '@deepseek-ai/dsh-http-proxy'

test('official DSH proxy policy routes global fetch through an HTTP proxy', async (t) => {
  const seen = []
  const proxy = http.createServer((request, response) => {
    seen.push(request.url)
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
  const environment = createLaunchEnvironmentSnapshot([{
    source: 'process',
    values: {
      HTTP_PROXY: proxyUrl,
      HTTPS_PROXY: proxyUrl,
      NO_PROXY: '',
    },
  }])
  const dispose = await installProxyFromEnvironment(environment, (message) => assert.fail(message))
  t.after(dispose)

  // Use an absolute HTTP request through fetch's global dispatcher. Do not use
  // localhost: DSH deliberately bypasses every loopback destination.
  const response = await fetch('http://proxy-routing.invalid/check')
  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'via-proxy')
  assert.deepEqual(seen, ['http://proxy-routing.invalid/check'])
})
