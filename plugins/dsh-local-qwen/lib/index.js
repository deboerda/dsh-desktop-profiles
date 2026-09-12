/**
 * Host plugin: start/stop local llama-server and expose loopback status for the sidebar switch.
 */
import { Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { createServer } from 'node:http'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import path from 'node:path'

const execFileAsync = promisify(execFile)
const DEFAULT_PORT = 1459
const DEFAULT_ROOT = 'E:\\AI\\LLM'
const DEFAULT_HEALTH = 'http://127.0.0.1:8080/health'

function isLocalOrigin(origin) {
  if (origin === undefined) return false
  try {
    const hostname = new URL(origin).hostname
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
  } catch {
    return false
  }
}

export class LocalQwen extends Service {
  static Config = z.object({
    controlPort: z.number(),
    llamaRoot: z.string(),
    healthUrl: z.string(),
  })

  constructor(ctx, config) {
    super(ctx, 'localQwen')
    this.controlPort = config.controlPort ?? DEFAULT_PORT
    this.llamaRoot = config.llamaRoot || DEFAULT_ROOT
    this.healthUrl = config.healthUrl || DEFAULT_HEALTH
    this.starting = false
    this.lastError = ''
    this.startedAt = 0
    this.logStartSize = 0
    this.progressFloor = 0
    ctx.effect(() => this.startControlServer())
  }

  exePath() {
    return path.join(this.llamaRoot, 'llama.cpp', 'llama-server.exe')
  }

  modelPath() {
    return path.join(this.llamaRoot, 'models', 'Qwen3.6-35B-A3B-Uncensored-HauhauCS-Aggressive-IQ4_XS.gguf')
  }

  async processRunning() {
    try {
      const { stdout } = await execFileAsync('tasklist', ['/FI', 'IMAGENAME eq llama-server.exe', '/FO', 'CSV', '/NH'], { windowsHide: true })
      return String(stdout).toLowerCase().includes('llama-server.exe')
    } catch {
      return false
    }
  }

  async healthy() {
    try {
      const res = await fetch(this.healthUrl, { cache: 'no-store', signal: AbortSignal.timeout(1500) })
      if (!res.ok) return false
      const body = await res.json().catch(() => ({}))
      return body.status === 'ok' || res.ok
    } catch {
      return false
    }
  }

  async processMemory() {
    try {
      const { stdout } = await execFileAsync('tasklist', ['/FI', 'IMAGENAME eq llama-server.exe', '/FO', 'CSV', '/NH'], { windowsHide: true })
      const match = String(stdout).match(/"([0-9,]+)\s*K"/i)
      if (!match) return 0
      return parseInt(match[1].replace(/,/g, ''), 10) * 1024
    } catch {
      return 0
    }
  }

  readLoadLog() {
    const logPath = path.join(this.llamaRoot, 'server.log')
    try {
      const size = fs.statSync(logPath).size
      const start = Math.max(this.logStartSize || 0, Math.max(0, size - 131072))
      const fd = fs.openSync(logPath, 'r')
      const len = Math.max(0, size - start)
      const buf = Buffer.alloc(len)
      fs.readSync(fd, buf, 0, len, start)
      fs.closeSync(fd)
      return buf.toString('utf8')
    } catch {
      return ''
    }
  }

  computeProgress(healthy, running) {
    if (healthy) {
      this.progressFloor = 100
      return { progress: 100, stage: '就绪' }
    }
    if (!running && !this.starting) {
      this.progressFloor = 0
      return { progress: 0, stage: '已关闭' }
    }
    const log = this.readLoadLog()
    let stagePct = this.starting ? 4 : 1
    let stage = '启动进程'
    if (/loading model/i.test(log)) { stagePct = 12; stage = '打开模型文件' }
    if (/llama_model_loader|load_tensors|mmap enabled/i.test(log)) { stagePct = 30; stage = '映射权重' }
    if (/threadpool init/i.test(log)) { stagePct = 58; stage = '初始化线程池' }
    if (/load_model: initializing/i.test(log)) { stagePct = 78; stage = '分配上下文' }
    if (/model loaded/i.test(log)) { stagePct = 92; stage = '模型已载入' }
    if (/listening on/i.test(log)) { stagePct = 97; stage = '绑定端口' }
    let memPct = 0
    return this.finishProgress(stagePct, stage, memPct)
  }

  finishProgress(stagePct, stage, memPct) {
    const elapsed = this.startedAt ? Date.now() - this.startedAt : 0
    const timePct = Math.min(88, Math.round((elapsed / 20000) * 88))
    let progress = Math.max(stagePct, memPct, Math.min(timePct, stagePct + 18))
    progress = Math.max(this.progressFloor || 0, Math.min(99, progress))
    this.progressFloor = progress
    return { progress, stage }
  }

  async snapshot() {
    const running = await this.processRunning()
    const healthy = running ? await this.healthy() : false
    if (healthy) this.starting = false
    const mem = running ? await this.processMemory() : 0
    let modelBytes = 0
    try { modelBytes = fs.statSync(this.modelPath()).size } catch { modelBytes = 0 }
    const load = this.computeProgress(healthy, running)
    if (!healthy && running && modelBytes > 0 && mem > 0) {
      const memPct = Math.min(90, Math.round((mem / modelBytes) * 100))
      const mixed = this.finishProgress(load.progress, load.stage, memPct)
      load.progress = mixed.progress
      load.stage = mixed.stage
    }
    return {
      ok: true,
      running,
      healthy,
      starting: this.starting && !healthy,
      progress: load.progress,
      stage: load.stage,
      error: this.lastError,
      endpoint: this.healthUrl,
      model: 'Qwen3.6 35B-A3B IQ4_XS',
    }
  }

  async start() {
    if (await this.healthy()) {
      this.starting = false
      this.lastError = ''
      return this.snapshot()
    }
    const exe = this.exePath()
    const model = this.modelPath()
    if (!fs.existsSync(exe)) throw new Error('missing llama-server.exe at ' + exe)
    if (!fs.existsSync(model)) throw new Error('missing GGUF at ' + model)
    this.starting = true
    this.lastError = ''
    this.startedAt = Date.now()
    this.progressFloor = 4
    const logPath = path.join(this.llamaRoot, 'server.log')
    try { this.logStartSize = fs.statSync(logPath).size } catch { this.logStartSize = 0 }
    const logFd = fs.openSync(logPath, 'a')
    const child = spawn(exe, [
      '-m', model,
      '--cpu-moe', '-ngl', '99', '-c', '65536', '-fa', 'on',
      '--cache-type-k', 'q8_0', '--cache-type-v', 'q8_0',
      '-t', '6', '--jinja',
      '--chat-template-kwargs', '{"enable_thinking":false}',
      '--temp', '1.0', '--top-p', '0.95', '--top-k', '20', '--min-p', '0',
      '--presence-penalty', '1.5',
      '--host', '127.0.0.1', '--port', '8080',
    ], {
      cwd: path.join(this.llamaRoot, 'llama.cpp'),
      detached: true,
      windowsHide: true,
      stdio: ['ignore', logFd, logFd],
      env: { ...process.env, PATH: path.join(this.llamaRoot, 'llama.cpp') + ';' + (process.env.PATH || '') },
    })
    child.unref()
    return this.snapshot()
  }

  async stop() {
    this.starting = false
    this.startedAt = 0
    this.progressFloor = 0
    try {
      await execFileAsync('taskkill', ['/IM', 'llama-server.exe', '/F'], { windowsHide: true })
      this.lastError = ''
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      if (!/not found|not running|128/i.test(msg)) this.lastError = msg
    }
    return this.snapshot()
  }

  listConversations() {
    const registry = this.ctx.get('workspaceRegistry')
    if (registry && typeof registry.list === 'function') {
      const workspaces = registry.list().map((ws) => ({
        title: ws.title,
        path: ws.path,
        count: Array.isArray(ws.sessionIds) ? ws.sessionIds.length : 0,
      }))
      const count = workspaces.reduce((n, w) => n + w.count, 0)
      return { source: 'registry', count, workspaces }
    }
    return this.listConversationsFallback()
  }

  loadSessionIndex() {
    const dir = path.join(this.dshHome(), 'storages', 'session_projcache', 'sessions')
    const out = []
    let files = []
    try { files = fs.readdirSync(dir) } catch { return out }
    for (const name of files) {
      if (!name.endsWith('.json')) continue
      try {
        const data = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'))
        const id = name.replace(/\.json$/i, '')
        const title = data?.record?.rows?.title?.val || data?.record?.rows?.titleInput?.val?.first?.text || ''
        out.push({ id, title: String(title || ''), cwd: data?.record?.identity?.cwd || '' })
      } catch { /* skip bad cache */ }
    }
    return out
  }

  resolveSessionId(sessionId, title) {
    const id = String(sessionId || '').trim()
    if (/^(session-)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return id
    const want = String(title || '').trim() || id
    if (!want) return ''
    const index = this.loadSessionIndex()
    const exact = index.filter((item) => item.title === want)
    if (exact.length >= 1) return exact[0].id
    const fuzzy = index.filter((item) => item.title && (item.title.includes(want) || want.includes(item.title)))
    if (fuzzy.length >= 1) return fuzzy[0].id
    return ''
  }

  listConversationsFallback() {
    const file = path.join(process.env.DSH_HOME || 'E:\\DSH\\.dsh', 'storages', 'workspace.json')
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'))
      const workspaces = Object.values(data.tables?.workspaces || {}).map((ws) => ({
        title: ws.title,
        path: ws.path,
        count: Array.isArray(ws.sessionIds) ? ws.sessionIds.length : 0,
      }))
      const count = workspaces.reduce((n, w) => n + w.count, 0)
      return { source: 'file', count, workspaces }
    } catch {
      return { source: 'none', count: 0, workspaces: [] }
    }
  }

  readArchivedIds() {
    const registry = this.ctx.get('workspaceRegistry')
    if (registry && Array.isArray(registry.archivedSessionIds)) {
      return [...registry.archivedSessionIds]
    }
    const file = path.join(this.dshHome(), 'storages', 'workspace.json')
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'))
      return Array.isArray(data.global?.archivedSessionIds) ? [...data.global.archivedSessionIds] : []
    } catch {
      return []
    }
  }

  listArchived() {
    const ids = this.readArchivedIds()
    const index = this.loadSessionIndex()
    const byId = new Map(index.map((item) => [item.id, item]))
    const sessions = ids.map((id) => {
      const variants = this.sessionIdVariants(id)
      const meta = variants.map((v) => byId.get(v)).find(Boolean) || { id, title: '', cwd: '' }
      const recoverable = this.findSessionDirs(id).length > 0
      return {
        id: meta.id || id,
        title: meta.title || id,
        cwd: meta.cwd || '',
        recoverable,
      }
    })
    return { count: sessions.length, sessions }
  }

  async unarchiveOne(sessionId) {
    const id = this.resolveSessionId(sessionId, '') || String(sessionId || '').trim()
    if (!id) throw new Error('missing sessionId')
    const variants = this.sessionIdVariants(id)
    const registry = this.ctx.get('workspaceRegistry')
    let updated = false
    const applyLive = async () => {
      const liveIds = registry && Array.isArray(registry.archivedSessionIds)
        ? [...registry.archivedSessionIds]
        : []
      const state = (registry && registry.state)
        || (registry && registry.global && typeof registry.global.get === 'function' ? registry.global.get() : null)
        || {}
      const current = Array.isArray(state.archivedSessionIds) && state.archivedSessionIds.length > 0
        ? [...state.archivedSessionIds]
        : liveIds
      const nextIds = current.filter((item) => !variants.includes(item))
      if (nextIds.length === current.length && current.length > 0) return false
      const next = { ...state, archivedSessionIds: nextIds }
      if (registry && registry.global && typeof registry.global.set === 'function') {
        await registry.global.set(next)
      }
      if (registry) registry.state = next
      return true
    }
    try {
      if (registry && typeof registry.enqueueOperation === 'function') {
        updated = await registry.enqueueOperation(applyLive)
      } else {
        updated = await applyLive()
      }
    } catch {
      updated = await applyLive().catch(() => false)
    }
    const file = path.join(this.dshHome(), 'storages', 'workspace.json')
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (!data.global) data.global = {}
      const current = Array.isArray(data.global.archivedSessionIds) ? data.global.archivedSessionIds : []
      const merged = [...new Set([...current, ...(registry && Array.isArray(registry.archivedSessionIds) ? registry.archivedSessionIds : [])])]
      const next = merged.filter((item) => !variants.includes(item))
      data.global.archivedSessionIds = next
      fs.writeFileSync(file, JSON.stringify(data, null, 2))
    }
    if (!updated && registry && Array.isArray(registry.archivedSessionIds) && registry.archivedSessionIds.some((item) => variants.includes(item))) {
      throw new Error('live archive set was not updated')
    }
    return { unarchived: true, sessionId: id, reload: true }
  }

  async clearConversations() {
    const registry = this.ctx.get('workspaceRegistry')
    if (registry && typeof registry.list === 'function' && typeof registry.archiveSession === 'function') {
      let archived = 0
      const errors = []
      for (const ws of registry.list()) {
        const ids = [...(ws.sessionIds || [])]
        for (const id of ids) {
          try {
            await registry.archiveSession(id)
            archived += 1
          } catch (error) {
            if (typeof ws.detachSession === 'function') {
              try {
                await ws.detachSession(id)
                archived += 1
                continue
              } catch {
                /* fall through */
              }
            }
            errors.push(error instanceof Error ? error.message : String(error))
          }
        }
      }
      return { archived, errors, source: 'registry' }
    }
    return this.clearConversationsFallback()
  }

  clearConversationsFallback() {
    const file = path.join(process.env.DSH_HOME || 'E:\\DSH\\.dsh', 'storages', 'workspace.json')
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (!data.global) data.global = {}
    if (!Array.isArray(data.global.archivedSessionIds)) data.global.archivedSessionIds = []
    let archived = 0
    const tables = data.tables?.workspaces || {}
    for (const ws of Object.values(tables)) {
      const ids = Array.isArray(ws.sessionIds) ? ws.sessionIds : []
      for (const id of ids) {
        if (!data.global.archivedSessionIds.includes(id)) data.global.archivedSessionIds.push(id)
        archived += 1
      }
      ws.sessionIds = []
    }
    fs.writeFileSync(file, JSON.stringify(data, null, 2))
    return { archived, errors: [], source: 'file', reload: true }
  }

  async readRequestJson(request) {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const raw = Buffer.concat(chunks).toString('utf8').trim()
    if (!raw) return {}
    return JSON.parse(raw)
  }

  sessionIdVariants(sessionId) {
    const id = String(sessionId || '').trim()
    const ids = new Set([id])
    if (id.startsWith('session-')) ids.add(id.slice('session-'.length))
    else ids.add('session-' + id)
    return [...ids]
  }

  dshHome() {
    const candidates = [process.env.DSH_HOME, 'E:\\DSH\\.dsh', path.join(process.env.USERPROFILE || '', '.dsh')]
    for (const candidate of candidates) {
      if (candidate && fs.existsSync(candidate)) return candidate
    }
    return 'E:\\DSH\\.dsh'
  }

  findSessionDirs(sessionId) {
    const root = path.join(this.dshHome(), 'sessions')
    const found = []
    let entries = []
    try { entries = fs.readdirSync(root, { withFileTypes: true }) } catch { return found }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      for (const variant of this.sessionIdVariants(sessionId)) {
        const candidate = path.join(root, entry.name, variant)
        try {
          if (fs.statSync(candidate).isDirectory()) found.push(candidate)
        } catch { /* skip */ }
      }
    }
    return found
  }

  removeSessionDirs(sessionId) {
    const dirs = this.findSessionDirs(sessionId)
    for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true })
    return dirs.length
  }

  removeProjCacheFiles(sessionId) {
    const dir = path.join(this.dshHome(), 'storages', 'session_projcache', 'sessions')
    let n = 0
    for (const variant of this.sessionIdVariants(sessionId)) {
      const file = path.join(dir, variant + '.json')
      try {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file)
          n += 1
        }
      } catch { /* skip */ }
    }
    return n
  }

  async stripLiveStores(sessionId) {
    const variants = this.sessionIdVariants(sessionId)
    const agents = this.ctx.get('agents')
    const sessions = this.ctx.get('sessions')
    let stopped = false
    let flushed = false
    for (const variant of variants) {
      const agent = agents && typeof agents.get === 'function' ? agents.get(variant) : null
      if (agent && typeof agent.cancel === 'function') {
        try { agent.cancel({ kind: 'user' }); stopped = true } catch { /* ignore */ }
      }
      const session = sessions && typeof sessions.get === 'function' ? sessions.get(variant) : null
      if (session && sessions && typeof sessions.flush === 'function') {
        try { await sessions.flush(session); flushed = true } catch { /* ignore */ }
      }
      if (sessions && typeof sessions.delete === 'function') {
        try { sessions.delete(variant) } catch { /* ignore */ }
      }
    }
    const sd = this.ctx.get('storageDomain')
    let projRemoved = 0
    let workspaceRemoved = false
    if (sd && typeof sd.get === 'function') {
      try {
        const proj = sd.get('session_projcache')
        const table = proj && typeof proj.table === 'function' ? proj.table('sessions') : null
        if (table) {
          for (const variant of variants) {
            if (typeof table.get === 'function' && table.get(variant) !== undefined && typeof table.delete === 'function') {
              await table.delete(variant)
              projRemoved += 1
            }
          }
        }
      } catch { /* ignore */ }
      try {
        const ws = sd.get('workspace')
        const table = ws && typeof ws.table === 'function' ? ws.table('workspaces') : null
        if (table && typeof table.entries === 'function') {
          for (const [wid, rec] of table.entries()) {
            if (rec && Array.isArray(rec.sessionIds) && variants.some((v) => rec.sessionIds.includes(v))) {
              await table.put(wid, { ...rec, sessionIds: rec.sessionIds.filter((x) => !variants.includes(x)) })
              workspaceRemoved = true
            }
          }
        }
        const g = ws && ws.global
        if (g && typeof g.get === 'function' && typeof g.set === 'function') {
          const state = g.get()
          if (state && Array.isArray(state.archivedSessionIds) && variants.some((v) => state.archivedSessionIds.includes(v))) {
            await g.set({ ...state, archivedSessionIds: state.archivedSessionIds.filter((x) => !variants.includes(x)) })
            workspaceRemoved = true
          }
        }
      } catch { /* ignore */ }
    }
    return { stopped, flushed, projRemoved, workspaceRemoved }
  }

  async archiveOne(sessionId) {
    return this.deleteOne(sessionId)
  }

  async deleteOne(sessionId) {
    const id = String(sessionId || '').trim()
    if (!id) throw new Error('missing sessionId')
    const live = await this.stripLiveStores(id)
    let dirs = this.removeSessionDirs(id)
    const files = this.removeProjCacheFiles(id)
    dirs += this.removeSessionDirs(id)
    const leftover = this.findSessionDirs(id)
    if (leftover.length > 0) throw new Error('session files remain: ' + leftover.join(', '))
    if (dirs === 0 && files === 0 && !live.projRemoved && !live.workspaceRemoved) {
      throw new Error('session not found on disk: ' + id)
    }
    const registry = this.ctx.get('workspaceRegistry')
    if (registry && typeof registry.list === 'function') {
      for (const ws of registry.list()) {
        const ids = [...(ws.sessionIds || [])]
        for (const item of ids) {
          if (this.sessionIdVariants(id).includes(item) && typeof ws.detachSession === 'function') {
            try { await ws.detachSession(item) } catch { /* ignore */ }
          }
        }
      }
    }
    this.deleteOneFallback(id)
    return {
      deleted: true,
      sessionId: id,
      dirs,
      projFiles: files,
      ...live,
      reload: true,
    }
  }

  deleteOneFallback(sessionId) {
    const file = path.join(this.dshHome(), 'storages', 'workspace.json')
    if (!fs.existsSync(file)) return { removed: 0 }
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    const ids = this.sessionIdVariants(sessionId)
    let removed = 0
    const tables = data.tables?.workspaces || {}
    for (const ws of Object.values(tables)) {
      const list = Array.isArray(ws.sessionIds) ? ws.sessionIds : []
      const next = list.filter((item) => !ids.includes(item))
      removed += list.length - next.length
      ws.sessionIds = next
    }
    if (data.global && Array.isArray(data.global.archivedSessionIds)) {
      data.global.archivedSessionIds = data.global.archivedSessionIds.filter((item) => !ids.includes(item))
    }
    fs.writeFileSync(file, JSON.stringify(data, null, 2))
    return { removed }
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
      ...(localOrigin ? { 'access-control-allow-origin': origin } : {}),
    }
    const send = (status, value) => {
      response.writeHead(status, headers).end(JSON.stringify(value))
    }
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1:' + this.controlPort)
      if (request.method === 'OPTIONS' && localOrigin) {
        response.writeHead(204, {
          ...headers,
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers': 'content-type',
        }).end()
        return
      }
      if (!localOrigin && origin !== undefined) {
        send(403, { error: 'local origin only' })
        return
      }
      if (url.pathname === '/status' && request.method === 'GET') {
        send(200, await this.snapshot())
        return
      }
      if (url.pathname === '/start' && request.method === 'POST') {
        send(200, await this.start())
        return
      }
      if (url.pathname === '/stop' && request.method === 'POST') {
        send(200, await this.stop())
        return
      }
      if (url.pathname === '/conversations' && request.method === 'GET') {
        send(200, this.listConversations())
        return
      }
      if (url.pathname === '/conversations/archived' && request.method === 'GET') {
        send(200, this.listArchived())
        return
      }
      if (url.pathname === '/conversations/unarchive' && request.method === 'POST') {
        const body = await this.readRequestJson(request)
        send(200, await this.unarchiveOne(this.resolveSessionId(body.sessionId || body.id, body.title) || body.sessionId))
        return
      }
      if (url.pathname === '/conversations/archive' && request.method === 'POST') {
        const body = await this.readRequestJson(request)
        send(200, await this.archiveOne(this.resolveSessionId(body.sessionId || body.id, body.title), body.title))
        return
      }
      if (url.pathname === '/conversations/clear' && request.method === 'POST') {
        send(200, await this.clearConversations())
        return
      }
      send(404, { error: 'not found' })
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error)
      send(500, { error: this.lastError })
    }
  }
}

export default LocalQwen
