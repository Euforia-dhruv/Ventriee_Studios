import { createServer, type Server } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { runEngine } from '../src/main/engines'
import type { Credentials } from '../src/main/credentials'

/**
 * Captures the JSON body the studio actually sends. reasoning_effort is easy to
 * store and forget, so this asserts the wire, not the record.
 */
async function capture(): Promise<{ url: string; bodies: string[]; close: () => Promise<void> }> {
  const bodies: string[] = []
  const server: Server = createServer((req, res) => {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      bodies.push(raw)
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'ok' } }] })}\n\n`)
      res.end('data: [DONE]\n\n')
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  return {
    url: `http://127.0.0.1:${port}/v1`,
    bodies,
    close: () => new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

const creds = { get: () => 'test-key' } as unknown as Credentials

let open: (() => Promise<void>) | null = null
afterEach(async () => {
  if (open) await open()
  open = null
})

describe('reasoning effort on the wire', () => {
  it('sends reasoning_effort for an OpenAI-compatible provider', async () => {
    const server = await capture()
    open = server.close
    const result = await runEngine(
      {
        engine: 'api-openai',
        model: 'test-model',
        endpoint: server.url,
        system: 'sys',
        prompt: 'go',
        cwd: process.cwd(),
        maxTokens: 100,
        timeoutMs: 10_000,
        reasoning: 'high'
      },
      creds
    )
    expect(result.ok).toBe(true)
    const body = JSON.parse(server.bodies[0])
    expect(body.reasoning_effort).toBe('high')
  })

  it('sends reasoning_effort none, which is how a thinking model is told to answer', async () => {
    const server = await capture()
    open = server.close
    await runEngine(
      {
        engine: 'api-openai',
        model: 'test-model',
        endpoint: server.url,
        system: 'sys',
        prompt: 'go',
        cwd: process.cwd(),
        maxTokens: 100,
        timeoutMs: 10_000,
        reasoning: 'none'
      },
      creds
    )
    expect(JSON.parse(server.bodies[0]).reasoning_effort).toBe('none')
  })

  it('omits the field entirely on auto, so the model keeps its own default', async () => {
    const server = await capture()
    open = server.close
    await runEngine(
      {
        engine: 'api-openai',
        model: 'test-model',
        endpoint: server.url,
        system: 'sys',
        prompt: 'go',
        cwd: process.cwd(),
        maxTokens: 100,
        timeoutMs: 10_000,
        reasoning: 'auto'
      },
      creds
    )
    expect(JSON.parse(server.bodies[0])).not.toHaveProperty('reasoning_effort')
  })

  it('shapes the body the same way when no level is set at all', async () => {
    const server = await capture()
    open = server.close
    await runEngine(
      {
        engine: 'api-openai',
        model: 'test-model',
        endpoint: server.url,
        system: 'sys',
        prompt: 'go',
        cwd: process.cwd(),
        maxTokens: 100,
        timeoutMs: 10_000
      },
      creds
    )
    expect(JSON.parse(server.bodies[0])).not.toHaveProperty('reasoning_effort')
  })
})
