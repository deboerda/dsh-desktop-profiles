/**
 * Translate MCP stdio Content-Length (DSH dsh-mcp-client) ↔ NDJSON
 * (Codely `unity-mcp` / FastMCP). Project path is resolved at spawn time.
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

function findUnityRoot(start) {
  if (!start) return null
  let dir = resolve(start)
  for (;;) {
    if (existsSync(join(dir, 'ProjectSettings', 'ProjectVersion.txt'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

function coworkRoot() {
  if (process.env.TUANJIE_COWORK_ROOT?.trim()) return process.env.TUANJIE_COWORK_ROOT.trim()
  const local = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local')
  return join(local, 'Programs', 'Tuanjie Cowork')
}

function resolveProject() {
  if (process.env.UNITY_PROJECT_PATH?.trim()) {
    const root = findUnityRoot(process.env.UNITY_PROJECT_PATH.trim())
    if (root) return root
  }
  const remembered = join(homedir(), '.dsh', 'unity-last-project')
  if (existsSync(remembered)) {
    const line = readFileSync(remembered, 'utf8').trim()
    const root = findUnityRoot(line)
    if (root) return root
  }
  return findUnityRoot(process.cwd())
}

const project = resolveProject()
if (!project) {
  console.error(
    'mcp-ndjson-adapter: no Unity project. Open a Unity workspace (so vfs tools remember it) or set UNITY_PROJECT_PATH.',
  )
  process.exit(1)
}

const exe = join(coworkRoot(), 'cli', 'bin', 'win32-x64', 'codely.exe')
if (!existsSync(exe)) {
  console.error(`mcp-ndjson-adapter: codely.exe not found at ${exe}`)
  process.exit(1)
}

const child = spawn(exe, ['serve', 'unity-mcp', '--stdio', '--unity-project-path', project], {
  stdio: ['pipe', 'pipe', 'pipe'],
  windowsHide: true,
  env: process.env,
})

child.stderr.pipe(process.stderr)

let outBuf = ''
child.stdout.setEncoding('utf8')
child.stdout.on('data', (chunk) => {
  outBuf += chunk
  let idx
  while ((idx = outBuf.indexOf('\n')) >= 0) {
    const line = outBuf.slice(0, idx)
    outBuf = outBuf.slice(idx + 1)
    const trimmed = line.trim()
    if (!trimmed.startsWith('{')) continue
    const payload = Buffer.from(trimmed, 'utf8')
    process.stdout.write(`Content-Length: ${payload.length}\r\n\r\n`)
    process.stdout.write(payload)
  }
})

let inBuf = Buffer.alloc(0)
process.stdin.on('data', (chunk) => {
  inBuf = Buffer.concat([inBuf, chunk])
  for (;;) {
    const headerEnd = inBuf.indexOf('\r\n\r\n')
    if (headerEnd < 0) return
    const header = inBuf.slice(0, headerEnd).toString('utf8')
    const match = header.match(/Content-Length:\s*(\d+)/i)
    if (!match) {
      inBuf = inBuf.slice(headerEnd + 4)
      continue
    }
    const len = Number(match[1])
    const start = headerEnd + 4
    if (inBuf.length < start + len) return
    const body = inBuf.slice(start, start + len).toString('utf8')
    inBuf = inBuf.slice(start + len)
    if (!child.stdin.writable) return
    child.stdin.write(`${body.trim()}\n`)
  }
})

const shutdown = () => {
  try {
    child.kill()
  } catch {
    /* ignore */
  }
}
process.stdin.on('end', shutdown)
child.on('exit', (code) => process.exit(code ?? 1))
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
