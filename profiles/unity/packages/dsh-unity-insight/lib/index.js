/**
 * Unity Insight VFS tools for the dedicated DSH `unity` profile.
 *
 * Wraps the Tuanjie Cowork `unity-insight-cli`. The Unity project root is
 * resolved on every call from (1) an explicit `project` argument, (2) the
 * calling session workspace, walking up to `ProjectSettings/ProjectVersion.txt`.
 * Nothing is frozen to a single engineering path.
 *
 * @module dsh-unity-insight
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { registerLiveTools, LIVE_PROMPT } from './unity-live.js'
import { registerUnityCliTools, CLI_PROMPT } from './unity-cli.js'

export const name = 'unity-insight'
export const inject = ['tools', 'systemPrompt']

const DEFAULT_QUERY_TIMEOUT_MS = 120_000
const DEFAULT_INDEX_TIMEOUT_MS = 600_000
const MAX_OUTPUT_CHARS = 80_000
const LAST_PROJECT_FILE = join(homedir(), '.dsh', 'unity-last-project')

export const Config = z.object({
  /** Tuanjie Cowork install root; empty ⇒ %LOCALAPPDATA%/Programs/Tuanjie Cowork */
  coworkRoot: z.string().default(''),
  /** Official Unity CLI (`unity`) path; empty ⇒ PATH / common install dirs / UNITY_CLI */
  cliPath: z.string().default(''),
  /** Absolute path to unity-insight-cli.js; empty ⇒ <cliRoot>/lib/bundle/unity-insight-cli.js */
  cliScript: z.string().default(''),
  /** Node used to run the CLI; empty ⇒ Tuanjie Cowork's bundled node.exe */
  nodePath: z.string().default(''),
  queryTimeoutMs: z.number().default(DEFAULT_QUERY_TIMEOUT_MS),
  indexTimeoutMs: z.number().default(DEFAULT_INDEX_TIMEOUT_MS),
})

function defaultCoworkRoot(configured) {
  if (typeof configured === 'string' && configured.trim()) return configured.trim()
  if (process.env.TUANJIE_COWORK_ROOT?.trim()) return process.env.TUANJIE_COWORK_ROOT.trim()
  const local = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local')
  return join(local, 'Programs', 'Tuanjie Cowork')
}

function cliRoot(coworkRoot) {
  return join(coworkRoot, 'cli', 'bin', 'win32-x64')
}

function resolveNodePath(configured, coworkRoot) {
  if (typeof configured === 'string' && configured.trim()) return configured.trim()
  if (process.env.UNITY_INSIGHT_NODE?.trim()) return process.env.UNITY_INSIGHT_NODE.trim()
  return join(cliRoot(coworkRoot), 'node.exe')
}

function resolveCliScript(configured, coworkRoot) {
  if (typeof configured === 'string' && configured.trim()) return configured.trim()
  if (process.env.UNITY_INSIGHT_CLI?.trim()) return process.env.UNITY_INSIGHT_CLI.trim()
  return join(cliRoot(coworkRoot), 'lib', 'bundle', 'unity-insight-cli.js')
}

function sessionCwd(exec) {
  const cwd = exec?.agent?.session?.header?.cwd
  return typeof cwd === 'string' && cwd.trim() ? cwd.trim() : undefined
}

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

function rememberProject(projectRoot) {
  try {
    mkdirSync(dirname(LAST_PROJECT_FILE), { recursive: true })
    writeFileSync(LAST_PROJECT_FILE, `${projectRoot}\n`, 'utf8')
  } catch {
    /* non-fatal */
  }
}

function readEditorVersion(projectRoot) {
  try {
    const text = readFileSync(join(projectRoot, 'ProjectSettings', 'ProjectVersion.txt'), 'utf8')
    return text.match(/m_EditorVersion:\s*(.+)\s*$/m)?.[1]?.trim() ?? null
  } catch {
    return null
  }
}

function notUnityProjectMessage(start) {
  return [
    'Current workspace is not a Unity / Tuanjie project.',
    start ? `Looked upward from: ${start}` : 'No session workspace cwd was available.',
    'Open the new project root in this DSH session (the folder that contains ProjectSettings/ProjectVersion.txt),',
    'or pass `project` pointing at that root. Do not hard-code a single project path in the profile.',
  ].join('\n')
}

function resolveProject(args, exec) {
  const explicit = typeof args.project === 'string' ? args.project.trim() : ''
  if (explicit) {
    const root = findUnityRoot(explicit)
    if (!root) {
      throw new Error(
        `Not a Unity / Tuanjie project: ${explicit}. Need ProjectSettings/ProjectVersion.txt (the folder itself or a parent).`,
      )
    }
    rememberProject(root)
    return root
  }
  const cwd = sessionCwd(exec)
  const root = findUnityRoot(cwd)
  if (!root) throw new Error(notUnityProjectMessage(cwd))
  rememberProject(root)
  return root
}

function truncate(text) {
  if (text.length <= MAX_OUTPUT_CHARS) return text
  return `${text.slice(0, MAX_OUTPUT_CHARS)}\n\n… truncated (${text.length} chars total)`
}

function runCli({ nodePath, cliScript, argv, timeoutMs, signal }) {
  return new Promise((resolvePromise, reject) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    const finish = (error, value) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      if (error) reject(error)
      else resolvePromise(value)
    }
    const onAbort = () => {
      try {
        child.kill()
      } catch {
        /* ignore */
      }
      finish(Object.assign(new Error('unity-insight aborted'), { name: 'AbortError' }))
    }

    const child = spawn(nodePath, [cliScript, ...argv], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    })
    const timer = setTimeout(() => {
      try {
        child.kill()
      } catch {
        /* ignore */
      }
      finish(new Error(`unity-insight-cli timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    signal?.addEventListener('abort', onAbort, { once: true })
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', (error) => {
      finish(new Error(`Failed to start unity-insight-cli (${nodePath}): ${error.message}`))
    })
    child.on('close', (code) => {
      const out = stdout.trim()
      const err = stderr.trim()
      if (code === 0) {
        finish(null, truncate(out || err || '(no output)'))
        return
      }
      const detail = [out, err].filter(Boolean).join('\n\n') || `exit ${code}`
      finish(new Error(`unity-insight-cli failed (exit ${code}):\n${truncate(detail)}`))
    })
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

const PROMPT = [
  '### Unity / Tuanjie project tools (this profile)',
  '',
  'This DSH profile is for Unity / Tuanjie engine work. Prefer the VFS tools over raw `read`/`grep`/`glob` when the question is about scenes, prefabs, GameObjects, components, materials, GUID references, or script↔component edges.',
  '',
  'Project root is **never frozen**:',
  '- Omit `project` to use the current session workspace, walking up until `ProjectSettings/ProjectVersion.txt` is found.',
  '- A brand-new project only needs the DSH workspace pointed at that new root (or pass `project`).',
  '- Several Unity projects ⇒ several sessions, or pass `project` to the nested engineering folder.',
  '',
  'Workflow:',
  '1. `unity_project_info` — confirm the detected root, editor version, CLI, and index status.',
  '2. If there is no index, `unity_index` with action `build` (slow, once per project). Later use `sync`.',
  '3. Explore with `vfs_ls` / `vfs_glob` / `vfs_read` / `vfs_grep` / `vfs_refs`. Paths are **VFS paths** (GameObject hierarchy inside a scene/prefab), not always disk paths. `vfs_read` on a `.meta` or `:/.content` node is how you inspect YAML without grepping GUID soup.',
  '4. Ordinary C# edits still use `read` / `edit` / `pwsh`. Do not rewrite Unity YAML by guesswork; follow existing `.meta` GUIDs.',
  '5. Insight VFS works **without** the editor. Live selection share / focus editor need Tuanjie open (see Live Unity Editor section).',
].join('\n')

function handleInspect(req, res) {
  const send = (status, obj) => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(obj))
  }
  try {
    const url = new URL(req.url || '/', 'http://unity-insight.local')
    const cwd = url.searchParams.get('cwd') || ''
    const root = findUnityRoot(cwd)
    if (!root) {
      send(200, { detected: false, root: '', name: '', version: '' })
      return
    }
    rememberProject(root)
    const cleaned = root.replace(/[\\/]+$/, '')
    const slash = Math.max(cleaned.lastIndexOf('/'), cleaned.lastIndexOf('\\'))
    send(200, {
      detected: true,
      root: cleaned,
      name: slash >= 0 ? cleaned.slice(slash + 1) : cleaned,
      version: readEditorVersion(root) || '',
    })
  } catch {
    send(200, { detected: false, root: '', name: '', version: '' })
  }
}

export function apply(ctx, config = {}) {
  const coworkRoot = defaultCoworkRoot(config.coworkRoot)
  const nodePath = resolveNodePath(config.nodePath, coworkRoot)
  const cliScript = resolveCliScript(config.cliScript, coworkRoot)
  const codelyPath = join(cliRoot(coworkRoot), 'codely.exe')
  const queryTimeoutMs = config.queryTimeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS
  const indexTimeoutMs = config.indexTimeoutMs ?? DEFAULT_INDEX_TIMEOUT_MS

  const ensureCli = () => {
    if (!existsSync(nodePath)) {
      throw new Error(
        `Tuanjie Cowork node not found at "${nodePath}". Install Tuanjie Cowork, or set TUANJIE_COWORK_ROOT / unity-insight config.nodePath.`,
      )
    }
    if (!existsSync(cliScript)) {
      throw new Error(
        `unity-insight-cli.js not found at "${cliScript}". Install Tuanjie Cowork, or set UNITY_INSIGHT_CLI / unity-insight config.cliScript.`,
      )
    }
  }

  const run = (argv, timeoutMs, exec) => {
    ensureCli()
    return runCli({
      nodePath,
      cliScript,
      argv,
      timeoutMs,
      signal: exec?.signal,
    })
  }

  if (typeof ctx.inject === 'function') {
    ctx.inject(['webServer'], (webCtx) => {
      webCtx.effect(
        () =>
          webCtx.webServer.register({
            kind: 'exact',
            path: '/unity-insight/inspect',
            handler: handleInspect,
          }),
        'unity-insight: inspect route',
      )
    })
  } else {
    const webServer = ctx.get('webServer')
    if (webServer) {
      ctx.effect(
        () =>
          webServer.register({
            kind: 'exact',
            path: '/unity-insight/inspect',
            handler: handleInspect,
          }),
        'unity-insight: inspect route',
      )
    }
  }

  ctx.systemPrompt.section({
    name: 'tool:unity-insight',
    order: 108,
    text: PROMPT,
  })
  ctx.systemPrompt.section({
    name: 'tool:unity-live',
    order: 109,
    text: LIVE_PROMPT,
  })
  ctx.systemPrompt.section({
    name: 'tool:unity-cli',
    order: 110,
    text: CLI_PROMPT,
  })
  registerLiveTools(ctx, { resolveProject, codelyPath })
  registerUnityCliTools(ctx, { resolveProject, cliPath: config.cliPath })

  ctx.tools.register(
    textTool({
      name: 'unity_project_info',
      description:
        'Detect the Unity/Tuanjie project root for this session (walk up from workspace or optional `project`), report editor version, Insight CLI paths, and index status. Use first when starting Unity work or after switching to a new project.',
      parameters: {
        project: {
          type: 'string',
          description:
            'Optional Unity project root or any folder inside it. Omit to use the current session workspace.',
        },
      },
      timeoutMs: queryTimeoutMs,
      isConcurrencySafe: () => true,
      presentCall: (args) => ({
        card: 'generic',
        kind: 'search',
        title: args.project || 'current workspace',
        rawInput: args.project || '',
      }),
      async execute(args, exec) {
        const cwd = sessionCwd(exec)
        let projectRoot = null
        let detectError = null
        try {
          projectRoot = resolveProject(args, exec)
        } catch (error) {
          detectError = error instanceof Error ? error.message : String(error)
        }

        const lines = [
          `coworkRoot: ${coworkRoot}`,
          `nodePath: ${nodePath}${existsSync(nodePath) ? '' : '  (MISSING)'}`,
          `cliScript: ${cliScript}${existsSync(cliScript) ? '' : '  (MISSING)'}`,
          `sessionCwd: ${cwd || '(none)'}`,
          `lastRemembered: ${existsSync(LAST_PROJECT_FILE) ? readFileSync(LAST_PROJECT_FILE, 'utf8').trim() : '(none)'}`,
        ]
        if (!projectRoot) {
          return `${lines.join('\n')}\n\n${detectError}`
        }
        lines.push(`projectRoot: ${projectRoot}`)
        lines.push(`editorVersion: ${readEditorVersion(projectRoot) || '(unknown)'}`)
        const status = await run(['index', 'status', '--project', projectRoot], queryTimeoutMs, exec)
        return `${lines.join('\n')}\n\n--- index status ---\n${status}`
      },
    }),
  )

  ctx.tools.register(
    textTool({
      name: 'unity_index',
      description:
        'Build, incrementally sync, or show the Unity Insight SQLite index for the current (or given) Unity project. New projects need `build` once; afterwards prefer `sync`. Does not lock the profile to one project.',
      parameters: {
        action: {
          type: 'string',
          enum: ['status', 'build', 'sync'],
          required: true,
          description: 'status = metadata; build = full index; sync = incremental update.',
        },
        project: {
          type: 'string',
          description: 'Optional Unity project root or a folder inside it. Omit to use the session workspace.',
        },
        paths: {
          type: 'string',
          description: 'Optional comma-separated project-relative paths for sync only.',
        },
        includePackages: {
          type: 'boolean',
          description: 'Whether build/sync indexes package contents (default true).',
        },
      },
      timeoutMs: indexTimeoutMs,
      isConcurrencySafe: (args) => args.action === 'status',
      presentCall: (args) => ({
        card: 'generic',
        kind: 'command',
        title: `unity_index ${args.action}`,
        rawInput: args.project || '',
      }),
      async execute(args, exec) {
        const project = resolveProject(args, exec)
        const argv = ['index', args.action, '--project', project]
        if (args.action !== 'status' && args.includePackages === false) argv.push('--no-packages')
        if (args.action === 'sync' && typeof args.paths === 'string' && args.paths.trim()) {
          argv.push('--paths', args.paths.trim())
        }
        const timeout = args.action === 'status' ? queryTimeoutMs : indexTimeoutMs
        return run(argv, timeout, exec)
      },
    }),
  )

  ctx.tools.register(
    textTool({
      name: 'vfs_ls',
      description:
        'List Unity Insight VFS children under a virtual path (Assets, a scene, a prefab, a GameObject). Not a filesystem listing — GameObjects and components appear as nodes. Omit `project` to use the current Unity workspace.',
      parameters: {
        path: {
          type: 'string',
          required: true,
          description: 'VFS path, e.g. Assets/ or Assets/Scenes/Main.unity:/Hero',
        },
        depth: {
          type: 'number',
          description: 'Recursion depth (default 1).',
        },
        show_type: {
          type: 'string',
          description: 'Optional child type filter: GameObject|Component|Prefab|...|ALL',
        },
        output_format: {
          type: 'string',
          description: 'flat or grouped_list',
        },
        project: { type: 'string', description: 'Optional Unity project root or a folder inside it.' },
      },
      timeoutMs: queryTimeoutMs,
      isConcurrencySafe: () => true,
      presentCall: (args) => ({ card: 'generic', kind: 'search', title: args.path, rawInput: args.path }),
      async execute(args, exec) {
        const project = resolveProject(args, exec)
        const argv = ['vfs_ls', '--project', project, '--path', args.path]
        if (args.depth != null) argv.push('--depth', String(args.depth))
        if (args.show_type) argv.push('--show_type', args.show_type)
        if (args.output_format) argv.push('--output_format', args.output_format)
        return run(argv, queryTimeoutMs, exec)
      },
    }),
  )

  ctx.tools.register(
    textTool({
      name: 'vfs_glob',
      description:
        'Match Unity Insight VFS entries by virtual-path glob. Use to find scenes, prefabs, materials, scripts as VFS nodes. Omit `project` to use the current Unity workspace.',
      parameters: {
        pattern: { type: 'string', required: true, description: 'Glob pattern, e.g. **/*.prefab or **/Hero*' },
        path: { type: 'string', description: 'Optional VFS scope path.' },
        type: { type: 'string', description: 'Optional type filter (default ALL).' },
        limit: { type: 'number', description: 'Maximum matches (default 100).' },
        ignore_case: { type: 'boolean', description: 'Case-insensitive match (default false).' },
        output_format: { type: 'string', description: 'flat or grouped_list' },
        project: { type: 'string', description: 'Optional Unity project root or a folder inside it.' },
      },
      timeoutMs: queryTimeoutMs,
      isConcurrencySafe: () => true,
      presentCall: (args) => ({ card: 'generic', kind: 'search', title: args.pattern, rawInput: args.pattern }),
      async execute(args, exec) {
        const project = resolveProject(args, exec)
        const argv = ['vfs_glob', '--project', project, '--pattern', args.pattern]
        if (args.path) argv.push('--path', args.path)
        if (args.type) argv.push('--type', args.type)
        if (args.limit != null) argv.push('--limit', String(args.limit))
        if (args.ignore_case) argv.push('--ignore_case')
        if (args.output_format) argv.push('--output_format', args.output_format)
        return run(argv, queryTimeoutMs, exec)
      },
    }),
  )

  ctx.tools.register(
    textTool({
      name: 'vfs_read',
      description:
        'Read a Unity Insight VFS node: .meta, indexed content, GameObject/component payload, or :/.content full text. Prefer this over raw file read for YAML assets. Omit `project` to use the current Unity workspace.',
      parameters: {
        path: {
          type: 'string',
          required: true,
          description: 'VFS path to read. Suffix :/.content or :/.meta when needed.',
        },
        depth: { type: 'number', description: 'For node paths, expand children 0–5.' },
        project: { type: 'string', description: 'Optional Unity project root or a folder inside it.' },
      },
      timeoutMs: queryTimeoutMs,
      isConcurrencySafe: () => true,
      presentCall: (args) => ({ card: 'generic', kind: 'read', title: args.path, rawInput: args.path }),
      async execute(args, exec) {
        const project = resolveProject(args, exec)
        const argv = ['vfs_read', '--project', project, '--path', args.path]
        if (args.depth != null) argv.push('--depth', String(args.depth))
        return run(argv, queryTimeoutMs, exec)
      },
    }),
  )

  ctx.tools.register(
    textTool({
      name: 'vfs_grep',
      description:
        'Search Unity Insight VFS entries (including serialized YAML fields and indexed text) under a virtual scope. Better than filesystem grep for GUID / component queries. Omit `project` to use the current Unity workspace.',
      parameters: {
        pattern: { type: 'string', required: true, description: 'Regex (vfs_grep) to search.' },
        path: { type: 'string', description: 'Optional VFS scope path.' },
        include: { type: 'string', description: 'Optional glob filter on paths.' },
        type: { type: 'string', description: 'Optional type filter (default ALL).' },
        limit: { type: 'number', description: 'Maximum matches (default 100).' },
        ignore_case: { type: 'boolean', description: 'Case-insensitive (default false).' },
        project: { type: 'string', description: 'Optional Unity project root or a folder inside it.' },
      },
      timeoutMs: queryTimeoutMs,
      isConcurrencySafe: () => true,
      presentCall: (args) => ({ card: 'generic', kind: 'search', title: args.pattern, rawInput: args.pattern }),
      async execute(args, exec) {
        const project = resolveProject(args, exec)
        const argv = ['vfs_grep', '--project', project, '--pattern', args.pattern]
        if (args.path) argv.push('--path', args.path)
        if (args.include) argv.push('--include', args.include)
        if (args.type) argv.push('--type', args.type)
        if (args.limit != null) argv.push('--limit', String(args.limit))
        if (args.ignore_case) argv.push('--ignore_case')
        return run(argv, queryTimeoutMs, exec)
      },
    }),
  )

  ctx.tools.register(
    textTool({
      name: 'vfs_refs',
      description:
        'Query Unity Insight references or C# calls for a VFS path (in/out). Use to see who references a material/prefab/script, or what a GameObject/script points at. Omit `project` to use the current Unity workspace.',
      parameters: {
        path: { type: 'string', required: true, description: 'VFS path of the source node or .cs script.' },
        direction: {
          type: 'string',
          description: 'in or out. Ignored for some .cs script paths (call graph).',
        },
        filter: { type: 'string', description: 'Optional direction alias (in|out); must match direction if both set.' },
        target_type: {
          type: 'string',
          description: 'Returned-side type filter: GameObject|Component|Material|...|ALL',
        },
        project: { type: 'string', description: 'Optional Unity project root or a folder inside it.' },
      },
      timeoutMs: queryTimeoutMs,
      isConcurrencySafe: () => true,
      presentCall: (args) => ({ card: 'generic', kind: 'search', title: args.path, rawInput: args.path }),
      async execute(args, exec) {
        const project = resolveProject(args, exec)
        const argv = ['vfs_refs', '--project', project, '--path', args.path]
        if (args.direction) argv.push('--direction', args.direction)
        if (args.filter) argv.push('--filter', args.filter)
        if (args.target_type) argv.push('--target_type', args.target_type)
        return run(argv, queryTimeoutMs, exec)
      },
    }),
  )
}
