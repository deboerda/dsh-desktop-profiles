/**
 * Official Unity CLI (Production Pipeline local tools).
 * Docs: https://docs.unity.com/en-us/unity-production-pipeline/local-tools-cli
 *
 * Experimental Hub-installed `unity` binary: editors, open/build/test,
 * pipeline, command (connected Editor), mcp.
 * Distinct from Tuanjie Cowork Insight / Codely MCP.
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'

const DEFAULT_TIMEOUT_MS = 120_000
const LONG_TIMEOUT_MS = 600_000
const MAX_CHARS = 80_000

const LONG_COMMANDS = new Set(['install', 'install-modules', 'uninstall', 'upgrade', 'build', 'test', 'hub'])

export const CLI_PROMPT = [
  '### Official Unity CLI (Production Pipeline)',
  '',
  'This is **not** Tuanjie Cowork Insight. It is Unity’s experimental `unity` CLI: Hub-style editor/module/project management, batch `build`/`test`, and (with the Unity Pipeline package) `unity command` / `unity list` / `unity status` against a running Editor. Docs: https://docs.unity.com/en-us/unity-production-pipeline/local-tools-cli',
  '',
  '- `unity_cli_info` — is the binary installed? version, editors, pipeline status.',
  '- `unity_cli` — run any `unity <args>` with JSON output. Prefer this over inventing Hub `--headless` flags.',
  '- Connected-Editor automation needs `unity pipeline install` in that project, then `unity command` / `unity list`.',
  '- For scene/prefab/GUID questions keep using vfs_*. For current Selection keep using unity_share_asset (Codely Bridge). Use Unity CLI for Hub/install/open/build/test/pipeline.',
  '- If the CLI is missing, tell the user to install (Windows): `$env:UNITY_CLI_CHANNEL=\'beta\'; irm https://public-cdn.cloud.unity3d.com/hub/prod/cli/install.ps1 | iex` then reopen the terminal. Do not run that installer unless they ask.',
].join('\n')

function whichUnity() {
  try {
    const cmd = process.platform === 'win32' ? 'where.exe' : 'which'
    const arg = process.platform === 'win32' ? 'unity.exe' : 'unity'
    const r = spawnSync(cmd, [arg], { encoding: 'utf8', windowsHide: true, timeout: 5000 })
    const line = (r.stdout || '')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find((s) => s && existsSync(s))
    return line || null
  } catch {
    return null
  }
}

function candidatePaths(configured) {
  const out = []
  if (configured?.trim()) out.push(configured.trim())
  if (process.env.UNITY_CLI?.trim()) out.push(process.env.UNITY_CLI.trim())
  const home = homedir()
  const local = process.env.LOCALAPPDATA || join(home, 'AppData', 'Local')
  const roaming = process.env.APPDATA || join(home, 'AppData', 'Roaming')
  const names = process.platform === 'win32' ? ['unity.exe', 'unity.cmd'] : ['unity']
  const dirs = [
    join(local, 'unity-cli'),
    join(local, 'Programs', 'unity-cli'),
    join(local, 'Unity', 'cli'),
    join(local, 'UnityHub', 'cli'),
    join(roaming, 'UnityHub', 'cli'),
    join(home, '.unity', 'bin'),
    join(home, '.local', 'bin'),
  ]
  for (const dir of dirs) {
    for (const name of names) out.push(join(dir, name))
  }
  return out
}

export function resolveUnityCli(configured) {
  for (const p of candidatePaths(configured)) {
    if (p && existsSync(p)) return p
  }
  return whichUnity()
}

function truncate(text) {
  if (text.length <= MAX_CHARS) return text
  return `${text.slice(0, MAX_CHARS)}\n\n… truncated (${text.length} chars)`
}

function runUnityCli({ cliPath, argv, timeoutMs, signal, extraEnv }) {
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
      finish(Object.assign(new Error('unity CLI aborted'), { name: 'AbortError' }))
    }
    const child = spawn(cliPath, argv, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        UNITY_NON_INTERACTIVE: '1',
        UNITY_NO_BANNER: '1',
        UNITY_NO_CONSENT_PROMPT: '1',
        UNITY_FORMAT: extraEnv?.UNITY_FORMAT || process.env.UNITY_FORMAT || 'json',
        ...extraEnv,
      },
    })
    const timer = setTimeout(() => {
      try {
        child.kill()
      } catch {
        /* ignore */
      }
      finish(new Error(`unity CLI timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    signal?.addEventListener('abort', onAbort, { once: true })
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (c) => {
      stdout += c
    })
    child.stderr.on('data', (c) => {
      stderr += c
    })
    child.on('error', (error) => {
      finish(new Error(`Failed to start unity CLI (${cliPath}): ${error.message}`))
    })
    child.on('close', (code) => {
      finish(null, {
        exitCode: code ?? 1,
        stdout: truncate(stdout.trim()),
        stderr: truncate(stderr.trim()),
      })
    })
  })
}

function missingCliMessage() {
  return [
    'Official Unity CLI (`unity`) is not installed or not on PATH.',
    'This is Unity Production Pipeline local tools (experimental), not Tuanjie Cowork.',
    'Install (Windows PowerShell):',
    '  $env:UNITY_CLI_CHANNEL=\'beta\'; irm https://public-cdn.cloud.unity3d.com/hub/prod/cli/install.ps1 | iex',
    'Then reopen the terminal and retry `unity_cli_info`.',
    'Docs: https://docs.unity.com/en-us/unity-cli/use-unity-cli',
    'Override path with env UNITY_CLI or plugin config cliPath.',
  ].join('\n')
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

function formatResult(argv, result) {
  const lines = [
    `argv: unity ${argv.join(' ')}`,
    `exitCode: ${result.exitCode}`,
  ]
  if (result.stdout) lines.push('--- stdout ---', result.stdout)
  if (result.stderr) lines.push('--- stderr ---', result.stderr)
  return lines.join('\n')
}

export function registerUnityCliTools(ctx, deps) {
  const resolveCli = () => resolveUnityCli(deps.cliPath)

  ctx.tools.register(
    textTool({
      name: 'unity_cli_info',
      description:
        'Detect the official Unity CLI (Production Pipeline local tools: `unity` binary). Reports path, version, installed editors, and `unity status` if available. Not Tuanjie Cowork Insight.',
      parameters: {},
      timeoutMs: DEFAULT_TIMEOUT_MS,
      isConcurrencySafe: () => true,
      presentCall: () => ({ card: 'generic', kind: 'search', title: 'unity CLI info', rawInput: '' }),
      async execute(_args, exec) {
        const cliPath = resolveCli()
        if (!cliPath) return missingCliMessage()
        const lines = [`cliPath: ${cliPath}`]
        const version = await runUnityCli({
          cliPath,
          argv: ['--version'],
          timeoutMs: 20_000,
          signal: exec?.signal,
          extraEnv: { UNITY_FORMAT: 'human' },
        })
        lines.push(`--version exit ${version.exitCode}`, version.stdout || version.stderr)
        const help = await runUnityCli({
          cliPath,
          argv: ['--help'],
          timeoutMs: 20_000,
          signal: exec?.signal,
          extraEnv: { UNITY_FORMAT: 'human' },
        })
        lines.push('', '--- unity --help (head) ---', (help.stdout || help.stderr).split('\n').slice(0, 80).join('\n'))
        const editors = await runUnityCli({
          cliPath,
          argv: ['editors', '-i', '--format', 'json'],
          timeoutMs: 30_000,
          signal: exec?.signal,
        })
        lines.push('', '--- editors -i ---', editors.stdout || editors.stderr)
        const status = await runUnityCli({
          cliPath,
          argv: ['status', '--format', 'json'],
          timeoutMs: 20_000,
          signal: exec?.signal,
        })
        lines.push('', '--- status ---', status.stdout || status.stderr)
        return lines.join('\n')
      },
    }),
  )

  ctx.tools.register(
    textTool({
      name: 'unity_cli',
      description:
        'Run the official Unity CLI (`unity <args>`). Production Pipeline local tools: install/list editors, open/build/test projects, auth/license, pipeline, command (connected Editor), mcp, doctor. Adds --format json and non-interactive env unless you pass format. Project path: omit to use session Unity root when the subcommand accepts --project-path. Docs: https://docs.unity.com/en-us/unity-cli/unity-cli-reference',
      parameters: {
        args: {
          type: 'array',
          required: true,
          items: { type: 'string' },
          description:
            'Arguments after `unity`, e.g. ["editors","-i"], ["open","."], ["command"], ["pipeline","list"], ["build"], ["--help"]. Do not include the word unity itself.',
        },
        project: {
          type: 'string',
          description: 'Optional Unity project root. When set, passed as --project-path unless args already contain it.',
        },
        format: {
          type: 'string',
          description: 'Output format: json (default), ndjson, tsv, human. json is best for agents.',
        },
      },
      timeoutMs: LONG_TIMEOUT_MS,
      isConcurrencySafe: () => false,
      presentCall: (args) => ({
        card: 'generic',
        kind: 'command',
        title: Array.isArray(args.args) ? args.args.join(' ') : 'unity_cli',
        rawInput: Array.isArray(args.args) ? args.args.join(' ') : '',
      }),
      async execute(args, exec) {
        const cliPath = resolveCli()
        if (!cliPath) return missingCliMessage()
        const argv = Array.isArray(args.args) ? args.args.map((s) => String(s)) : []
        if (argv.length === 0) throw new Error('args must contain at least one Unity CLI argument (try ["--help"] or ["editors","-i"])')
        const format = (args.format || 'json').trim()
        const alreadyFormat = argv.some((a) => a === '--format' || a === '--json' || a.startsWith('--format='))
        if (format && format !== 'human' && !alreadyFormat) {
          if (format === 'json') argv.push('--format', 'json')
          else argv.push('--format', format)
        }
        let project
        try {
          project = args.project || (deps.resolveProject ? deps.resolveProject(args, exec) : undefined)
        } catch {
          project = undefined
        }
        const hasProjectFlag = argv.some((a) => a === '--project-path' || a.startsWith('--project-path='))
        const head = argv[0]
        if (head === 'open' && project && argv.length === 1) argv.push(project)
        const wantsProject =
          project &&
          !hasProjectFlag &&
          ['command', 'cmd', 'list', 'pipeline', 'pipe', 'status', 'build', 'test', 'run', 'mcp'].includes(head)
        if (wantsProject) argv.push('--project-path', project)

        const timeoutMs = LONG_COMMANDS.has(head) ? LONG_TIMEOUT_MS : DEFAULT_TIMEOUT_MS
        const result = await runUnityCli({
          cliPath,
          argv,
          timeoutMs,
          signal: exec?.signal,
          extraEnv: format === 'human' ? { UNITY_FORMAT: 'human' } : { UNITY_FORMAT: format || 'json' },
        })
        return formatResult(argv, result)
      },
    }),
  )
}
