/**
 * Default Tabbit AI aggregated search for DeepSeek Harness.
 *
 * Registers `tabbit_search` and a short system-prompt policy. Does not start
 * Tabbit until a tool call; no DEEPSEEK_API_KEY required.
 *
 * @module dsh-tabbit-search
 */
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { access } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'tabbit-search'

/** Hard deps: tool registry + system prompt assembly. */
export const inject = ['tools', 'systemPrompt']

const DEFAULT_MAX_WAIT_MS = 90_000
const DEFAULT_TOOL_TIMEOUT_MS = 120_000
const DEFAULT_NEWTAB_URL = 'https://web.tabbit.com/newtab'

/** Schemastery config for the host row. */
export const Config = z.object({
  /** Absolute path to tabbit-cli; empty ⇒ platform default. */
  cliPath: z.string().default(''),
  /** New-tab AI search URL. */
  newtabUrl: z.string().default(DEFAULT_NEWTAB_URL),
  /** How long one search may wait for the answer to settle. */
  maxWaitMs: z.number().default(DEFAULT_MAX_WAIT_MS),
  /** Cooperative tool timeout budget (ms). */
  toolTimeoutMs: z.number().default(DEFAULT_TOOL_TIMEOUT_MS),
  /** Keep Tabbit session tabs after finish (recommended). */
  keepTabs: z.boolean().default(true),
  /** Task name prefix; a short unique suffix is appended per call. */
  taskPrefix: z.string().default('dsh-tabbit-search'),
})

/**
 * Resolve the stable Tabbit LocalAgent launcher path for this OS.
 * @param {string | undefined} configured
 * @returns {string}
 */
function defaultCliPath(configured) {
  if (typeof configured === 'string' && configured.trim().length > 0) {
    return configured.trim()
  }
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local')
    return join(local, 'Tabbit', 'LocalAgent', 'bin', 'tabbit-cli.exe')
  }
  return join(homedir(), '.local', 'bin', 'tabbit-cli')
}

/**
 * Build the Playwright evaluation program for one query.
 * @param {{ query: string, newtabUrl: string, maxWaitMs: number }} opts
 * @returns {string}
 */
function buildSearchProgram(opts) {
  const queryJson = JSON.stringify(opts.query)
  const urlJson = JSON.stringify(opts.newtabUrl)
  const maxWait = Number(opts.maxWaitMs) || DEFAULT_MAX_WAIT_MS
  return `
const query = ${queryJson};
const newtabUrl = ${urlJson};
const maxWaitMs = ${maxWait};
const page = await context.newPage();
await page.goto(newtabUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(1000);
const box = page.getByRole("textbox").first();
await expect(box).toBeVisible({ timeout: 20000 });
await box.click();
await box.fill(query);
await page.keyboard.press("Enter");
await page.waitForURL(/web\\.tabbit\\.com\\/session\\//, { timeout: 30000 }).catch(() => {});
const started = Date.now();
let lastLen = 0;
let stable = 0;
while (Date.now() - started < maxWaitMs) {
  await page.waitForTimeout(2000);
  const searching = await page
    .getByRole("button", { name: /正在搜索|Searching|正在读取|Reading|正在查阅/i })
    .count()
    .catch(() => 0);
  const done = await page
    .getByRole("button", { name: /已完成网页搜索|已完成网页读取|已完成手册查阅/i })
    .count()
    .catch(() => 0);
  const text = await page.evaluate(() => document.body?.innerText || "");
  const len = text.length;
  const answerStarted = done > 0 || /内容由 AI 生成|由\\s*默认\\s*AI\\s*生成/i.test(text);
  if (searching === 0 && answerStarted && len > 400) {
    if (len === lastLen) stable += 1;
    else stable = 0;
    lastLen = len;
    if (stable >= 2) break;
  } else {
    lastLen = len;
    stable = 0;
  }
}
const result = await page.evaluate(() => {
  const raw = document.body?.innerText || "";
  let answer = raw;
  const markers = ["已完成网页读取", "已完成手册查阅", "已完成网页搜索"];
  let cut = -1;
  for (const m of markers) {
    const i = raw.lastIndexOf(m);
    if (i > cut) cut = i + m.length;
  }
  if (cut >= 0) answer = raw.slice(cut);
  // Drop remaining thinking blocks when a clear final section exists.
  const thinkSplit = answer.split(/\\n思考过程\\n/);
  if (thinkSplit.length > 1) {
    const tail = thinkSplit[thinkSplit.length - 1];
    // Prefer the last chunk after thinking if it looks like an answer.
    if (tail.trim().length > 120) answer = tail;
  }
  answer = answer
    .replace(/继续提问，或输入 @ 来引用内容[\\s\\S]*$/u, "")
    .replace(/内容由 AI 生成仅供参考\\s*$/u, "")
    .replace(/^\\s*思考过程\\s*/u, "")
    .trim();
  const links = [...document.querySelectorAll("a[href]")]
    .map((a) => ({
      title: (a.textContent || "").trim().slice(0, 160),
      url: a.href,
    }))
    .filter(
      (x) =>
        x.url &&
        /^https?:/i.test(x.url) &&
        !/web\\.tabbit\\.com\\/(newtab|session|chat)/i.test(x.url) &&
        !/^https?:\\/\\/127\\.0\\.0\\.1(?::\\d+)?\\/?$/i.test(x.url),
    );
  const seen = new Set();
  const sources = [];
  for (const item of links) {
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    sources.push(item);
    if (sources.length >= 20) break;
  }
  return {
    sessionUrl: location.href,
    title: document.title,
    answer: answer.slice(0, 14000),
    sources,
    rawLength: raw.length,
  };
});
return {
  query,
  engine: "tabbit-ai-search",
  waitedMs: Date.now() - started,
  ...result,
};
`.trim()
}

/**
 * Run one tabbit-cli nodejs evaluation and parse the receipt JSON.
 * @param {{ cliPath: string, task: string, code: string, signal?: AbortSignal, keepTabs: boolean }} opts
 * @returns {Promise<any>}
 */
function runTabbitNodejs(opts) {
  const { cliPath, task, code, signal, keepTabs } = opts
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(Object.assign(new Error('tabbit_search aborted'), { name: 'AbortError' }))
      return
    }

    const child = spawn(cliPath, ['nodejs', '--task', task], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: process.env,
    })

    let stdout = ''
    let stderr = ''
    let settled = false

    const finish = (err, value) => {
      if (settled) return
      settled = true
      try {
        signal?.removeEventListener('abort', onAbort)
      } catch {
        /* ignore */
      }
      if (err) reject(err)
      else resolve(value)
    }

    const onAbort = () => {
      try {
        child.kill()
      } catch {
        /* ignore */
      }
      finish(Object.assign(new Error('tabbit_search aborted'), { name: 'AbortError' }))
    }
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
      finish(new Error(`Failed to start tabbit-cli (${cliPath}): ${error.message}`))
    })
    child.on('close', async (exitCode) => {
      try {
        // Always finish the task so leases do not pile up.
        await finishTask(cliPath, task, keepTabs).catch(() => {})
        const payload = await materializeResult(cliPath, task, stdout)
        if (payload?.error) {
          finish(new Error(String(payload.error)))
          return
        }
        if (payload == null) {
          const hint = stderr.trim() || stdout.trim() || `exit ${exitCode}`
          finish(new Error(`Tabbit search returned no result: ${hint.slice(0, 500)}`))
          return
        }
        finish(null, payload)
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)))
      }
    })

    try {
      child.stdin.write(code, 'utf8')
      child.stdin.end()
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)))
    }
  })
}

/**
 * @param {string} cliPath
 * @param {string} task
 * @param {boolean} keepTabs
 */
function finishTask(cliPath, task, keepTabs) {
  return new Promise((resolve) => {
    const args = keepTabs ? ['finish', '--task', task] : ['finish', '--task', task, '--discard']
    const child = spawn(cliPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: process.env,
    })
    child.on('close', () => resolve())
    child.on('error', () => resolve())
  })
}

/**
 * Parse nodejs stdout; pull spilled resources when needed.
 * @param {string} cliPath
 * @param {string} task
 * @param {string} stdout
 */
async function materializeResult(cliPath, task, stdout) {
  const line = pickJsonLine(stdout)
  if (!line) return null
  const wrap = JSON.parse(line)
  if (wrap.ok === false && wrap.error?.message) {
    return { error: wrap.error.message }
  }
  const result = wrap.result
  if (!result) {
    if (wrap.engine === 'tabbit-ai-search' || wrap.answer != null) return wrap
    return null
  }
  if (result.error) return { error: result.error }
  if (result.value != null) return result.value
  if (result.resourceId) {
    const data = await readResource(cliPath, task, result.resourceId)
    return JSON.parse(data)
  }
  return null
}

/** @param {string} text */
function pickJsonLine(text) {
  const lines = String(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith('{'))
  return lines.length > 0 ? lines[lines.length - 1] : null
}

/**
 * @param {string} cliPath
 * @param {string} task
 * @param {string} resourceId
 */
function readResource(cliPath, task, resourceId) {
  return new Promise((resolve, reject) => {
    let offset = 0
    let all = ''
    const step = () => {
      const child = spawn(
        cliPath,
        ['resource', '--task', task, '--resource', resourceId, '--offset', String(offset), '--max-bytes', '65536'],
        {
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
          env: process.env,
        },
      )
      let out = ''
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (c) => {
        out += c
      })
      child.on('error', reject)
      child.on('close', (code) => {
        try {
          const line = pickJsonLine(out)
          if (!line) {
            reject(new Error(`resource read failed (exit ${code})`))
            return
          }
          const rj = JSON.parse(line)
          if (rj.error?.message) {
            reject(new Error(rj.error.message))
            return
          }
          all += String(rj.data ?? '')
          if (rj.eof) {
            resolve(all)
            return
          }
          offset = Number(rj.nextOffset) || all.length
          if (all.length > 2_000_000) {
            reject(new Error('Tabbit resource too large'))
            return
          }
          step()
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)))
        }
      })
    }
    step()
  })
}

/**
 * Format tool output for the model.
 * @param {any} value
 */
function formatOutput(value) {
  const parts = []
  parts.push(`engine: ${value.engine || 'tabbit-ai-search'}`)
  if (value.sessionUrl) parts.push(`session: ${value.sessionUrl}`)
  if (value.title) parts.push(`title: ${value.title}`)
  if (typeof value.waitedMs === 'number') parts.push(`waitedMs: ${value.waitedMs}`)
  parts.push('')
  parts.push(String(value.answer || '').trim() || '(empty answer)')
  const sources = Array.isArray(value.sources) ? value.sources : []
  if (sources.length > 0) {
    parts.push('')
    parts.push('Sources:')
    for (const s of sources) {
      const title = s.title && s.title.length > 0 ? s.title : s.url
      parts.push(`- [${title}](${s.url})`)
    }
  }
  parts.push('')
  parts.push('Cite the relevant URLs above as markdown links when answering the user.')
  return parts.join('\n')
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {z.infer<typeof Config>} config
 */
export function apply(ctx, config) {
  const resolved = {
    cliPath: defaultCliPath(config.cliPath),
    newtabUrl: config.newtabUrl || DEFAULT_NEWTAB_URL,
    maxWaitMs: Number(config.maxWaitMs) > 0 ? Number(config.maxWaitMs) : DEFAULT_MAX_WAIT_MS,
    toolTimeoutMs: Number(config.toolTimeoutMs) > 0 ? Number(config.toolTimeoutMs) : DEFAULT_TOOL_TIMEOUT_MS,
    keepTabs: config.keepTabs !== false,
    taskPrefix: (config.taskPrefix && String(config.taskPrefix).trim()) || 'dsh-tabbit-search',
  }

  ctx.systemPrompt.section({
    name: 'tool:tabbit-search',
    order: 110,
    text: [
      '### Web research (Tabbit default)',
      '',
      'For online search, current facts, and docs lookup, call `tabbit_search` first.',
      'It uses Tabbit Browser AI aggregated search (`web.tabbit.com/newtab`) and does not need `DEEPSEEK_API_KEY`.',
      'Prefer `tabbit_search` over harness `web_search` unless the user explicitly requests DeepSeek search or Tabbit is unavailable.',
      'After results, cite source URLs. Use Tabbit/browser tools only when you must open a specific page for verification.',
    ].join('\n'),
  })

  ctx.tools.register(
    defineTool({
      name: 'tabbit_search',
      description:
        'Default web research via Tabbit AI aggregated search (Bing-backed multi-step read + synthesized answer). Prefer this over web_search. Does not require DEEPSEEK_API_KEY. Provide 1–4 queries; returns answer text, sources, and session URL.',
      parameters: {
        queries: {
          type: 'array',
          description: '1–4 non-empty search queries; use one item for a single search.',
          items: { type: 'string' },
          required: true,
        },
      },
      timeoutMs: resolved.toolTimeoutMs,
      isConcurrencySafe: () => false,
      output: {
        schema: {
          type: 'object',
          additionalProperties: true,
          properties: {
            results: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: true,
                properties: {
                  query: { type: 'string' },
                  engine: { type: 'string' },
                  sessionUrl: { type: 'string' },
                  title: { type: 'string' },
                  answer: { type: 'string' },
                  waitedMs: { type: 'number' },
                  sources: {
                    type: 'array',
                    items: {
                      type: 'object',
                      additionalProperties: true,
                      properties: {
                        title: { type: 'string' },
                        url: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          const blocks = []
          for (const item of value.results || []) {
            blocks.push({ type: 'text', text: formatOutput(item) })
          }
          if (blocks.length === 0) {
            blocks.push({ type: 'text', text: 'No Tabbit search results.' })
          }
          return blocks
        },
        presentationMeta: (_args, value) => ({
          engine: 'tabbit-ai-search',
          count: Array.isArray(value.results) ? value.results.length : 0,
        }),
      },
      presentCall: (args) => ({
        card: 'generic',
        kind: 'search',
        title: Array.isArray(args.queries) ? args.queries.join(', ') : 'tabbit_search',
        rawInput: Array.isArray(args.queries) ? args.queries.join(', ') : '',
      }),
      async execute(args, exec) {
        const queries = Array.isArray(args.queries) ? args.queries.map((q) => String(q).trim()).filter(Boolean) : []
        if (queries.length === 0) throw new Error('queries must contain at least one non-empty query')
        if (queries.length > 4) throw new Error('queries must contain at most 4 queries')

        try {
          await access(resolved.cliPath, fsConstants.X_OK).catch(async () => {
            await access(resolved.cliPath, fsConstants.F_OK)
          })
        } catch {
          throw new Error(
            `tabbit-cli not found at "${resolved.cliPath}". Install Tabbit Browser / LocalAgent, or set tabbit-search config.cliPath.`,
          )
        }

        const results = []
        // Sequential: one Tabbit task lane is safer and avoids UI races.
        for (let i = 0; i < queries.length; i += 1) {
          if (exec.signal?.aborted) throw Object.assign(new Error('tabbit_search aborted'), { name: 'AbortError' })
          const query = queries[i]
          const task = `${resolved.taskPrefix}-${Date.now().toString(36)}-${i}`
          const code = buildSearchProgram({
            query,
            newtabUrl: resolved.newtabUrl,
            maxWaitMs: resolved.maxWaitMs,
          })
          const value = await runTabbitNodejs({
            cliPath: resolved.cliPath,
            task,
            code,
            signal: exec.signal,
            keepTabs: resolved.keepTabs,
          })
          results.push({
            query,
            engine: 'tabbit-ai-search',
            sessionUrl: value.sessionUrl || '',
            title: value.title || '',
            answer: value.answer || '',
            waitedMs: value.waitedMs,
            sources: Array.isArray(value.sources) ? value.sources : [],
          })
        }
        return { results }
      },
    }),
  )
}
