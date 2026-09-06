window.__ModuleLoader__.load({
  id: 'dsh-xai-oauth',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const { createElement: h, useCallback, useEffect, useState } = React
    const BASE = 'http://127.0.0.1:1457'
    const PLUGIN_ID = 'dsh-xai-oauth'

    const css = `
      .xaiSection{max-width:760px;padding:24px 28px 40px;color:var(--text-primary,#202124)}
      .xaiTitle{margin:0 0 6px;font-size:22px;line-height:1.3;font-weight:650}
      .xaiIntro{margin:0 0 20px;color:var(--text-secondary,#6b7280);font-size:14px;line-height:1.65}
      .xaiCard{overflow:hidden;border:1px solid var(--border-primary,#e5e7eb);border-radius:16px;background:var(--background-primary,#fff);box-shadow:0 8px 30px rgba(15,23,42,.05)}
      .xaiHero{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;padding:22px 22px 18px;background:linear-gradient(135deg,rgba(236,72,153,.10),rgba(168,85,247,.07))}
      .xaiBrand{display:flex;align-items:center;gap:12px;min-width:0}
      .xaiLogo{display:grid;place-items:center;width:42px;height:42px;flex:0 0 auto;border-radius:12px;background:#0f0f0f;color:#fff;font:700 14px/1 ui-monospace,SFMono-Regular,Consolas,monospace}
      .xaiName{margin:0;font-size:17px;font-weight:650}.xaiMeta{margin:4px 0 0;color:var(--text-secondary,#667085);font-size:12px;overflow-wrap:anywhere}
      .xaiBadge{display:inline-flex;align-items:center;gap:6px;white-space:nowrap;border-radius:999px;padding:6px 10px;font-size:12px;font-weight:600;background:rgba(107,114,128,.12);color:#667085}
      .xaiBadge.connected{background:rgba(16,185,129,.13);color:#07835d}.xaiBadge.pending{background:rgba(245,158,11,.14);color:#a35f00}
      .xaiDot{width:7px;height:7px;border-radius:50%;background:currentColor}
      .xaiBody{padding:20px 22px 22px}.xaiActions{display:flex;flex-wrap:wrap;gap:9px;margin-top:18px}
      .xaiButton{appearance:none;border:1px solid var(--border-primary,#d7dce2);border-radius:9px;background:var(--background-primary,#fff);color:var(--text-primary,#202124);padding:8px 13px;font:600 13px/1.2 inherit;cursor:pointer;transition:.15s ease}
      .xaiButton:hover{border-color:#8b96a5;background:var(--background-secondary,#f7f8fa)}.xaiButton:disabled{opacity:.5;cursor:not-allowed}
      .xaiButton.primary{border-color:#111827;background:#111827;color:#fff}.xaiButton.primary:hover{background:#2a3443}.xaiButton.danger{color:#c23b3b}
      .xaiCode{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:16px;border:1px solid var(--border-primary,#e5e7eb);border-radius:12px;padding:14px 16px;background:var(--background-secondary,#fafafa)}
      .xaiCodeValue{font:700 24px/1.2 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:2px;color:var(--text-primary,#202124)}
      .xaiCodeHint{margin:8px 0 0;color:var(--text-secondary,#667085);font-size:12px;line-height:1.55}
      .xaiPlan{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:4px}.xaiPlan strong{font-size:14px}.xaiPlan span{font-size:12px;color:var(--text-secondary,#667085)}
      .xaiGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:17px}
      .xaiUsage{border:1px solid var(--border-primary,#e5e7eb);border-radius:12px;padding:14px;background:var(--background-secondary,#fafafa)}
      .xaiUsageHead{display:flex;align-items:baseline;justify-content:space-between;gap:12px}.xaiUsageName{font-size:13px;font-weight:600}.xaiUsageValue{font-size:12px;color:var(--text-secondary,#667085)}
      .xaiBar{display:flex;height:8px;margin:11px 0 9px;overflow:hidden;border-radius:999px;background:rgba(107,114,128,.16)}.xaiBarFill{height:100%;border-radius:inherit;background:linear-gradient(90deg,#ec4899,#a855f7);transition:width .25s ease}.xaiBarFill.high{background:linear-gradient(90deg,#f59e0b,#ef4444)}
      .xaiBarSegment{height:100%;flex:0 0 auto;border-right:2px solid var(--background-secondary,#fafafa);transition:width .25s ease}.xaiBarSegment:last-child{border-right:0}.xaiLegend{display:flex;flex-wrap:wrap;gap:5px 12px;margin:0 0 10px}.xaiLegendItem{display:inline-flex;align-items:center;gap:5px;color:var(--text-secondary,#667085);font-size:11px;white-space:nowrap}.xaiLegendDot{width:7px;height:7px;border-radius:50%;flex:0 0 auto}.xaiLegendItem strong{color:var(--text-primary,#202124);font-weight:650}
      .xaiReset{font-size:12px;color:var(--text-secondary,#667085)}
      .xaiNotice{margin:15px 0 0;border-radius:10px;padding:10px 12px;background:rgba(59,130,246,.08);color:var(--text-secondary,#526071);font-size:12px;line-height:1.55}
      .xaiError{margin:14px 0 0;border-radius:10px;padding:10px 12px;background:rgba(239,68,68,.09);color:#b42318;font-size:12px;line-height:1.55;overflow-wrap:anywhere}
      .xaiEmpty{padding:6px 0;color:var(--text-secondary,#667085);font-size:13px;line-height:1.6}.xaiSkeleton{height:9px;margin:10px 0;border-radius:99px;background:linear-gradient(90deg,#eee,#f7f7f7,#eee);background-size:200% 100%;animation:xaiPulse 1.2s infinite}
      @keyframes xaiPulse{to{background-position:-200% 0}}@media(max-width:620px){.xaiSection{padding:18px 15px 30px}.xaiHero{padding:18px;flex-direction:column}.xaiBody{padding:17px 18px 20px}.xaiCode{flex-direction:column;align-items:flex-start}.xaiGrid{grid-template-columns:1fr}}
      /* Compact subscription usage chip — sits to the right of Settings in the sidebar foot */
      .xaiFootUsage{box-sizing:border-box;display:inline-flex;align-items:center;gap:8px;min-width:0;max-width:100%;height:42px;margin:0;padding:0 10px;border:1px solid var(--dsw-alias-border-l2,var(--border-primary,#e5e7eb));border-radius:12px;background:var(--dsw-alias-button-floating-fill,var(--background-primary,rgba(255,255,255,.72)));color:var(--dsw-alias-label-primary,var(--text-primary,#202124));font:600 12px/1.2 inherit;cursor:pointer;transition:background .15s ease,border-color .15s ease,opacity .15s ease}
      .xaiFootUsage:hover{background:var(--dsw-alias-button-floating-hover,var(--background-secondary,#f3f4f6));border-color:var(--dsw-alias-border-l3,#cfd4dc)}
      .xaiFootUsage:disabled{opacity:.55;cursor:default}
      .xaiFootUsage:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#a855f7);outline-offset:2px}
      .xaiFootRing{position:relative;flex:none;width:18px;height:18px}
      .xaiFootRing svg{display:block;width:18px;height:18px;transform:rotate(-90deg)}
      .xaiFootRing track{/* noop */}
      .xaiFootRing circle.track{fill:none;stroke:var(--dsw-alias-border-l2,rgba(107,114,128,.28));stroke-width:3}
      .xaiFootRing circle.value{fill:none;stroke:url(#xaiFootGrad);stroke-width:3;stroke-linecap:round;transition:stroke-dashoffset .25s ease}
      .xaiFootRing circle.value.high{stroke:#ef4444}
      .xaiFootMeta{display:flex;flex-direction:column;align-items:flex-start;gap:2px;min-width:0}
      .xaiFootLabel{font-size:11px;font-weight:650;letter-spacing:.01em;white-space:nowrap}
      .xaiFootValue{color:var(--dsw-alias-label-secondary,var(--text-secondary,#667085));font-size:10px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:110px}
      .xaiFootUsage[data-state=offline] .xaiFootLabel{color:var(--dsw-alias-label-secondary,#667085);font-weight:600}
      .xaiFootUsage[data-state=error]{border-color:rgba(239,68,68,.35)}
      .xaiFootUsage[data-state=error] .xaiFootLabel{color:#b42318}
      /* Wide sidebar: pin the chip to the right of the Settings row */
      .hHd-Xa_root:not(.hHd-Xa_collapsed) .hHd-Xa_footArea{position:relative}
      .hHd-Xa_root:not(.hHd-Xa_collapsed) .hHd-Xa_settingsArea{padding-right:118px;box-sizing:border-box}
      .hHd-Xa_root:not(.hHd-Xa_collapsed) .xaiFootUsage{position:absolute;right:0;bottom:0;z-index:3}
      /* Rail: keep a compact icon-sized control in the footer stack */
      .hHd-Xa_collapsed .xaiFootUsage{width:36px;height:36px;padding:0;justify-content:center;border-radius:10px}
      .hHd-Xa_collapsed .xaiFootMeta{display:none}
    `
    if (typeof document !== 'undefined' && document.querySelector('style[data-plugin="' + PLUGIN_ID + '"]') === null) {
      const style = document.createElement('style')
      style.dataset.plugin = PLUGIN_ID
      style.textContent = css
      document.head.appendChild(style)
    }

    function messageOf(error) {
      return error instanceof Error ? error.message : String(error)
    }

    function formatExpiry(ms) {
      if (!Number.isFinite(ms)) return '未知'
      const date = new Date(ms)
      const remaining = date.getTime() - Date.now()
      if (remaining <= 0) return '即将过期'
      const minutes = Math.max(1, Math.floor(remaining / 60000))
      const relative = minutes >= 60 ? Math.floor(minutes / 60) + ' 小时 ' + (minutes % 60) + ' 分后' : minutes + ' 分后'
      return relative + ' · ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }

    function formatPeriodEnd(iso) {
      if (!iso) return '重置时间未知'
      const date = new Date(iso)
      if (Number.isNaN(date.getTime())) return '重置时间未知'
      const remaining = date.getTime() - Date.now()
      if (remaining <= 0) return '即将重置'
      const days = Math.floor(remaining / 86400000)
      const hours = Math.floor((remaining % 86400000) / 3600000)
      const relative = days > 0 ? days + ' 天后' : hours > 0 ? hours + ' 小时后' : '即将重置'
      return relative + ' · ' + date.toLocaleString([], { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    }

    function formatCredits(value) {
      if (!Number.isFinite(value)) return '—'
      return Math.round(value).toLocaleString()
    }

    function shortId(value) {
      if (!value) return ''
      return value.length > 22 ? value.slice(0, 10) + '…' + value.slice(-8) : value
    }

    function productPresentation(product, index) {
      const normalized = String(product || '').toLowerCase()
      if (normalized === 'grokbuild') return { label: 'Grok Build', color: '#ec4899' }
      if (normalized === 'grokimagine') return { label: 'Imagine', color: '#a855f7' }
      if (normalized === 'grokchat') return { label: '聊天', color: '#6366f1' }
      if (normalized === 'api') return { label: 'API', color: '#3b82f6' }
      const palette = ['#ec4899', '#a855f7', '#6366f1', '#3b82f6', '#0ea5e9']
      return { label: String(product || '其他').replace(/^Grok/i, 'Grok '), color: palette[index % palette.length] }
    }

    function UsageCard(props) {
      const used = Math.max(0, Math.min(100, Number(props.usedPercent) || 0))
      const hasBar = Number.isFinite(Number(props.usedPercent))
      const segments = Array.isArray(props.segments) ? props.segments.filter((item) => Number.isFinite(item.usagePercent) && item.usagePercent > 0) : []
      return h('div', { className: 'xaiUsage' },
        h('div', { className: 'xaiUsageHead' },
          h('span', { className: 'xaiUsageName' }, props.name),
          h('span', { className: 'xaiUsageValue' }, props.value),
        ),
        hasBar
          ? h('div', { className: 'xaiBar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': used },
              segments.length > 0
                ? segments.map((item, index) => h('span', { key: item.product + '-' + index, className: 'xaiBarSegment', title: item.label + ' ' + Math.round(item.usagePercent) + '%', style: { width: Math.min(100, item.usagePercent) + '%', background: item.color } }))
                : h('div', { className: 'xaiBarFill' + (used >= 80 ? ' high' : ''), style: { width: used + '%' } }),
            )
          : h('div', { className: 'xaiBar' }, h('div', { className: 'xaiBarFill', style: { width: '0%' } })),
        segments.length > 0
          ? h('div', { className: 'xaiLegend' }, segments.map((item, index) => h('span', { key: item.product + '-legend-' + index, className: 'xaiLegendItem' },
              h('span', { className: 'xaiLegendDot', style: { background: item.color }, 'aria-hidden': true }),
              item.label,
              h('strong', null, Math.round(item.usagePercent) + '%'),
            )))
          : null,
        h('div', { className: 'xaiReset' }, props.footer),
      )
    }

    function XaiSection() {
      const [status, setStatus] = useState(null)
      const [error, setError] = useState('')
      const [busy, setBusy] = useState(false)
      const [pending, setPending] = useState(false)

      const load = useCallback(async (refresh) => {
        try {
          const response = await fetch(BASE + '/status' + (refresh ? '?refresh=1' : ''), { cache: 'no-store' })
          const value = await response.json()
          if (!response.ok) throw new Error(value.error || 'HTTP ' + response.status)
          setStatus(value)
          setError('')
          setPending(Boolean(value.loginPending))
        } catch (loadError) {
          setError('无法连接本机 xAI 插件服务。请重启 DSH Web profile 后再试。' + (messageOf(loadError) ? ' (' + messageOf(loadError) + ')' : ''))
        }
      }, [])

      useEffect(() => {
        void load(false)
        const timer = window.setInterval(() => { void load(false) }, pending ? 2000 : 30000)
        return () => { window.clearInterval(timer) }
      }, [load, pending])

      const login = async () => {
        setBusy(true)
        try {
          const response = await fetch(BASE + '/start', { cache: 'no-store' })
          const value = await response.json()
          if (!response.ok) throw new Error(value.error || 'HTTP ' + response.status)
          setPending(true)
          setError('')
          void load(false)
        } catch (loginError) {
          setError(messageOf(loginError))
        } finally {
          setBusy(false)
        }
      }

      const openVerification = (uri) => {
        window.open(uri, 'dsh-xai-verification', 'noopener,noreferrer')
      }

      const logout = async () => {
        if (!status || !status.csrf) return
        setBusy(true)
        try {
          const response = await fetch(BASE + '/logout', { method: 'POST', headers: { 'x-dsh-csrf': status.csrf } })
          const value = await response.json()
          if (!response.ok) throw new Error(value.error || 'HTTP ' + response.status)
          await load(false)
        } catch (logoutError) {
          setError(messageOf(logoutError))
        } finally {
          setBusy(false)
        }
      }

      const refreshUsage = async () => {
        setBusy(true)
        await load(true)
        setBusy(false)
      }

      const loginState = status && status.loginState
      const loading = status === null && !error
      const connected = Boolean(status && status.loggedIn)
      const waiting = pending || Boolean(loginState && loginState.status === 'pending')
      const loginError = status && status.loginError
      const usage = status && status.usage
      const plan = usage && usage.planType ? String(usage.planType) : 'xAI 订阅'
      const periodLabel = usage && usage.periodType === 'weekly' ? '本周额度' : usage && usage.periodType === 'monthly' ? '本月额度' : '本周期额度'
      const hasLimit = usage && Number.isFinite(usage.monthlyLimit) && usage.monthlyLimit > 0
      const used = usage && Number.isFinite(usage.used) ? usage.used : undefined
      const limit = usage && Number.isFinite(usage.monthlyLimit) ? usage.monthlyLimit : undefined
      const usedPercent = usage && Number.isFinite(usage.usedPercent) ? usage.usedPercent : (hasLimit && used !== undefined ? (used / limit) * 100 : undefined)
      const percentKnown = Number.isFinite(usedPercent)
      const productSegments = usage && Array.isArray(usage.productUsage)
        ? usage.productUsage.flatMap((item, index) => {
            if (!item || !Number.isFinite(item.usagePercent) || typeof item.product !== 'string') return []
            return [{ ...item, ...productPresentation(item.product, index) }]
          })
        : []
      const periodFooter = (usage && usage.periodType === 'weekly' ? '每周重置 · ' : usage && usage.periodType === 'monthly' ? '每月重置 · ' : '') + formatPeriodEnd(usage && usage.periodEnd)
      const prepaid = usage && Number.isFinite(usage.prepaidBalance) && usage.prepaidBalance > 0
        ? ' · 预付余额 ' + formatCredits(usage.prepaidBalance)
        : ''
      const onDemand = usage && usage.onDemandEnabled === true
        ? '按需额度已开启' + (Number.isFinite(usage.onDemandCap) && usage.onDemandCap > 0 ? ' · 上限 ' + formatCredits(usage.onDemandCap) : '') + prepaid
        : usage && Number.isFinite(usage.onDemandCap) && usage.onDemandCap > 0
          ? '按需上限 ' + formatCredits(usage.onDemandCap) + prepaid
          : prepaid
            ? '预付余额 ' + formatCredits(usage.prepaidBalance)
            : '按需额度未开启'

      return h('section', { className: 'xaiSection' },
        h('h2', { className: 'xaiTitle' }, 'xAI（Grok/X 订阅）'),
        h('p', { className: 'xaiIntro' }, '使用 SuperGrok 或 X Premium 订阅登录，无需 API key。登录后自动向“模型提供方”中的 xai 路由提供有效访问令牌，并自动续期。'),
        h('div', { className: 'xaiCard' },
          h('div', { className: 'xaiHero' },
            h('div', { className: 'xaiBrand' },
              h('div', { className: 'xaiLogo', 'aria-hidden': true }, 'xAI'),
              h('div', null,
                h('h3', { className: 'xaiName' }, 'xAI 订阅'),
                h('p', { className: 'xaiMeta', title: connected && usage && usage.userId ? usage.userId : '' },
                  loading ? '正在读取 xAI 登录状态'
                    : connected ? (usage && usage.userId ? shortId(usage.userId) : '已连接 xAI 订阅账号')
                      : waiting ? '等待授权…' : '尚未连接 xAI 账号'),
              ),
            ),
            h('span', { className: 'xaiBadge ' + (connected ? 'connected' : loading || waiting ? 'pending' : '') },
              h('span', { className: 'xaiDot', 'aria-hidden': true }), loading ? '刷新中…' : connected ? '已连接' : waiting ? '等待授权' : '未登录',
            ),
          ),
          h('div', { className: 'xaiBody' },
            status === null && !error
              ? h('div', { 'aria-label': '加载中' }, h('div', { className: 'xaiSkeleton' }), h('div', { className: 'xaiSkeleton', style: { width: '72%' } }))
              : waiting && loginState && loginState.status === 'pending'
                ? h(React.Fragment, null,
                    h('p', { className: 'xaiEmpty' }, '请在 xAI 授权页登录并批准访问（使用下方用户码）：'),
                    h('div', { className: 'xaiCode' },
                      h('div', null,
                        h('div', { className: 'xaiCodeValue' }, loginState.userCode),
                        h('p', { className: 'xaiCodeHint' }, '用户码约 ' + Math.round(loginState.expiresInSeconds / 60) + ' 分钟内有效，过期后请重新登录。'),
                      ),
                      h('button', { type: 'button', className: 'xaiButton primary', onClick: () => openVerification(loginState.verificationUri) }, '打开授权页'),
                    ),
                  )
                : connected
                  ? h(React.Fragment, null,
                      h('div', { className: 'xaiPlan' },
                        h('strong', null, plan),
                        h('span', null, usage && usage.fetchedAt
                          ? '更新于 ' + new Date(usage.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : '用量信息待更新'),
                      ),
                      h('div', { className: 'xaiGrid' },
                        h(UsageCard, {
                          name: periodLabel,
                          usedPercent: usedPercent,
                          segments: productSegments,
                          value: hasLimit && used !== undefined
                            ? '已用 ' + formatCredits(used) + ' / ' + formatCredits(limit) + (percentKnown ? ' · ' + Math.round(usedPercent) + '%' : '')
                            : percentKnown
                              ? '已用 ' + Math.round(usedPercent) + '%'
                              : used !== undefined
                                ? '已用 ' + formatCredits(used) + '（上限未披露）'
                                : '额度未披露',
                          footer: periodFooter,
                        }),
                        h(UsageCard, {
                          name: '按需计费',
                          usedPercent: undefined,
                          value: onDemand,
                          footer: '访问令牌 ' + formatExpiry(status.expiresAt),
                        }),
                      ),
                      !percentKnown && !hasLimit
                        ? h('p', { className: 'xaiNotice' }, 'xAI 当前未披露本周期用量。计划档位与账单周期仍会显示；实际限额以 xAI 账户页为准。')
                        : null,
                      status.usageError ? h('p', { className: 'xaiError', role: 'status' }, '用量读取失败：' + status.usageError) : null,
                    )
                  : h('p', { className: 'xaiEmpty' }, '点击登录会向 xAI 申请设备码。插件仅在 Host 侧保存和刷新令牌，Web 页面不会读取令牌。'),
            loginError ? h('p', { className: 'xaiError', role: 'alert' }, '登录失败：' + loginError) : null,
            error ? h('p', { className: 'xaiError', role: 'alert' }, error) : null,
            h('div', { className: 'xaiActions' },
              h('button', { type: 'button', className: 'xaiButton primary', disabled: busy || waiting || loading, onClick: () => { void login() } },
                loading ? '读取状态…' : connected ? '重新登录' : waiting ? '等待授权…' : '登录 xAI'),
              connected ? h('button', { type: 'button', className: 'xaiButton', disabled: busy, onClick: () => { void refreshUsage() } }, busy ? '刷新中…' : '刷新用量') : null,
              connected ? h('button', { type: 'button', className: 'xaiButton danger', disabled: busy, onClick: () => { void logout() } }, '退出登录') : null,
            ),
          ),
        ),
        h('p', { className: 'xaiNotice' }, '此页面通过 127.0.0.1 本机桥接服务工作；远程打开 DSH Web 时不会暴露认证接口。'),
      )
    }

    function UsageFoot({ wide }) {
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

      const connected = Boolean(status && status.loggedIn)
      const usage = status && status.usage
      const usedPercent = usage && Number.isFinite(usage.usedPercent)
        ? Math.max(0, Math.min(100, usage.usedPercent))
        : (usage && Number.isFinite(usage.used) && Number.isFinite(usage.monthlyLimit) && usage.monthlyLimit > 0
          ? Math.max(0, Math.min(100, (usage.used / usage.monthlyLimit) * 100))
          : undefined)
      const percentKnown = Number.isFinite(usedPercent)
      const hasLimit = usage && Number.isFinite(usage.monthlyLimit) && usage.monthlyLimit > 0
      const used = usage && Number.isFinite(usage.used) ? usage.used : undefined
      const limit = usage && Number.isFinite(usage.monthlyLimit) ? usage.monthlyLimit : undefined
      const plan = usage && usage.planType ? String(usage.planType) : 'xAI'
      const high = percentKnown && usedPercent >= 80
      const circumference = 2 * Math.PI * 6.5
      const dashOffset = percentKnown ? circumference * (1 - usedPercent / 100) : circumference

      let state = 'loading'
      let label = '用量'
      let detail = '读取中…'
      let title = '订阅用量'
      if (error && status === null) {
        state = 'error'
        label = '用量'
        detail = '离线'
        title = '无法读取订阅用量：' + error
      } else if (!connected && status) {
        state = 'offline'
        label = '未登录'
        detail = 'xAI'
        title = '尚未登录 xAI 订阅。打开设置 → xAI（Grok/X）登录后可查看用量。'
      } else if (connected) {
        state = status.usageError ? 'error' : 'ok'
        label = percentKnown ? Math.round(usedPercent) + '%' : '用量'
        if (hasLimit && used !== undefined) {
          detail = formatCredits(used) + ' / ' + formatCredits(limit)
        } else if (percentKnown) {
          detail = plan
        } else if (status.usageError) {
          detail = '读取失败'
        } else {
          detail = plan
        }
        title = [
          'xAI 订阅用量',
          percentKnown ? ('已用 ' + Math.round(usedPercent) + '%') : null,
          hasLimit && used !== undefined ? (formatCredits(used) + ' / ' + formatCredits(limit)) : null,
          usage && usage.periodEnd ? formatPeriodEnd(usage.periodEnd) : null,
          status.usageError ? ('读取失败：' + status.usageError) : null,
          '点击刷新；打开设置可查看明细',
        ].filter(Boolean).join(' · ')
      }

      const openSettings = () => {
        const button = document.querySelector('.hHd-Xa_settingsArea button, [class*="settingsArea"] button')
        if (button instanceof HTMLElement) button.click()
      }

      const onClick = async () => {
        if (!connected) {
          openSettings()
          return
        }
        setBusy(true)
        await load(true)
        setBusy(false)
      }

      const onContextMenu = (event) => {
        event.preventDefault()
        openSettings()
      }

      return h('button', {
        type: 'button',
        className: 'xaiFootUsage',
        'data-state': state,
        'data-wide': wide ? '1' : '0',
        title,
        'aria-label': title,
        disabled: busy && connected,
        onClick: () => { void onClick() },
        onContextMenu,
      },
        h('span', { className: 'xaiFootRing', 'aria-hidden': true },
          h('svg', { viewBox: '0 0 18 18', width: 18, height: 18 },
            h('defs', null,
              h('linearGradient', { id: 'xaiFootGrad', x1: '0%', y1: '0%', x2: '100%', y2: '0%' },
                h('stop', { offset: '0%', stopColor: '#ec4899' }),
                h('stop', { offset: '100%', stopColor: '#a855f7' }),
              ),
            ),
            h('circle', { className: 'track', cx: 9, cy: 9, r: 6.5 }),
            h('circle', {
              className: 'value' + (high ? ' high' : ''),
              cx: 9,
              cy: 9,
              r: 6.5,
              strokeDasharray: String(circumference),
              strokeDashoffset: String(dashOffset),
              stroke: high ? '#ef4444' : undefined,
            }),
          ),
        ),
        h('span', { className: 'xaiFootMeta' },
          h('span', { className: 'xaiFootLabel' }, busy ? '刷新…' : label),
          h('span', { className: 'xaiFootValue' }, detail),
        ),
      )
    }

    const inject = ['slots']
    function apply(ctx) {
      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'xai-oauth',
        order: 12,
        label: () => 'xAI（Grok/X）',
      }, XaiSection))
      ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
        name: 'sidebar.footer.action',
        id: 'xai-usage',
        order: 20,
        label: () => '订阅用量',
      }, UsageFoot))
    }

    exports.inject = inject
    exports.apply = apply
    return module.exports
  },
})