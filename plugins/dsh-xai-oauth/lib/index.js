/**
 * Native xAI (Grok/X subscription) OAuth login for DeepSeek Harness.
 *
 * Runs xAI's RFC 8628 device-code flow, persists the access/refresh tokens in
 * a local file, refreshes the access token near expiry, and injects the valid
 * bearer token into the harness credentials seam under `XAI_OAUTH_TOKEN`, so
 * an `llm-pi-ai` provider route declared with `apiKeyEnv: XAI_OAUTH_TOKEN`
 * authenticates every request with the subscription's current access token.
 *
 * The login state is served to the Web settings page through a loopback-only
 * control server (127.0.0.1:1457).
 */
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { randomBytes } from 'node:crypto'
import { readFile, unlink } from 'node:fs/promises'
import { createServer } from 'node:http'
import { join, resolve } from 'node:path'

/** Public client id used by the xAI CLI/device flow (same one pi-ai uses). */
const CLIENT_ID = 'b1a00492-073a-47ea-816f-4c329264a828'
const SCOPE = 'openid profile email offline_access grok-cli:access api:access'
const DEVICE_CODE_URL = 'https://auth.x.ai/oauth2/device/code'
const TOKEN_URL = 'https://auth.x.ai/oauth2/token'
/** Grok CLI proxy that exposes subscription billing for OAuth tokens. */
const BILLING_URL = 'https://cli-chat-proxy.grok.com/v1/billing?format=credits'
const SETTINGS_URL = 'https://cli-chat-proxy.grok.com/v1/settings'
const ME_URL = 'https://api.x.ai/v1/me'
const DEFAULT_FILENAME = 'xai-oauth.json'
/** Credential reference the injected subscription token is stored under. */
const TOKEN_REF = credentialRef('XAI_OAUTH_TOKEN')
const DEFAULT_CONTROL_PORT = 1457
/** Refresh slightly before the reported expiry, so a token never dies mid-request. */
const REFRESH_SKEW_MS = 5 * 60 * 1000
/** Fallback lifetime when xAI omits expires_in. */
const DEFAULT_TOKEN_LIFETIME_MS = 3600 * 1000
/** Credential refresh check cadence. */
const REFRESH_POLL_MS = 60 * 1000
/** How long a successful usage snapshot is reused before re-fetching. */
const USAGE_CACHE_MS = 30_000

/** Persisted xAI OAuth credential. */
class XaiCredential {
  /** @param {string} access @param {string} refresh @param {number} expires */
  constructor(access, refresh, expires) {
    this.access = access
    this.refresh = refresh
    this.expires = expires
  }
}

/** The one login session the plugin runs at a time. */
class LoginSession {
  /** @param {{deviceCode: string, userCode: string, verificationUri: string, verificationUriComplete?: string, intervalSeconds?: number, expiresInSeconds: number}} device */
  constructor(device) {
    this.status = 'pending'
    this.device = device
    this.startedAt = Date.now()
    this.controller = new AbortController()
    this.error = undefined
  }

  /** Client-safe projection (no device code, no abort controller). */
  public() {
    if (this.status !== 'pending') {
      return { status: this.status, error: this.error }
    }
    return {
      status: 'pending',
      userCode: this.device.userCode,
      verificationUri: this.device.verificationUriComplete ?? this.device.verificationUri,
      expiresInSeconds: this.device.expiresInSeconds,
    }
  }
}

function requiredString(body, field) {
  const value = body[field]
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid xAI OAuth response field: ${field}`)
  }
  return value
}

function positiveNumber(body, field) {
  const value = body[field]
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid xAI OAuth response field: ${field}`)
  }
  return value
}

/** The verification URI is opened in the user's browser; force https. */
function validateVerificationUri(raw) {
  let url
  try {
    url = new URL(raw)
  } catch {
    throw new Error('Untrusted verification URI in xAI OAuth response')
  }
  if (url.protocol !== 'https:') {
    throw new Error('Untrusted verification URI in xAI OAuth response')
  }
  return url.href
}

async function postForm(url, fields, signal) {
  let response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(fields),
      signal,
    })
  } catch (error) {
    if (signal?.aborted) throw new Error('Login cancelled')
    throw error
  }
  let body
  try {
    const parsed = await response.json()
    body = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    if (signal?.aborted) throw new Error('Login cancelled')
    throw new Error(`xAI OAuth returned invalid JSON (HTTP ${response.status})`)
  }
  return { ok: response.ok, status: response.status, body }
}

function requestFailure(action, response) {
  const error = typeof response.body.error === 'string' ? response.body.error : undefined
  const description = typeof response.body.error_description === 'string' ? response.body.error_description : undefined
  const detail = [error, description].filter(Boolean).join(': ')
  return new Error(`xAI OAuth ${action} failed (HTTP ${response.status})${detail ? `: ${detail}` : ''}`)
}

function parseDeviceCode(body) {
  // RFC 8628 allows interval 0 (no minimum wait); fall back to the poller's
  // default instead of failing on non-positive or malformed values.
  const interval = body.interval
  const intervalSeconds = typeof interval === 'number' && Number.isFinite(interval) && interval > 0 ? interval : undefined
  const verificationUriComplete = typeof body.verification_uri_complete === 'string' && body.verification_uri_complete.length > 0
    ? validateVerificationUri(body.verification_uri_complete)
    : undefined
  return {
    deviceCode: requiredString(body, 'device_code'),
    userCode: requiredString(body, 'user_code'),
    verificationUri: validateVerificationUri(requiredString(body, 'verification_uri')),
    verificationUriComplete,
    intervalSeconds,
    expiresInSeconds: positiveNumber(body, 'expires_in'),
  }
}

function credentialFromTokenResponse(body, previousRefreshToken) {
  const access = requiredString(body, 'access_token')
  // xAI may omit refresh_token on refresh when the token is not rotated.
  const refresh = body.refresh_token === undefined && previousRefreshToken !== undefined
    ? previousRefreshToken
    : requiredString(body, 'refresh_token')
  const expiresInMs = body.expires_in === undefined ? DEFAULT_TOKEN_LIFETIME_MS : positiveNumber(body, 'expires_in') * 1000
  return new XaiCredential(access, refresh, Date.now() + expiresInMs - REFRESH_SKEW_MS)
}

function sleep(ms, signal) {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolvePromise()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new Error('Login cancelled'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
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

/** DSH service providing login, logout, and automatically refreshed xAI subscription tokens. */
export class XaiOAuth extends Service {
  static Config = z.object({
    path: z.string(),
    dshHome: z.string(),
    controlPort: z.number(),
  })
  static inject = ['credentials']

  constructor(ctx, config) {
    super(ctx, 'xaiOAuth')
    this.filename = resolve(config.path ?? join(resolveDshHome(config.dshHome), DEFAULT_FILENAME))
    this.controlPort = config.controlPort ?? DEFAULT_CONTROL_PORT
    this.csrf = randomBytes(24).toString('base64url')
    this.loginSession = undefined
    this.lastLoginError = undefined
    this.usageCache = undefined
    this.usageError = undefined

    // xAI's Grok 4.20 Multi-Agent endpoint is Responses-only and rejects
    // client-side/custom function tools. The dedicated xai-responses route
    // contains only that model, so strip Harness tool schemas (and their
    // matching prompt guidance) after the scoped model-selection listener has
    // populated the resolved provider/model variables.
    ctx.on('system-prompt/assemble', async (_assembly, _context, next) => {
      const assembled = await next()
      if (assembled.variables?.provider !== 'xai-responses') return assembled
      return {
        ...assembled,
        sections: assembled.sections.filter((section) => !section.name.startsWith('tool:')),
        tools: [],
      }
    })

    ctx.effect(async () => {
      const token = await this.bearerToken()
      if (token !== undefined) await ctx.credentials.set(TOKEN_REF, token)
      return () => {}
    })
    ctx.effect(() => {
      const timer = setInterval(() => { void this.bearerToken().catch(() => {}) }, REFRESH_POLL_MS)
      return () => { clearInterval(timer) }
    })
    ctx.effect(() => this.startControlServer())
  }

  /** Current valid access token, refreshing and persisting when near expiry. */
  async bearerToken(signal) {
    return withFileLock(this.filename, async () => {
      const current = await this.readCredential()
      if (current === undefined) return undefined
      if (current.expires > Date.now() + REFRESH_SKEW_MS) return current.access
      const next = await refreshXaiToken(current.refresh, signal)
      await this.writeCredential(next)
      await this.ctx.credentials.set(TOKEN_REF, next.access)
      return next.access
    })
  }

  /** Begin the device-code login, or return the pending session's public state. */
  async startLogin() {
    if (this.loginSession !== undefined && this.loginSession.status === 'pending') {
      return { started: false, loginState: this.loginSession.public() }
    }
    this.lastLoginError = undefined
    const device = await requestDeviceCode()
    const session = new LoginSession(device)
    this.loginSession = session
    void this.pollForTokens(session).catch(() => {})
    return { started: true, loginState: session.public() }
  }

  async pollForTokens(session) {
    const device = session.device
    let intervalMs = (device.intervalSeconds ?? 5) * 1000
    try {
      for (;;) {
        if (session.controller.signal.aborted) {
          this.finishLogin(session, { status: 'cancelled' })
          return
        }
        await sleep(intervalMs, session.controller.signal)
        if (Date.now() - session.startedAt >= device.expiresInSeconds * 1000) {
          this.finishLogin(session, { status: 'failed', error: 'xAI 设备码已过期，请重新登录' })
          return
        }
        const result = await pollDeviceToken(device.deviceCode, session.controller.signal)
        if (result.status === 'complete') {
          await withFileLock(this.filename, () => this.writeCredential(result.credential))
          await this.ctx.credentials.set(TOKEN_REF, result.credential.access)
          this.finishLogin(session, { status: 'complete' })
          return
        }
        if (result.status === 'slow_down') {
          intervalMs = result.intervalSeconds !== undefined ? result.intervalSeconds * 1000 : intervalMs + 5 * 1000
          continue
        }
        if (result.status === 'failed') {
          this.finishLogin(session, { status: 'failed', error: result.message })
          return
        }
        intervalMs = (device.intervalSeconds ?? 5) * 1000
      }
    } catch (error) {
      const cancelled = error instanceof Error && error.message === 'Login cancelled'
      if (!cancelled && this.loginSession === session) {
        this.ctx.logger.warn('xai-oauth: token polling failed')
        this.ctx.logger.warn(error)
      }
      this.finishLogin(session, { status: cancelled ? 'cancelled' : 'failed', error: cancelled ? undefined : error instanceof Error ? error.message : String(error) })
    }
  }

  finishLogin(session, next) {
    if (this.loginSession !== session) return
    session.status = next.status
    session.error = next.error
    if (next.status === 'failed') this.lastLoginError = next.error
    if (next.status !== 'pending') session.controller.abort()
  }

  /** Status for the settings page. @param {{refresh?: boolean}} [options] */
  async status(options = {}) {
    let credential = await this.readCredential()
    const loginState = this.loginSession !== undefined ? this.loginSession.public() : undefined
    if (credential === undefined) {
      return {
        loggedIn: false,
        loginPending: loginState?.status === 'pending',
        loginState,
        loginError: this.lastLoginError,
        csrf: this.csrf,
      }
    }
    try {
      await this.bearerToken()
      credential = (await this.readCredential()) ?? credential
    } catch (error) {
      this.ctx.logger.warn('xai-oauth: token refresh failed, serving stored token')
      this.ctx.logger.warn(error)
    }
    const refresh = options.refresh === true
    if (refresh || this.usageCache === undefined || Date.now() - this.usageCache.fetchedAt > USAGE_CACHE_MS) {
      try {
        this.usageCache = await this.fetchUsage()
        this.usageError = undefined
      } catch (error) {
        this.usageError = error instanceof Error ? error.message : String(error)
      }
    }
    return {
      loggedIn: true,
      expiresAt: credential.expires,
      loginPending: loginState?.status === 'pending',
      loginState,
      loginError: this.lastLoginError,
      usage: this.usageCache,
      usageError: this.usageError,
      csrf: this.csrf,
    }
  }

  /**
   * Fetch subscription tier + Grok Build billing snapshot with the current access token.
   * Uses the same cli-chat-proxy surfaces the Grok CLI / OpenUsage use.
   */
  async fetchUsage() {
    const access = await this.bearerToken()
    if (access === undefined) throw new Error('xAI login is missing')
    const headers = {
      accept: 'application/json',
      authorization: `Bearer ${access}`,
      'x-xai-token-auth': 'xai-grok-cli',
      'x-grok-client-mode': 'cli',
      'user-agent': 'dsh-xai-oauth/0.1',
    }
    const [billingResponse, settingsResponse, meResponse] = await Promise.all([
      fetch(BILLING_URL, { headers }),
      fetch(SETTINGS_URL, { headers }),
      fetch(ME_URL, { headers: { accept: 'application/json', authorization: `Bearer ${access}` } }),
    ])
    if (!billingResponse.ok) {
      throw new Error(`xAI billing request failed (HTTP ${billingResponse.status})`)
    }
    const billing = await billingResponse.json()
    const settings = settingsResponse.ok ? await settingsResponse.json() : {}
    const me = meResponse.ok ? await meResponse.json() : {}
    return normalizeUsage(billing, settings, me)
  }

  async logout() {
    this.loginSession?.controller.abort()
    this.loginSession = undefined
    this.lastLoginError = undefined
    this.usageCache = undefined
    this.usageError = undefined
    await withFileLock(this.filename, async () => {
      try {
        await unlink(this.filename)
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
    })
    await this.ctx.credentials.unset(TOKEN_REF)
  }

  async readCredential() {
    let text
    try {
      text = await readFile(this.filename, 'utf8')
    } catch (error) {
      if (error.code === 'ENOENT') return undefined
      throw error
    }
    const value = JSON.parse(text)
    const credential = value?.credential
    if (value?.version !== 1 || credential === undefined
      || typeof credential.access !== 'string' || typeof credential.refresh !== 'string'
      || typeof credential.expires !== 'number') {
      throw new Error(`xai-oauth: invalid credential document ${this.filename}`)
    }
    return new XaiCredential(credential.access, credential.refresh, credential.expires)
  }

  writeCredential(credential) {
    return writeFileAtomic(this.filename, `${JSON.stringify({ version: 1, credential }, null, 2)}\n`, {
      mode: 0o600,
      dirMode: 0o700,
    })
  }

  startControlServer() {
    return new Promise((resolveStart, rejectStart) => {
      const server = createServer((request, response) => { void this.controlRequest(request, response) })
      server.once('error', rejectStart)
      server.listen(this.controlPort, '127.0.0.1', () => {
        server.removeListener('error', rejectStart)
        resolveStart(() => {
          this.loginSession?.controller.abort()
          server.close()
        })
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
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers': 'content-type, x-dsh-csrf',
        }).end()
        return
      }
      if (!localOrigin) {
        send(403, { error: 'This endpoint only accepts a local DSH Web origin.' })
        return
      }
      if (url.pathname === '/start' && request.method === 'GET') {
        send(200, await this.startLogin())
        return
      }
      if (url.pathname === '/status' && request.method === 'GET') {
        send(200, await this.status({ refresh: url.searchParams.get('refresh') === '1' }))
        return
      }
      if (url.pathname === '/logout' && request.method === 'POST') {
        if (request.headers['x-dsh-csrf'] !== this.csrf) {
          send(403, { error: 'Invalid CSRF token.' })
          return
        }
        await this.logout()
        send(200, { ok: true })
        return
      }
      send(404, { error: 'Not found' })
    } catch (error) {
      send(500, { error: error instanceof Error ? error.message : String(error) })
    }
  }
}

function moneyVal(value) {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'object' && typeof value.val === 'number' && Number.isFinite(value.val)) return value.val
  return undefined
}

function percentVal(value) {
  if (value === null || value === undefined) return undefined
  const number = typeof value === 'number' ? value
    : typeof value === 'object' && typeof value.val === 'number' ? value.val
      : undefined
  return Number.isFinite(number) ? number : undefined
}

function stringVal(value) {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function objectVal(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : undefined
}

/**
 * Reduce billing + settings + me into the stable fields the Web card renders.
 *
 * The billing payload mirrors what the Grok CLI's `/usage` command reads
 * (`GET /v1/billing?format=credits` on cli-chat-proxy.grok.com), not the
 * Console's pay-as-you-go API. For subscription (unified-billing) accounts the
 * authoritative usage is `creditUsagePercent` together with `currentPeriod`
 * (weekly/monthly window); `used`/`monthlyLimit` may be absent or 0/0, which
 * is *not* the same as "no data". The subscription tier comes from the
 * billing payload's `subscription_tier` (falling back to the settings
 * `subscription_tier_display`).
 * @param {unknown} billing
 * @param {unknown} settings
 * @param {unknown} me
 */
export function normalizeUsage(billing, settings, me) {
  const raw = objectVal(billing) ?? {}
  const config = objectVal(raw.config) ?? raw
  const settingsObj = objectVal(settings) ?? {}
  const meObj = objectVal(me) ?? {}

  const creditUsagePercent = percentVal(config.creditUsagePercent)
  const used = moneyVal(config.used)
  const monthlyLimit = moneyVal(config.monthlyLimit)
  const onDemandCap = moneyVal(config.onDemandCap)
  const onDemandUsed = moneyVal(config.onDemandUsed)
  const prepaidBalance = moneyVal(config.prepaidBalance)
  const minBeforeHittingSl = moneyVal(config.minBeforeHittingSl)
  const topupAmount = moneyVal(config.topupAmount)
  const maxAmountPerMonth = moneyVal(config.maxAmountPerMonth)
  const isUnifiedBillingUser = config.isUnifiedBillingUser === true
  const period = objectVal(config.currentPeriod) ?? {}
  const periodTypeRaw = stringVal(period.type)
  const periodType = periodTypeRaw === undefined
    ? undefined
    : periodTypeRaw.includes('WEEKLY') ? 'weekly'
      : periodTypeRaw.includes('MONTHLY') ? 'monthly' : undefined
  const periodStart = stringVal(period.start) ?? stringVal(config.billingPeriodStart)
  const periodEnd = stringVal(period.end) ?? stringVal(config.billingPeriodEnd)
  const planType = stringVal(raw.subscription_tier) ?? stringVal(config.subscription_tier)
    ?? stringVal(settingsObj.subscription_tier_display)
  const onDemandEnabled = raw.on_demand_enabled === true || config.on_demand_enabled === true
    ? true
    : raw.on_demand_enabled === false || config.on_demand_enabled === false
      ? false
      : typeof settingsObj.on_demand_enabled === 'boolean' ? settingsObj.on_demand_enabled : undefined
  const userId = stringVal(meObj.user_id)
  const teamId = stringVal(meObj.team_id)

  let usedPercent
  if (creditUsagePercent !== undefined) {
    usedPercent = Math.max(0, Math.min(100, creditUsagePercent))
  } else if (used !== undefined && monthlyLimit !== undefined && monthlyLimit > 0) {
    usedPercent = Math.max(0, Math.min(100, (used / monthlyLimit) * 100))
  }

  const history = Array.isArray(config.history)
    ? config.history.flatMap((row) => {
      const rowObj = objectVal(row)
      if (rowObj === undefined) return []
      const cycle = objectVal(rowObj.billingCycle) ?? {}
      const year = typeof cycle.year === 'number' ? cycle.year : undefined
      const month = typeof cycle.month === 'number' ? cycle.month : undefined
      const totalUsed = moneyVal(rowObj.totalUsed) ?? moneyVal(rowObj.includedUsed)
      if (year === undefined || month === undefined || totalUsed === undefined) return []
      return [{ year, month, totalUsed }]
    }).slice(0, 6)
    : []
  const productUsage = Array.isArray(config.productUsage)
    ? config.productUsage.flatMap((row) => {
      const rowObj = objectVal(row)
      if (rowObj === undefined) return []
      const product = stringVal(rowObj.product)
      const usagePercent = percentVal(rowObj.usagePercent)
      if (product === undefined || usagePercent === undefined) return []
      return [{ product, usagePercent: Math.max(0, Math.min(100, usagePercent)) }]
    })
    : []

  return {
    ...planType === undefined ? {} : { planType },
    ...creditUsagePercent === undefined ? {} : { creditUsagePercent },
    ...used === undefined ? {} : { used },
    ...monthlyLimit === undefined ? {} : { monthlyLimit },
    ...onDemandCap === undefined ? {} : { onDemandCap },
    ...onDemandUsed === undefined ? {} : { onDemandUsed },
    ...prepaidBalance === undefined ? {} : { prepaidBalance },
    ...minBeforeHittingSl === undefined ? {} : { minBeforeHittingSl },
    ...topupAmount === undefined ? {} : { topupAmount },
    ...maxAmountPerMonth === undefined ? {} : { maxAmountPerMonth },
    ...isUnifiedBillingUser ? { isUnifiedBillingUser } : {},
    ...onDemandEnabled === undefined ? {} : { onDemandEnabled },
    ...usedPercent === undefined ? {} : { usedPercent },
    ...periodType === undefined ? {} : { periodType },
    ...periodStart === undefined ? {} : { periodStart },
    ...periodEnd === undefined ? {} : { periodEnd },
    ...userId === undefined ? {} : { userId },
    ...teamId === undefined ? {} : { teamId },
    productUsage,
    history,
    fetchedAt: Date.now(),
  }
}

async function requestDeviceCode(signal) {
  const response = await postForm(DEVICE_CODE_URL, {
    client_id: CLIENT_ID,
    scope: SCOPE,
    referrer: 'deepseek-harness',
  }, signal)
  if (!response.ok) throw requestFailure('device authorization', response)
  return parseDeviceCode(response.body)
}

async function pollDeviceToken(deviceCode, signal) {
  const response = await postForm(TOKEN_URL, {
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    client_id: CLIENT_ID,
    device_code: deviceCode,
  }, signal)
  if (response.ok) {
    return { status: 'complete', credential: credentialFromTokenResponse(response.body) }
  }
  const error = response.body.error
  if (error === 'authorization_pending') return { status: 'pending' }
  if (error === 'slow_down') {
    const interval = response.body.interval
    return { status: 'slow_down', intervalSeconds: typeof interval === 'number' && Number.isFinite(interval) && interval > 0 ? interval : undefined }
  }
  if (error === 'access_denied' || error === 'authorization_denied') {
    return { status: 'failed', message: 'xAI 设备授权被拒绝' }
  }
  if (error === 'expired_token') {
    return { status: 'failed', message: 'xAI 设备码已过期，请重新登录' }
  }
  return { status: 'failed', message: requestFailure('device token polling', response).message }
}

async function refreshXaiToken(refreshToken, signal) {
  const response = await postForm(TOKEN_URL, {
    grant_type: 'refresh_token',
    client_id: CLIENT_ID,
    refresh_token: refreshToken,
  }, signal)
  if (!response.ok) throw requestFailure('token refresh', response)
  return credentialFromTokenResponse(response.body, refreshToken)
}

export default XaiOAuth
