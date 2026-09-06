window.__ModuleLoader__.load({
  id: 'dsh-tongyuan-usage',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const { createElement: h, useCallback, useEffect, useState } = React
    const BASE = 'http://127.0.0.1:1458'

    const css = `
      .tyFootUsage{box-sizing:border-box;display:inline-flex;align-items:center;gap:8px;min-width:0;max-width:100%;height:42px;margin:0;padding:0 10px;border:1px solid var(--dsw-alias-border-l2,rgba(148,163,184,.35));border-radius:12px;background:var(--dsw-alias-button-floating-fill,rgba(255,255,255,.72));color:var(--dsw-alias-label-primary,#202124);font:600 12px/1.2 inherit;cursor:pointer}
      .tyFootUsage:hover{background:var(--dsw-alias-button-floating-hover,rgba(15,23,42,.06))}
      .tyFootUsage:disabled{opacity:.55;cursor:default}
      .tyFootRing{position:relative;flex:none;width:18px;height:18px}
      .tyFootRing svg{display:block;width:18px;height:18px;transform:rotate(-90deg)}
      .tyFootRing circle.track{fill:none;stroke:var(--dsw-alias-border-l2,rgba(107,114,128,.28));stroke-width:3}
      .tyFootRing circle.value{fill:none;stroke:#0ea5e9;stroke-width:3;stroke-linecap:round}
      .tyFootMeta{display:flex;flex-direction:column;align-items:flex-start;gap:2px;min-width:0}
      .tyFootLabel{font-size:11px;font-weight:650;white-space:nowrap}
      .tyFootValue{color:var(--dsw-alias-label-secondary,#667085);font-size:10px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px}
      .tyFootUsage[data-wide="0"]{width:36px;height:36px;padding:0;justify-content:center}
      .tyFootUsage[data-wide="0"] .tyFootMeta{display:none}
      .tyFootUsage[data-state="error"]{border-color:rgba(239,68,68,.35)}
      .tyFootUsage[data-state="error"] .tyFootLabel{color:#b42318}
    `

    function formatTokens(n) {
      if (n == null || !Number.isFinite(n)) return '—'
      if (n >= 1000000000) return (n / 1000000000).toFixed(1) + 'B'
      if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
      if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
      return String(Math.round(n))
    }

    function formatMoney(n, unit) {
      if (n == null || !Number.isFinite(n)) return '—'
      const prefix = unit === 'RMB' || unit === 'CNY' ? '¥' : ''
      return prefix + n.toLocaleString(undefined, { maximumFractionDigits: 2 })
    }

    function messageOf(error) {
      return error instanceof Error ? error.message : String(error)
    }

    function UsageFoot(props) {
      const wide = props.wide === true
      const [status, setStatus] = useState(null)
      const [error, setError] = useState('')
      const [busy, setBusy] = useState(false)

      const load = useCallback(async (refresh) => {
        try {
          const response = await fetch(BASE + '/status' + (refresh ? '?refresh=1' : ''), { cache: 'no-store' })
          const value = await response.json()
          if (!response.ok) throw new Error(value.error || 'HTTP ' + response.status)
          setStatus(value)
          setError('')
        } catch (loadError) {
          setError(messageOf(loadError))
        }
      }, [])

      useEffect(() => {
        void load(false)
        const timer = window.setInterval(() => { void load(false) }, 30000)
        return () => { window.clearInterval(timer) }
      }, [load])

      const usage = status && status.usage
      const ok = Boolean(status && status.ok && usage)
      const usageError = status && status.usageError ? String(status.usageError) : error
      const circumference = 2 * Math.PI * 6.5
      const today = ok ? usage.todayTokens : undefined
      const usedRatio = ok && Number.isFinite(today) ? Math.max(0.08, Math.min(0.92, Math.log10(Math.max(today, 1)) / 8)) : 0.12
      const dashOffset = circumference * (1 - usedRatio)
      const state = error && !status ? 'error' : ok ? 'ok' : (usageError ? 'error' : 'loading')
      const label = busy ? '刷新…' : '同元'
      const detail = ok
        ? (formatMoney(usage.balance, usage.unit) + ' · 今 ' + formatTokens(today))
        : (usageError || '读取中')
      const title = ok
        ? [
          'Tongyuan ' + (usage.username || ''),
          '余额 ' + formatMoney(usage.balance, usage.unit),
          '今日 token ' + formatTokens(today),
          '累计 token ' + formatTokens(usage.totalTokens),
          usage.tokenName ? ('key ' + usage.tokenName) : null,
          '点击刷新',
        ].filter(Boolean).join('\n')
        : ('Tongyuan 用量\n' + (usageError || '正在读取'))

      const onClick = async () => {
        setBusy(true)
        await load(true)
        setBusy(false)
      }

      return h('button', {
        type: 'button',
        className: 'tyFootUsage',
        'data-state': state,
        'data-wide': wide ? '1' : '0',
        title,
        'aria-label': title,
        disabled: busy,
        onClick: () => { void onClick() },
      },
        h('span', { className: 'tyFootRing', 'aria-hidden': true },
          h('svg', { viewBox: '0 0 18 18', width: 18, height: 18 },
            h('circle', { className: 'track', cx: 9, cy: 9, r: 6.5 }),
            h('circle', {
              className: 'value',
              cx: 9, cy: 9, r: 6.5,
              strokeDasharray: String(circumference),
              strokeDashoffset: String(dashOffset),
            }),
          ),
        ),
        h('span', { className: 'tyFootMeta' },
          h('span', { className: 'tyFootLabel' }, label),
          h('span', { className: 'tyFootValue' }, detail),
        ),
      )
    }

    const inject = ['slots']
    function apply(ctx) {
      const style = document.createElement('style')
      style.setAttribute('data-dsh-tongyuan-usage', '1')
      style.textContent = css
      document.head.appendChild(style)
      ctx.effect(() => () => { style.remove() })
      ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
        name: 'sidebar.footer.action',
        id: 'tongyuan-usage',
        order: 21,
        label: () => 'Tongyuan 用量',
      }, UsageFoot))
    }

    exports.inject = inject
    exports.apply = apply
    return module.exports
  },
})
