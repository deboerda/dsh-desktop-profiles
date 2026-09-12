window.__ModuleLoader__.load({
  id: 'dsh-local-qwen',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const { createElement: h, useCallback, useEffect, useState } = React
    const BASE = 'http://127.0.0.1:1459'

    const css = `
      .lqFoot{box-sizing:border-box;display:inline-flex;align-items:center;gap:8px;min-width:0;max-width:100%;height:42px;margin:0;padding:0 10px;border:1px solid var(--dsw-alias-border-l2,rgba(148,163,184,.35));border-radius:12px;background:var(--dsw-alias-button-floating-fill,rgba(255,255,255,.72));color:var(--dsw-alias-label-primary,#202124);font:600 12px/1.2 inherit;cursor:pointer}
      .lqFoot:hover{background:var(--dsw-alias-button-floating-hover,rgba(15,23,42,.06))}
      .lqFoot:disabled{opacity:.55;cursor:default}
      .lqSwitch{position:relative;flex:none;width:28px;height:16px;border-radius:999px;background:rgba(148,163,184,.45);transition:background .15s ease}
      .lqSwitch:after{content:'';position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:#fff;box-shadow:0 0 0 1px rgba(15,23,42,.08);transition:transform .15s ease}
      .lqFoot[data-state="on"] .lqSwitch{background:#16a34a}
      .lqFoot[data-state="on"] .lqSwitch:after{transform:translateX(12px)}
      .lqFoot[data-state="starting"] .lqSwitch{background:#ca8a04}
      .lqPct{flex:none;min-width:2.4em;font-size:10px;font-weight:700;font-variant-numeric:tabular-nums;text-align:center}
      .lqFoot:not([data-state="starting"]) .lqPct{display:none}
      .lqFoot[data-state="error"]{border-color:rgba(239,68,68,.35)}
      .lqMeta{display:flex;flex-direction:column;align-items:flex-start;gap:2px;min-width:0}
      .lqLabel{font-size:11px;font-weight:650;white-space:nowrap}
      .lqValue{color:var(--dsw-alias-label-secondary,#667085);font-size:10px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:130px}
      .lqFoot[data-wide="0"]{width:36px;height:36px;padding:0;justify-content:center}
      .lqFoot[data-wide="0"] .lqMeta{display:none}
      [class*="collapsed"] .lqFoot{width:36px;height:36px;padding:0;justify-content:center}
      [class*="collapsed"] .lqFoot .lqMeta{display:none}
      [class*="footerActions"]{display:flex!important;flex-wrap:wrap;align-items:center;gap:8px;padding:4px 0}
      .lqArch{position:relative;display:inline-flex}
      .lqArchBtn{box-sizing:border-box;display:inline-flex;align-items:center;gap:6px;height:42px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2,rgba(148,163,184,.35));border-radius:12px;background:var(--dsw-alias-button-floating-fill,rgba(255,255,255,.72));color:var(--dsw-alias-label-primary,#202124);font:600 12px/1.2 inherit;cursor:pointer}
      .lqArchBtn[data-wide="0"]{width:36px;height:36px;padding:0;justify-content:center}
      .lqArchBtn[data-wide="0"] .lqArchMeta{display:none}
      [class*="collapsed"] .lqArchBtn .lqArchMeta{display:none}
      .lqArchPanel{position:absolute;left:0;bottom:48px;width:260px;max-height:320px;overflow:auto;z-index:40;padding:8px;border:1px solid var(--dsw-alias-border-l2,rgba(148,163,184,.35));border-radius:12px;background:var(--dsw-alias-bg-primary,#fff);box-shadow:0 8px 24px rgba(15,23,42,.12)}
      .lqArchHead{font-size:12px;font-weight:700;margin:0 0 8px}
      .lqArchItem{display:flex;align-items:center;gap:8px;padding:6px 4px;border-radius:8px}
      .lqArchTitle{flex:1;min-width:0;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .lqArchRestore{flex:none;border:none;background:transparent;color:#2563eb;font-size:12px;cursor:pointer}
      .lqArchRestore:disabled{color:#98a2b3;cursor:default}
      .lqArchEmpty{font-size:12px;color:#667085}
      .lqClear{box-sizing:border-box;display:inline-flex;align-items:center;gap:6px;height:42px;margin:0;padding:0 10px;border:1px solid var(--dsw-alias-border-l2,rgba(148,163,184,.35));border-radius:12px;background:var(--dsw-alias-button-floating-fill,rgba(255,255,255,.72));color:var(--dsw-alias-label-primary,#202124);font:600 12px/1.2 inherit;cursor:pointer}
      .lqClear:hover{background:rgba(239,68,68,.08)}
      .lqClear:disabled{opacity:.55;cursor:default}
      .lqClear[data-wide="0"]{width:36px;height:36px;padding:0;justify-content:center}
      .lqClear[data-wide="0"] .lqClearMeta{display:none}
      [class*="collapsed"] .lqClear{width:36px;height:36px;padding:0;justify-content:center}
      [class*="collapsed"] .lqClear .lqClearMeta{display:none}
    `

    function LocalQwenFoot(props) {
      const wide = props.wide === true
      const [status, setStatus] = useState(null)
      const [error, setError] = useState('')
      const [busy, setBusy] = useState(false)

      const load = useCallback(async () => {
        try {
          const response = await fetch(BASE + '/status', { cache: 'no-store' })
          const value = await response.json()
          if (!response.ok) throw new Error(value.error || 'HTTP ' + response.status)
          setStatus(value)
          setError('')
        } catch (loadError) {
          setError(loadError instanceof Error ? loadError.message : String(loadError))
        }
      }, [])

      useEffect(() => {
        void load()
        const timer = window.setInterval(() => { void load() }, 800)
        return () => { window.clearInterval(timer) }
      }, [load])

      const healthy = Boolean(status && status.healthy)
      const starting = Boolean(status && status.starting) || (busy && !healthy)
      const running = Boolean(status && status.running)
      const progress = Math.max(0, Math.min(100, Number(status && status.progress) || 0))
      const stage = (status && status.stage) ? String(status.stage) : ''
      const state = error && !status ? 'error' : (healthy ? 'on' : (starting ? 'starting' : 'off'))
      const label = '本地 Qwen'
      const detail = error && !status
        ? '控制口离线'
        : (healthy ? '8080 就绪' : (starting ? ('加载 ' + progress + '%' + (stage ? ' · ' + stage : '')) : (running ? '启动中' : '已关闭')))
      const title = [
        '本地 Qwen3.6 35B-A3B IQ4_XS',
        'llama-server http://127.0.0.1:8080',
        starting ? ('加载进度 ' + progress + '%' + (stage ? ' · ' + stage : '')) : (healthy ? '点击关闭' : '点击启动'),
        error || (status && status.error) || '',
        '会话里请选择模型 Qwen3.6 35B-A3B IQ4_XS (32K local)',
      ].filter(Boolean).join('\n')

      const onClick = async () => {
        if (busy) return
        setBusy(true)
        try {
          const path = healthy ? '/stop' : '/start'
          const response = await fetch(BASE + path, { method: 'POST' })
          const value = await response.json()
          if (!response.ok) throw new Error(value.error || 'HTTP ' + response.status)
          setStatus(value)
          setError('')
        } catch (clickError) {
          setError(clickError instanceof Error ? clickError.message : String(clickError))
        }
        setBusy(false)
        window.setTimeout(() => { void load() }, 1500)
      }

      return h('button', {
        type: 'button',
        className: 'lqFoot',
        'data-state': state,
        'data-wide': wide ? '1' : '0',
        title,
        'aria-label': title,
        'aria-pressed': healthy ? 'true' : 'false',
        disabled: busy,
        onClick: () => { void onClick() },
      },
        h('span', { className: 'lqSwitch', 'aria-hidden': true }),
        h('span', { className: 'lqPct', 'aria-hidden': true }, starting ? (progress + '%') : ''),
        h('span', { className: 'lqMeta' },
          h('span', { className: 'lqLabel' }, label),
          h('span', { className: 'lqValue' }, detail),
        ),
      )
    }

    var __sessionsSvc = null

    function normalizeTitle(t) {
      return String(t || '').trim().replace(/\s+/g, ' ')
    }

    function idFromTitle(title) {
      const want = normalizeTitle(title)
      if (!want || !__sessionsSvc || !__sessionsSvc.list) return null
      try {
        const snap = __sessionsSvc.list.getSnapshot()
        const byId = snap && snap.byId ? snap.byId : {}
        const ids = Object.keys(byId)
        for (let i = 0; i < ids.length; i++) {
          const s = byId[ids[i]] || {}
          const t = normalizeTitle(s.title || s.name || '')
          if (t && t === want) return ids[i]
        }
        for (let i = 0; i < ids.length; i++) {
          const s = byId[ids[i]] || {}
          const t = normalizeTitle(s.title || s.name || '')
          if (t && (t.indexOf(want) >= 0 || want.indexOf(t) >= 0)) return ids[i]
        }
      } catch { /* ignore */ }
      return null
    }

    async function archiveSession(sessionId, title) {
      const id = sessionId || idFromTitle(title)
      const response = await fetch(BASE + '/conversations/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: id || '', title: title || '' }),
      })
      const value = await response.json()
      if (!response.ok) throw new Error(value.error || 'HTTP ' + response.status)
      try { if (__sessionsSvc && typeof __sessionsSvc.refreshList === 'function') await __sessionsSvc.refreshList() } catch { /* ignore */ }
      window.setTimeout(() => window.location.reload(), 200)
    }

    function HeaderClearButton(props) {
      const sessionId = props.sessionId || (props.session && props.session.id) || null
      const onClick = async (event) => {
        event.preventDefault()
        event.stopPropagation()
        if (!window.confirm('永久删除当前对话及其磁盘记录？此操作不可恢复。')) return
        try { await archiveSession(sessionId, props.title) }
        catch (err) { window.alert('清除失败：' + (err instanceof Error ? err.message : String(err))) }
      }
      return h('button', {
        type: 'button',
        title: '永久删除当前对话（含磁盘记录）',
        onClick,
        style: {
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 28, height: 28, padding: 0, border: 'none', borderRadius: 6,
          background: 'transparent', color: 'var(--dsw-alias-label-tertiary,#8a8a8e)', cursor: 'pointer',
        },
      }, '×')
    }

    function findOpenSessionRow() {
      const rows = document.querySelectorAll('[class*=sessionRow]')
      for (let i = 0; i < rows.length; i++) {
        if (String(rows[i].className || '').indexOf('menuOpen') >= 0) return rows[i]
      }
      return null
    }

    function ensureSidebarDeleteItem() {
      const menu = document.querySelector('[role=menu]')
      if (!menu || menu.querySelector('[data-lq-menu-delete]')) return
      const row = findOpenSessionRow()
      if (!row) return
      const item = document.createElement('button')
      item.type = 'button'
      item.setAttribute('role', 'menuitem')
      item.setAttribute('data-lq-menu-delete', '1')
      item.textContent = '删除此对话'
      item.style.cssText = 'display:flex;width:100%;padding:6px 12px;border:none;background:transparent;color:#e5484d;font:inherit;font-size:13px;text-align:left;cursor:pointer;border-radius:6px'
      item.addEventListener('click', function (event) {
        event.preventDefault()
        event.stopPropagation()
        const titleEl = row.querySelector('[class*=title]')
        const title = titleEl ? String(titleEl.innerText || '').trim() : ''
        if (!window.confirm('永久删除「' + (title || '该对话') + '」及其磁盘记录？此操作不可恢复。')) return
        archiveSession(null, title).catch(function (err) {
          window.alert('删除失败：' + (err instanceof Error ? err.message : String(err)))
        })
      })
      menu.appendChild(item)
    }

    function installRowClear() {
      if (window.__lqRowClearInstalled) return
      window.__lqRowClearInstalled = true
      try { ensureSidebarDeleteItem() } catch (e) { /* ignore */ }
      const observer = new MutationObserver(function () {
        try { ensureSidebarDeleteItem() } catch (e) { /* ignore */ }
      })
      observer.observe(document.body, { childList: true, subtree: true })
    }

    const inject = ['slots']
    function apply(ctx) {
      __sessionsSvc = ctx.get('sessions')
      if (!__sessionsSvc) {
        ctx.inject(['sessions'], function (sub) { __sessionsSvc = sub.sessions })
      }
      const style = document.createElement('style')
      style.setAttribute('data-dsh-local-qwen', '1')
      style.textContent = css
      document.head.appendChild(style)
      ctx.effect(() => () => { style.remove() })
      function ArchivedFoot(props) {
        const wide = props.wide === true
        const [open, setOpen] = useState(false)
        const [items, setItems] = useState([])
        const [busy, setBusy] = useState(false)
        const load = useCallback(async () => {
          try {
            const response = await fetch(BASE + '/conversations/archived', { cache: 'no-store' })
            const value = await response.json()
            if (response.ok) setItems(Array.isArray(value.sessions) ? value.sessions : [])
          } catch { setItems([]) }
        }, [])
        useEffect(() => {
          void load()
          const timer = window.setInterval(() => { void load() }, 8000)
          return () => { window.clearInterval(timer) }
        }, [load])
        const restore = async (item) => {
          if (!item.recoverable) {
            window.alert('该会话磁盘记录已删除，无法恢复。')
            return
          }
          setBusy(true)
          try {
            const response = await fetch(BASE + '/conversations/unarchive', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sessionId: item.id, title: item.title }),
            })
            const value = await response.json()
            if (!response.ok) throw new Error(value.error || 'HTTP ' + response.status)
            window.location.reload()
          } catch (err) {
            window.alert('恢复失败：' + (err instanceof Error ? err.message : String(err)))
          }
          setBusy(false)
        }
        return h('div', { className: 'lqArch' },
          open ? h('div', { className: 'lqArchPanel' },
            h('div', { className: 'lqArchHead' }, '已归档'),
            items.length === 0
              ? h('div', { className: 'lqArchEmpty' }, '没有可显示的归档（永久删除的不会出现在这里）')
              : items.map((item) => h('div', { className: 'lqArchItem', key: item.id },
                h('span', { className: 'lqArchTitle', title: item.id }, item.title || item.id),
                h('button', {
                  type: 'button',
                  className: 'lqArchRestore',
                  disabled: busy || !item.recoverable,
                  onClick: () => { void restore(item) },
                }, item.recoverable ? '恢复' : '已无文件'),
              )),
          ) : null,
          h('button', {
            type: 'button',
            className: 'lqArchBtn',
            'data-wide': wide ? '1' : '0',
            title: '查看已归档对话',
            onClick: () => { setOpen(!open); void load() },
          },
            h('span', { 'aria-hidden': true }, '📦'),
            h('span', { className: 'lqArchMeta' }, '已归档 ' + items.length),
          ),
        )
      }
      ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
        name: 'sidebar.footer.action',
        id: 'local-qwen',
        order: 20,
        label: () => '本地 Qwen',
      }, LocalQwenFoot))
      ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
        name: 'sidebar.footer.action',
        id: 'local-qwen-archived',
        order: 19,
        label: () => '已归档',
      }, ArchivedFoot))
      try {
        ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
          name: 'conversation.session.header.actions',
          id: 'local-qwen-clear-one',
          order: 31,
          label: () => '清除对话',
        }, HeaderClearButton))
      } catch (e) { /* slot may be absent */ }
      installRowClear()
    }

    exports.inject = inject
    exports.apply = apply
    return module.exports
  },
})
