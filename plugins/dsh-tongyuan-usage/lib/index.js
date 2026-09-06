/**
 * Tongyuan usage chip for DeepSeek Harness.
 * Polls copilot-dev.tongyuan.cc with TONGYUAN_API_KEY and serves a
 * loopback-only status JSON for the sidebar client (127.0.0.1:1458).
 */
import { Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { createServer } from 'node:http'

const TOKEN_REF = credentialRef('TONGYUAN_API_KEY')
const BASE = 'https://copilot-dev.tongyuan.cc'
const DEFAULT_CONTROL_PORT = 1458
const USAGE_CACHE_MS = 30_000
const POLL_MS = 30_000

function asText(value) {
  return typeof value === 'string' ? value : ''
}

function asNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return undefined
}

function isLocalOrigin(origin) {
  if (origin === undefined) return false
  try {
    const hostname = new URL(origin).hostname
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
  } catch {
    return false
  }
}

function pickToken(items, key) {
  if (!Array.isArray(items) || items.length === 0) return undefined
  const prefix = key.slice(0, 16)
  const hit = items.find((item) => asText(item?.tokenPrefix) === prefix) || items[0]
  return {
    name: asText(hit.name) || 'token',
    todayTokens: asNumber(hit.todayTokens),
    totalTokens: asNumber(hit.totalTokens),
    todayCostRMB: asNumber(hit.todayCostRMB),
    totalCostRMB: asNumber(hit.totalCostRMB),
    lastUsedAt: asText(hit.lastUsedAt),
  }
}

async function getJson(url, key) {
  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${key}`,
      accept: 'application/json',
    },
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`HTTP ${response.status} ${text.slice(0, 120)}`)
  return JSON.parse(text)
}

export class TongyuanUsage extends Service {
  static Config = z.object({
    controlPort: z.number(),
  })

  static inject = ['credentials']

  constructor(ctx, config) {
    super(ctx, 'tongyuanUsage')
    this.controlPort = config.controlPort ?? DEFAULT_CONTROL_PORT
    this.usageCache = undefined
    this.usageError = undefined
    ctx.effect(() => this.startControlServer())
    ctx.effect(() => {
      void this.refresh().catch(() => {})
      const timer = setInterval(() => { void this.refresh().catch(() => {}) }, POLL_MS)
      return () => { clearInterval(timer) }
    })
  }

  async refresh() {
    const resolved = await this.ctx.credentials.resolve(TOKEN_REF)
    const key = asText(resolved?.value)
    if (!key) {
      this.usageCache = undefined
      this.usageError = 'TONGYUAN_API_KEY missing'
      return
    }
    try {
      const [balance, tokens, user] = await Promise.all([
        getJson(`${BASE}/api/user/balance`, key),
        getJson(`${BASE}/api/tokens`, key).catch(() => ({ items: [] })),
        getJson(`${BASE}/api/user`, key).catch(() => ({})),
      ])
      const token = pickToken(tokens.items, key)
      this.usageCache = {
        username: asText(user.username),
        email: asText(user.email),
        balance: asNumber(balance.balance),
        unit: asText(balance.unit) || 'RMB',
        active: balance.is_active === true,
        tokenName: token?.name || '',
        todayTokens: token?.todayTokens,
        totalTokens: token?.totalTokens,
        todayCostRMB: token?.todayCostRMB,
        totalCostRMB: token?.totalCostRMB,
        lastUsedAt: token?.lastUsedAt || '',
        fetchedAt: Date.now(),
      }
      this.usageError = undefined
    } catch (error) {
      this.usageError = error instanceof Error ? error.message : String(error)
    }
  }

  async status(refresh = false) {
    if (refresh || this.usageCache === undefined || Date.now() - (this.usageCache.fetchedAt ?? 0) > USAGE_CACHE_MS) {
      await this.refresh()
    }
    return {
      ok: this.usageCache !== undefined && !this.usageError,
      usage: this.usageCache,
      usageError: this.usageError,
    }
  }

  startControlServer() {
    return new Promise((resolveStart, rejectStart) => {
      const server = createServer((request, response) => { void this.controlRequest(request, response) })
      server.once('error', rejectStart)
      server.listen(this.controlPort, '127.0.0.1', () => {
        server.removeListener('error', rejectStart)
        resolveStart(() => { server.close() })
      })
    })
  }

  async controlRequest(request, response) {
    const origin = request.headers.origin
    const localOrigin = isLocalOrigin(origin)
    const headers = {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
      vary: 'Origin',
      ...localOrigin ? { 'access-control-allow-origin': origin } : {},
    }
    const send = (status, value) => {
      response.writeHead(status, headers).end(JSON.stringify(value))
    }
    try {
      const url = new URL(request.url ?? '/', `http://127.0.0.1:${this.controlPort}`)
      if (request.method === 'OPTIONS' && localOrigin) {
        response.writeHead(204, {
          ...headers,
          'access-control-allow-methods': 'GET, OPTIONS',
          'access-control-allow-headers': 'content-type',
        }).end()
        return
      }
      if (!localOrigin && origin !== undefined) {
        send(403, { error: 'This endpoint only accepts a local DSH Web origin.' })
        return
      }
      if (url.pathname === '/status' && request.method === 'GET') {
        send(200, await this.status(url.searchParams.get('refresh') === '1'))
        return
      }
      send(404, { error: 'not found' })
    } catch (error) {
      send(500, { error: error instanceof Error ? error.message : String(error) })
    }
  }
}

export default TongyuanUsage
