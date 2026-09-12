/**
 * Shrink the model-facing prompt-cache prefix without unregistering host tools.
 *
 * - Slim nested schema descriptions (stable, always-on).
 * - Defer bulky tool families until the session needs them, then pin them.
 * - Optionally replace the long Cordis essay with a skill pointer.
 *
 * @module dsh-token-saver
 */
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'token-saver'

/** Hard deps: assemble waterfall + enable_tools registration. */
export const inject = ['tools', 'systemPrompt']

const ENABLE_TOOL = 'enable_tools'
const FAMILY_SECTION = 'token-saver:deferred-families'
const CORDIS_SECTION = 'tool:cordis'
const USER_TEXT_CAP = 12_000

/** @typedef {'excel' | 'office' | 'univer' | 'pdf' | 'wincu' | 'unity' | 'web' | 'agent' | 'sidebar'} FamilyId */

/** @type {readonly FamilyId[]} */
const FAMILY_IDS = ['excel', 'office', 'univer', 'pdf', 'wincu', 'unity', 'web', 'agent', 'sidebar']

/** @type {Record<FamilyId, { label: string, match: (name: string) => boolean, keywords: RegExp, sections: string[] }>} */
const FAMILIES = {
  excel: {
    label: 'Excel / spreadsheets (xlsx, pivots, charts, formulas)',
    match: (name) => name.startsWith('excel_'),
    keywords: /\b(xlsx|xls|xlsm|spreadsheet|workbook|pivot|excel_)\b|表格|透视|工作簿|\.xlsx\b/i,
    sections: ['dsh-excel-chat:interaction'],
  },
  office: {
    label: 'Word / PPT / zagens-office (docx, pptx, pdf write)',
    match: (name) => name.startsWith('office_') || name.startsWith('word_'),
    keywords: /\b(docx|pptx|ppt|office_|word_|zagens)\b|公文|幻灯|演示文稿|\.docx\b|\.pptx\b/i,
    sections: [],
  },
  univer: {
    label: 'Univer multi-unit documents (.univer, sheet/doc/slide/base/board)',
    match: (name) => name.startsWith('univer_'),
    keywords: /\b(univer_|univer-sheet|univer-doc|univer-slide|\.univer)\b/i,
    sections: [],
  },
  pdf: {
    label: 'PDF reader (pdf_scan / pdf_read_page / pdf_render_region)',
    match: (name) => name.startsWith('pdf_'),
    keywords: /\b(pdf_|pdf_scan|pdf_read)\b|\.pdf\b/i,
    sections: [],
  },
  wincu: {
    label: 'Windows Computer Use (UIA / OCR / native desktop)',
    match: (name) => name.startsWith('mcp__wincu__') || name.startsWith('windows_computer_use'),
    keywords: /\b(wincu|computer.?use|uia|wecom)\b|企业微信|桌面自动化|窗口快照/i,
    sections: [],
  },
  unity: {
    label: 'Unity / Tuanjie Insight (unity_*, vfs_*)',
    match: (name) => name.startsWith('unity_') || name.startsWith('vfs_'),
    keywords: /\b(unity_|vfs_|tuanjie|prefab|GameObject)\b/i,
    sections: [],
  },
  web: {
    label: 'Web search / fetch / Tabbit',
    match: (name) => name.startsWith('web_') || name.startsWith('tabbit'),
    keywords: /\b(web_search|web_fetch|tabbit|search the web)\b/i,
    sections: [],
  },
  agent: {
    label: 'Subagents / goals / ralph / workflows',
    match: (name) => /^(subagent|ralph|create_goal|update_goal|get_goal|exit_plan_mode|interrupt_agent|send_message)/.test(name) || name.startsWith('workflow'),
    keywords: /\b(subagent|ralph|create_goal|workflow)\b/i,
    sections: [],
  },
  sidebar: {
    label: 'Better-sidebar terminal / sidebar_open',
    match: (name) => name.startsWith('sidebar_') || name.startsWith('terminal_'),
    keywords: /\b(sidebar_open|terminal_)\b/i,
    sections: [],
  },
}

const CORDIS_SHORT = [
  '# Dynamic Cordis Plugins',
  '',
  'Temporary runtime extensions for this process. Load the `cordis-plugin-development` skill before defining, running, or repairing a Plugin.',
  '- Use only when the outcome belongs to the current running harness as a temporary extension.',
  '- Inspect before coding: cordis_inspect_list → cordis_inspect_query → cordis_define → cordis_run.',
  '- Host vs Client is an implementation choice. Client UI must use a queried Slot. Plain JavaScript only (no TypeScript, JSX, import, or require).',
  '- After a technical failure, inspect the same Plugin and define a corrected Package; do not silently create a replacement.',
].join('\n')

/** Schemastery config for the host row. */
const HOST_TOOLS_SECTION = 'token-saver:host-tools'
const CORE_NAME_RE = /^(run_code|enable_tools|skill|read|write|edit|glob|grep|pwsh|bash|todo_write|ask_user_question|present)$/i
const CORE_PREFIXES = ['job_', 'todo']

function isCoreTool(name) {
  const n = String(name || '')
  if (CORE_NAME_RE.test(n)) return true
  const lower = n.toLowerCase()
  return CORE_PREFIXES.some((p) => lower.startsWith(p))
}

function compactRuntimeToolSchema(tool) {
  return {
    ...tool,
    description: 'Run async TypeScript. Call await tools.name(args) for host tools listed in the Host tools section. Do not expand unused families. Always pass description.',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['code', 'description'],
    },
  }
}

function compactShellToolSchema(tool) {
  return {
    ...tool,
    description: 'Run a shell command. Required args: command (the script) AND description (5-10 word English phrase). Never omit description.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string' },
        description: { type: 'string' },
        timeoutMs: { type: 'number' },
        workdir: { type: 'string' },
        run_in_background: { type: 'boolean' },
      },
      required: ['command', 'description'],
    },
  }
}

function compactNamedDescriptionTool(tool) {
  if (tool.name === 'run_code') return compactRuntimeToolSchema(tool)
  if (tool.name === 'pwsh' || tool.name === 'bash') return compactShellToolSchema(tool)
  return tool
}

export const Config = z.object({
  slimSchemas: z.boolean().default(true),
  deferFamilies: z.boolean().default(true),
  slimCordisPrompt: z.boolean().default(true),
  compactRuntimeTool: z.boolean().default(true),
  deferUnlisted: z.boolean().default(false),
  maxDescriptionChars: z.number().default(120),
})

/**
 * First sentence, capped.
 * @param {string} text
 * @param {number} maxChars
 */
function firstSentence(text, maxChars) {
  const trimmed = text.replace(/\s+/g, ' ').trim()
  if (trimmed.length <= maxChars) return trimmed
  const sentence = trimmed.match(/^(.+?[。.!？?])\s/)
  const candidate = sentence ? sentence[1] : trimmed
  if (candidate.length <= maxChars) return candidate
  return `${candidate.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`
}

/**
 * Drop nested descriptions / examples while keeping structure.
 * @param {unknown} value
 * @param {number} depth
 * @param {number} maxDescriptionChars
 * @returns {unknown}
 */
function slimValue(value, depth, maxDescriptionChars) {
  if (Array.isArray(value)) {
    return value.map((item) => slimValue(item, depth + 1, maxDescriptionChars))
  }
  if (value === null || typeof value !== 'object') return value
  /** @type {Record<string, unknown>} */
  const out = {}
  for (const [key, child] of Object.entries(value)) {
    if (key === 'examples' || key === 'title' || key === 'default') continue
    // Only strip JSON-Schema *annotations* (string-valued "description").
    // A property literally named description (pwsh, run_code, present.files)
    // is an object schema — dropping it leaves required:["description"] with
    // type {}, and local models then omit the argument forever.
    if (key === 'description' && typeof child === 'string') {
      if (depth === 0 && child.length > 0) {
        out.description = firstSentence(child, maxDescriptionChars)
      }
      continue
    }
    out[key] = slimValue(child, depth + 1, maxDescriptionChars)
  }
  return out
}

/**
 * @param {{ name: string, description?: string, parameters?: unknown }} tool
 * @param {number} maxDescriptionChars
 */
function slimTool(tool, maxDescriptionChars) {
  const description = typeof tool.description === 'string'
    ? firstSentence(tool.description, maxDescriptionChars)
    : tool.description
  return {
    ...tool,
    ...description === undefined ? {} : { description },
    parameters: slimValue(tool.parameters ?? {}, 1, maxDescriptionChars),
  }
}

/**
 * @param {string} name
 * @returns {FamilyId | undefined}
 */
function familyOf(name) {
  for (const id of FAMILY_IDS) {
    if (FAMILIES[id].match(name)) return id
  }
  return undefined
}

/**
 * Read only leaf strings from user-authored messages.
 * @param {unknown} agent
 */
function collectUserText(agent) {
  const events = agent?.session?.events
  if (!Array.isArray(events)) return ''
  const parts = []
  let used = 0
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]
    if (event?.type !== 'user/message') continue
    if (event.data?.source?.kind !== 'user') continue
    const content = event.data?.content
    if (!Array.isArray(content)) continue
    for (const block of content) {
      if (block?.type !== 'text' || typeof block.text !== 'string') continue
      parts.push(block.text)
      used += block.text.length
      if (used >= USER_TEXT_CAP) break
    }
    if (used >= USER_TEXT_CAP) break
  }
  return parts.join('\n')
}

/**
 * Tool names the model already called in this session.
 * @param {unknown} agent
 * @returns {string[]}
 */
function collectCalledToolNames(agent) {
  const events = agent?.session?.events
  if (!Array.isArray(events)) return []
  /** @type {string[]} */
  const names = []
  for (const event of events) {
    if (event?.type !== 'assistant/message') continue
    const content = event.data?.content
    if (!Array.isArray(content)) continue
    for (const block of content) {
      if (block?.type === 'tool-call' && typeof block.name === 'string') names.push(block.name)
    }
  }
  return names
}

/**
 * @param {unknown} agent
 * @param {Set<FamilyId>} pinned
 */
function detectFamilies(agent, pinned) {
  /** @type {Set<FamilyId>} */
  const enabled = new Set(pinned)
  for (const name of collectCalledToolNames(agent)) {
    if (name === ENABLE_TOOL) continue
    const family = familyOf(name)
    if (family) enabled.add(family)
    if (name === 'skill') {
      // Skill load is a strong signal; keep scanning user text for which one.
    }
  }
  const text = collectUserText(agent)
  if (text.length > 0) {
    for (const id of FAMILY_IDS) {
      if (FAMILIES[id].keywords.test(text)) enabled.add(id)
    }
    if (/\boffice-documents\b|\bnative-office-edit\b|\buniver-sheet\b|\buniver-doc\b|\buniver-slide\b/i.test(text)) {
      enabled.add('excel')
      enabled.add('office')
      enabled.add('pdf')
      enabled.add('univer')
    }
    if (/\bwindows-computer-use\b/i.test(text)) enabled.add('wincu')
  }
  return enabled
}

/**
 * @param {FamilyId[]} enabled
 * @param {{ name: string }[]} tools
 */
function catalogText(enabled, tools) {
  const enabledSet = new Set(enabled)
  const lines = [
    'Codex-style catalog: core coding tools stay (read/write/edit/grep/glob/pwsh/todo/skill/jobs/run_code). Bulky families are deferred. Once enabled they stay enabled for cache stability.',
  ]
  for (const id of FAMILY_IDS) {
    const present = tools.some((tool) => FAMILIES[id].match(tool.name))
    if (!present) continue
    if (enabledSet.has(id)) {
      lines.push(`- ${id}: ENABLED — ${FAMILIES[id].label}`)
    } else {
      const sample = tools.filter((tool) => FAMILIES[id].match(tool.name)).slice(0, 8).map((tool) => tool.name)
      lines.push(`- ${id}: deferred — ${FAMILIES[id].label}. Call ${ENABLE_TOOL} with { "families": ["${id}"] } to load: ${sample.join(', ')}`)
    }
  }
  return lines.join('\n')
}

/**
 * @param {unknown} config
 */
export function apply(ctx, config = {}) {
  const slimSchemas = config.slimSchemas !== false
  const deferFamilies = config.deferFamilies !== false
  const slimCordisPrompt = config.slimCordisPrompt !== false
  const compactRuntimeTool = config.compactRuntimeTool !== false
  const deferUnlisted = config.deferUnlisted === true
  const maxDescriptionChars = Number(config.maxDescriptionChars) > 0
    ? Number(config.maxDescriptionChars)
    : 120

  /** @type {WeakMap<object, Set<FamilyId>>} */
  const pinnedByAgent = new WeakMap()

  /**
   * @param {unknown} agent
   * @returns {Set<FamilyId>}
   */
  function pinFor(agent) {
    if (agent === undefined || agent === null || typeof agent !== 'object') {
      return new Set()
    }
    let pinned = pinnedByAgent.get(agent)
    if (pinned === undefined) {
      pinned = new Set()
      pinnedByAgent.set(agent, pinned)
    }
    return pinned
  }

  ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
    const assembled = await next()
    const agent = context?.agent
    const originalTools = Array.isArray(assembled.tools) ? assembled.tools : []
    const pinned = pinFor(agent)
    const enabled = deferFamilies ? detectFamilies(agent, pinned) : new Set(FAMILY_IDS)
    for (const id of enabled) pinned.add(id)

    let tools = originalTools
    if (deferFamilies) {
      tools = originalTools.filter((tool) => {
        if (isCoreTool(tool.name)) return true
        const family = familyOf(tool.name)
        if (family !== undefined) return enabled.has(family)
        return !deferUnlisted
      })
    }
    if (compactRuntimeTool) {
      tools = tools.map((tool) => compactNamedDescriptionTool(tool))
    }
    if (slimSchemas) {
      tools = tools.map((tool) => compactRuntimeTool && (tool.name === 'run_code' || tool.name === 'pwsh' || tool.name === 'bash')
        ? tool
        : slimTool(tool, maxDescriptionChars))
    }

    let sections = Array.isArray(assembled.sections) ? assembled.sections : []
    if (slimCordisPrompt) {
      sections = sections.map((section) => {
        if (section.name !== CORDIS_SECTION) return section
        return { ...section, text: CORDIS_SHORT }
      })
    }
    if (deferFamilies) {
      const drop = new Set()
      for (const id of FAMILY_IDS) {
        if (enabled.has(id)) continue
        for (const name of FAMILIES[id].sections) drop.add(name)
      }
      if (drop.size > 0) {
        sections = sections.filter((section) => !drop.has(section.name))
      }
      const catalog = catalogText([...enabled], originalTools)
      const existing = sections.findIndex((section) => section.name === FAMILY_SECTION)
      const entry = { name: FAMILY_SECTION, text: catalog }
      if (existing >= 0) sections = sections.map((section, index) => index === existing ? entry : section)
      else sections = [...sections, entry]
      const coreNames = tools.map((tool) => tool.name).filter((name) => isCoreTool(name))
      const otherNames = tools.map((tool) => tool.name).filter((name) => !isCoreTool(name) && name !== 'run_code')
      const hostText = [
        '# Host tools (compact)',
        'Core always-on: ' + (coreNames.join(', ') || '(none)'),
        otherNames.length ? ('Also this turn: ' + otherNames.slice(0, 40).join(', ')) : '',
        'pwsh/bash/run_code ALWAYS require description (short English phrase) plus command/code. Type is string, never omit.',
        'If using run_code, call await tools.<name>(args) for those names only.',
      ].filter(Boolean).join('\n')
      const hostIdx = sections.findIndex((section) => section.name === HOST_TOOLS_SECTION)
      const hostEntry = { name: HOST_TOOLS_SECTION, text: hostText }
      if (hostIdx >= 0) sections = sections.map((section, index) => index === hostIdx ? hostEntry : section)
      else sections = [...sections, hostEntry]
    }

    return {
      ...assembled,
      tools,
      sections,
    }
  })

  if (deferFamilies) {
    ctx.tools.register(defineTool({
      name: ENABLE_TOOL,
      description: 'Load full schemas for deferred bulky families (excel, office, univer, pdf, wincu, unity). Core coding tools stay loaded. Families stay enabled afterwards.',
      parameters: {
        families: {
          type: 'array',
          required: true,
          description: 'Family ids to enable.',
          items: {
            type: 'string',
            enum: [...FAMILY_IDS],
          },
        },
      },
      output: {
        schema: { type: 'json' },
        render(_args, value) {
          if (value && typeof value === 'object' && typeof value.note === 'string') return value.note
          try { return JSON.stringify(value) } catch { return String(value) }
        },
      },
      async execute(args, exec) {
        const requested = Array.isArray(args.families) ? args.families : []
        /** @type {FamilyId[]} */
        const valid = []
        for (const id of requested) {
          if (FAMILY_IDS.includes(id)) valid.push(id)
        }
        const pinned = pinFor(exec.agent)
        for (const id of valid) pinned.add(id)
        return {
          enabled: [...pinned],
          added: valid,
          note: 'Full schemas appear on the next model step. Do not call family tools in the same step as enable_tools.',
        }
      },
    }))
  }
}
