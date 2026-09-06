/**
 * Live Unity Editor bridge via `codely serve unity-mcp` (NDJSON MCP).
 * Implements Cowork's "share current Unity asset" and "focus editor window".
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, basename } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'

const LAST_SELECTION_FILE = join(homedir(), '.dsh', 'unity-last-selection.json')
const MAX_ASSET_CHARS = 24_000
const MCP_CALL_TIMEOUT_MS = 20_000

export const LIVE_BRIDGE_TOOLS = [
  'unity_editor',
  'unity_scene',
  'unity_gameobject',
  'unity_asset',
  'unity_package',
  'unity_bake',
  'unity_menu',
  'unity_screenshot',
  'unity_gameview',
  'unity_job',
  'unity_dialog',
  'execute_custom_tool',
  'exec_editor_script',
  'exec_runtime_script',
  'unity_wiki',
]

function rememberSelection(payload) {
  try {
    mkdirSync(dirname(LAST_SELECTION_FILE), { recursive: true })
    writeFileSync(LAST_SELECTION_FILE, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  } catch {
    /* ignore */
  }
}

function readHeartbeat(projectRoot) {
  const path = join(projectRoot, '.com-unity-codely.json')
  if (!existsSync(path)) return { path, connected: false, reason: 'missing heartbeat file (Unity/Codely bridge not running)' }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'))
    const ageMs = raw.last_heartbeat ? Date.now() - Date.parse(raw.last_heartbeat) : null
    const stale = ageMs != null && Number.isFinite(ageMs) && ageMs > 15_000
    return {
      path,
      connected: raw.reason === 'ready' && !stale,
      stale,
      ageMs,
      unityPort: raw.unity_port,
      streamPort: raw.stream_port,
      reason: raw.reason,
      lastHeartbeat: raw.last_heartbeat,
      projectPath: raw.project_path,
    }
  } catch (error) {
    return { path, connected: false, reason: error instanceof Error ? error.message : String(error) }
  }
}

function readTextFile(path, limit) {
  if (!path || !existsSync(path)) return null
  try {
    const st = statSync(path)
    if (!st.isFile()) return null
    if (st.size > 512 * 1024) return `(binary or large file, ${st.size} bytes — not inlined)`
    const text = readFileSync(path, 'utf8')
    if (/[\x00-\x08]/.test(text.slice(0, 200))) return `(binary file, ${st.size} bytes — not inlined)`
    return text.length > limit ? `${text.slice(0, limit)}\n\n… truncated (${text.length} chars)` : text
  } catch {
    return null
  }
}

function parseMcpText(result) {
  const content = result?.content
  if (!Array.isArray(content)) return result
  const text = content.map((c) => (c && c.type === 'text' ? c.text : '')).join('\n').trim()
  if (!text) return result
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text }
  }
}

function createMcpSession(codelyPath) {
  let child = null
  let projectRoot = null
  let buf = ''
  let nextId = 1
  const pending = new Map()
  let ready = null

  function send(obj) {
    if (!child?.stdin?.writable) throw new Error('Unity MCP stdin is closed')
    child.stdin.write(`${JSON.stringify(obj)}\n`)
  }

  function onStdout(chunk) {
    buf += chunk
    let idx
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim()
      buf = buf.slice(idx + 1)
      if (!line.startsWith('{')) continue
      let msg
      try {
        msg = JSON.parse(line)
      } catch {
        continue
      }
      if (msg.id != null && pending.has(msg.id)) {
        const waiter = pending.get(msg.id)
        pending.delete(msg.id)
        waiter(msg)
      }
    }
  }

  function stop() {
    for (const waiter of pending.values()) waiter({ error: { message: 'Unity MCP stopped' } })
    pending.clear()
    if (child) {
      try {
        child.kill()
      } catch {
        /* ignore */
      }
      child = null
    }
    projectRoot = null
    ready = null
    buf = ''
  }

  async function ensure(root, signal) {
    if (child && projectRoot === root && child.exitCode == null) return
    stop()
    projectRoot = root
    child = spawn(codelyPath, ['serve', 'unity-mcp', '--stdio', '--unity-project-path', root], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    })
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', onStdout)
    child.stderr.on('data', () => {})
    child.on('exit', () => {
      if (projectRoot === root) {
        child = null
        ready = null
      }
    })
    if (signal) {
      const onAbort = () => stop()
      signal.addEventListener('abort', onAbort, { once: true })
    }
    const init = await call('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'dsh-unity-insight', version: '0.1.0' },
    })
    if (init.error) throw new Error(init.error.message || 'Unity MCP initialize failed')
    send({ jsonrpc: '2.0', method: 'notifications/initialized' })
    ready = root
  }

  function call(method, params, timeoutMs = MCP_CALL_TIMEOUT_MS) {
    const id = nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`Unity MCP ${method} timed out after ${timeoutMs}ms (is Tuanjie/Unity open with Codely Bridge?)`))
      }, timeoutMs)
      pending.set(id, (msg) => {
        clearTimeout(timer)
        resolve(msg)
      })
      try {
        send({ jsonrpc: '2.0', id, method, params })
      } catch (error) {
        clearTimeout(timer)
        pending.delete(id)
        reject(error)
      }
    })
  }

  async function toolsCall(name, args, timeoutMs) {
    if (!ready) throw new Error('Unity MCP is not initialized')
    const msg = await call('tools/call', { name, arguments: args || {} }, timeoutMs)
    if (msg.error) throw new Error(msg.error.message || `Unity MCP tool ${name} failed`)
    return parseMcpText(msg.result)
  }

  return { ensure, toolsCall, stop }
}

function focusUnityWindow(projectRoot) {
  const hint = projectRoot ? basename(projectRoot) : 'Tuanjie'
  const script = [
    '$ErrorActionPreference = "SilentlyContinue"',
    `$hint = ${JSON.stringify(hint)}`,
    '$shell = New-Object -ComObject WScript.Shell',
    '$names = @($hint, "Tuanjie", "Unity")',
    'foreach ($n in $names) { if ($shell.AppActivate($n)) { "activated:$n"; exit 0 } }',
    'Get-Process -Name tuanjie,Unity,Tuanjie -ErrorAction SilentlyContinue | ForEach-Object {',
    '  if ($_.MainWindowTitle -and $shell.AppActivate($_.MainWindowTitle)) { "activated-title:$($_.MainWindowTitle)"; exit 0 }',
    '}',
    '"not-activated"',
  ].join('; ')
  return new Promise((resolve) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-Command', script], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (c) => {
      out += c
    })
    child.on('close', () => resolve(out.trim() || 'not-activated'))
    child.on('error', () => resolve('powershell-failed'))
  })
}

function textTool(options) {
  return defineTool({
    ...options,
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: String(value ?? '') }],
    },
  })
}

export function registerLiveTools(ctx, deps) {
  const session = createMcpSession(deps.codelyPath)

  if (typeof ctx.effect === 'function') {
    ctx.effect(() => () => session.stop(), 'dsh-unity-insight: stop Unity MCP')
  }

  async function withBridge(args, exec, fn) {
    const project = deps.resolveProject(args || {}, exec)
    await session.ensure(project, exec?.signal)
    return fn(project)
  }

  ctx.tools.register(
    textTool({
      name: 'unity_live_status',
      description:
        'Check whether Tuanjie/Unity Codely Bridge is connected (heartbeat + MCP). Use before sharing the current asset or focusing the editor.',
      parameters: {
        project: { type: 'string', description: 'Optional Unity project root or a folder inside it.' },
      },
      timeoutMs: MCP_CALL_TIMEOUT_MS,
      isConcurrencySafe: () => true,
      presentCall: () => ({ card: 'generic', kind: 'search', title: 'unity live status', rawInput: '' }),
      async execute(args, exec) {
        const project = deps.resolveProject(args, exec)
        const hb = readHeartbeat(project)
        let mcp = 'not started'
        try {
          await session.ensure(project, exec?.signal)
          const root = await session.toolsCall('unity_editor', { action: 'get_project_root' }, 12_000)
          mcp = `connected ${JSON.stringify(root)}`
        } catch (error) {
          mcp = error instanceof Error ? error.message : String(error)
        }
        return [
          `projectRoot: ${project}`,
          `heartbeat.connected: ${hb.connected}`,
          `heartbeat.reason: ${hb.reason}`,
          `heartbeat.last: ${hb.lastHeartbeat || '(none)'} ageMs=${hb.ageMs ?? '(n/a)'}`,
          `unityPort: ${hb.unityPort ?? '(none)'} streamPort: ${hb.streamPort ?? '(none)'}`,
          `mcp: ${mcp}`,
          `codely: ${deps.codelyPath}${existsSync(deps.codelyPath) ? '' : '  (MISSING)'}`,
        ].join('\n')
      },
    }),
  )

  ctx.tools.register(
    textTool({
      name: 'unity_share_asset',
      description:
        'Read the Unity Editor current selection and share it as Cowork-style current context (active asset / GameObject, GUID, file + .meta). Equivalent to “正在与 Cowork 共享 Unity 资产”. Requires Tuanjie/Unity open with Codely Bridge. Call this when the user talks about the currently selected asset.',
      parameters: {
        project: { type: 'string', description: 'Optional Unity project root or a folder inside it.' },
        includeContent: {
          type: 'boolean',
          description: 'Inline asset/.meta text when it is a small text file (default true).',
        },
      },
      timeoutMs: MCP_CALL_TIMEOUT_MS,
      isConcurrencySafe: () => true,
      presentCall: () => ({ card: 'generic', kind: 'read', title: 'share Unity selection', rawInput: '' }),
      async execute(args, exec) {
        return withBridge(args, exec, async (project) => {
          const result = await session.toolsCall('unity_editor', { action: 'get_selection' })
          const data = result?.data || result
          rememberSelection({ project, at: new Date().toISOString(), data })
          const lines = [
            '正在与 DSH 共享 Unity 当前选择（取消：忽略本上下文即可）。',
            `project: ${project}`,
            `activeObject: ${data.activeObject ?? '(none)'}`,
            `activeAsset: ${data.activeAsset ?? '(none)'}`,
            `activeGameObject: ${data.activeGameObject ?? '(none)'}`,
            `assetPaths: ${(data.assetPaths || []).join(', ') || '(none)'}`,
            `assetGUIDs: ${(data.assetGUIDs || []).join(', ') || '(none)'}`,
          ]
          if (Array.isArray(data.gameObjects) && data.gameObjects.length) {
            lines.push('gameObjects:')
            for (const go of data.gameObjects) lines.push(`  - ${go.path || go.name} id=${go.instanceID}`)
          }
          const include = args.includeContent !== false
          const assetPath = data.activeAsset
          if (include && assetPath) {
            const body = readTextFile(assetPath, MAX_ASSET_CHARS)
            const meta = readTextFile(`${assetPath}.meta`, 8_000)
            if (body) {
              lines.push('', `@CurrentContext ${assetPath}`, '--- asset ---', body)
            }
            if (meta) lines.push('', '--- .meta ---', meta)
          }
          return lines.join('\n')
        })
      },
    }),
  )

  ctx.tools.register(
    textTool({
      name: 'unity_focus_editor',
      description:
        'Bring the Tuanjie/Unity Editor to the foreground (Cowork: “已连接，点击唤起编辑器窗口”). Optionally focus an inner window: Scene, Inspector, Hierarchy, Project, Console, Game.',
      parameters: {
        windowType: {
          type: 'string',
          description: 'Inner Unity window to focus (default Scene). Common: Scene, Inspector, Hierarchy, Project, Console, Game.',
        },
        project: { type: 'string', description: 'Optional Unity project root or a folder inside it.' },
      },
      timeoutMs: MCP_CALL_TIMEOUT_MS,
      isConcurrencySafe: () => false,
      presentCall: (args) => ({
        card: 'generic',
        kind: 'command',
        title: `focus ${args.windowType || 'Unity'}`,
        rawInput: args.windowType || '',
      }),
      async execute(args, exec) {
        const project = deps.resolveProject(args, exec)
        let bridge = null
        try {
          await session.ensure(project, exec?.signal)
          bridge = await session.toolsCall('unity_editor', {
            action: 'focus_window',
            windowType: args.windowType || 'Scene',
          })
        } catch (error) {
          bridge = { error: error instanceof Error ? error.message : String(error) }
        }
        const osFocus = await focusUnityWindow(project)
        return [
          `project: ${project}`,
          `osFocus: ${osFocus}`,
          `unity_editor.focus_window: ${JSON.stringify(bridge)}`,
        ].join('\n')
      },
    }),
  )

  ctx.tools.register(
    textTool({
      name: 'unity_bridge',
      description:
        'Call a live Unity MCP tool through the Codely Bridge (editor must be open). Tools: unity_editor, unity_scene, unity_gameobject, unity_asset, unity_package, unity_bake, unity_menu, unity_screenshot, unity_gameview, unity_job, unity_dialog, execute_custom_tool, exec_editor_script, exec_runtime_script, unity_wiki. Prefer unity_share_asset / unity_focus_editor / vfs_* for the common cases.',
      parameters: {
        tool: {
          type: 'string',
          required: true,
          description: `MCP tool name. One of: ${LIVE_BRIDGE_TOOLS.join(', ')}`,
        },
        mcpArgs: {
          type: 'object',
          additionalProperties: true,
          description: 'Arguments object for that MCP tool (e.g. { "action": "get_state" }).',
        },
        project: { type: 'string', description: 'Optional Unity project root or a folder inside it.' },
      },
      timeoutMs: 120_000,
      isConcurrencySafe: () => false,
      presentCall: (args) => ({
        card: 'generic',
        kind: 'command',
        title: args.tool || 'unity_bridge',
        rawInput: args.tool || '',
      }),
      async execute(args, exec) {
        const name = String(args.tool || '').trim()
        if (!LIVE_BRIDGE_TOOLS.includes(name)) {
          throw new Error(`Unknown Unity MCP tool "${name}". Valid: ${LIVE_BRIDGE_TOOLS.join(', ')}`)
        }
        return withBridge(args, exec, async () => {
          const result = await session.toolsCall(name, args.mcpArgs || {}, 120_000)
          return typeof result === 'string' ? result : JSON.stringify(result, null, 2)
        })
      },
    }),
  )
}

export const LIVE_PROMPT = [
  '### Live Unity Editor (Codely Bridge)',
  '',
  'When Tuanjie/Unity is open with the Codely Bridge package, this profile can share the **current Editor selection** and **focus the editor window** — the same two actions as Cowork’s asset chip and green Unity button.',
  '',
  '- `unity_live_status` — is the editor connected?',
  '- `unity_share_asset` — “正在与 Cowork 共享 Unity 资产”: dump the current Selection (asset path, GUID, GameObject path, file + .meta). Call this when the user says 当前资源 / 选中的 / 这个资产, or after they click share in Unity.',
  '- `unity_focus_editor` — “已连接，点击唤起编辑器窗口”: bring Unity to the foreground and focus Scene (or Inspector/Hierarchy/…). ',
  '- `unity_bridge` — other live tools (play/stop, hierarchy, screenshots, C# scripts). Do not use it when vfs_* is enough.',
  '',
  'If the bridge is down, say so and fall back to vfs_* / files. Do not invent a selection.',
].join('\n')
