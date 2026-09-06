/**
 * Optional stdio launcher for `codely serve unity-mcp`.
 *
 * Project path is resolved at spawn time (never compiled into the profile):
 * 1. UNITY_PROJECT_PATH
 * 2. ~/.dsh/unity-last-project (written by vfs_* / unity_index tools)
 * 3. walk up from process.cwd()
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
    'unity-mcp-stdio: no Unity project. Open a Unity workspace so vfs tools can remember it, or set UNITY_PROJECT_PATH.',
  )
  process.exit(1)
}

const exe = join(coworkRoot(), 'cli', 'bin', 'win32-x64', 'codely.exe')
if (!existsSync(exe)) {
  console.error(`unity-mcp-stdio: codely.exe not found at ${exe}`)
  process.exit(1)
}

const child = spawn(exe, ['serve', 'unity-mcp', '--stdio', '--unity-project-path', project], {
  stdio: 'inherit',
  windowsHide: true,
  env: process.env,
})
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 1)
})
