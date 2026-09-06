window.__ModuleLoader__.load({
  id: 'dsh-unity-insight',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement

    const CSS = [
      '.dsh-unity-badge{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:none;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:default;}',
      '.dsh-unity-badge:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);}',
      '.dsh-unity-badge svg{width:16px;height:16px;display:block;}',
      '.dsh-unity-dock{box-sizing:border-box;width:calc(100% - var(--dsh-composer-side-clearance) - var(--dsh-composer-side-clearance) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset));max-width:calc(var(--dsh-composer-card-max-width) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset));margin:0 auto;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-specific-tip);border-radius:12px;overflow:hidden;}',
      '.dsh-unity-dock-row{display:flex;align-items:center;gap:10px;padding:6px 12px;min-width:0;}',
      '.dsh-unity-dock-lead{flex:none;display:grid;place-items:center;color:var(--dsw-alias-label-tertiary);}',
      '.dsh-unity-dock-lead svg{width:14px;height:14px;display:block;}',
      '.dsh-unity-dock-title{flex:none;color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:24px;}',
      '.dsh-unity-dock-meta{min-width:0;flex:auto;color:var(--dsw-alias-label-tertiary);font-size:13px;font-weight:400;line-height:20px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    ].join('')

    function UnityMark(size) {
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'currentColor',
        'aria-hidden': 'true',
      }, h('path', {
        d: 'M10.11 13.53 6.38 15.69l3.73 2.15 3.73-2.15-3.73-2.16zm-4.58-2.64L1.8 13.05v4.31l3.73 2.16v-4.32l3.73-2.15-3.73-2.16zm13.04 0-3.73 2.16 3.73 2.15v4.32l3.73-2.16v-4.31l-3.73-2.16zM12 2.04 8.27 4.2l3.73 2.15L15.73 4.2 12 2.04zm3.73 4.31-3.73 2.16v4.31l3.73-2.15V6.35zm-7.46 0v4.32l3.73 2.15V8.51L8.27 6.35z',
      }))
    }

    function useUnityInfo(props) {
      const sessionId = props.sessionId
      const path = props.useWorkspaces(function (ws) {
        const items = ws && ws.items
        if (!items || !sessionId) return ''
        for (let i = 0; i < items.length; i += 1) {
          const ids = items[i].sessionIds
          if (ids && ids.indexOf(sessionId) !== -1) return items[i].path || ''
        }
        return ''
      })
      const [info, setInfo] = React.useState(null)
      React.useEffect(function () {
        let cancelled = false
        if (!path) {
          setInfo(null)
          return undefined
        }
        fetch('/unity-insight/inspect?cwd=' + encodeURIComponent(path))
          .then(function (res) { return res.json() })
          .then(function (value) {
            if (!cancelled) setInfo(value && value.detected ? value : null)
          })
          .catch(function () {
            if (!cancelled) setInfo(null)
          })
        return function () { cancelled = true }
      }, [path])
      return info
    }

    function Badge(props) {
      const info = useUnityInfo(props)
      if (!info) return null
      const tip = [info.name, info.version, info.root].filter(Boolean).join(' · ')
      return h('span', {
        className: 'dsh-unity-badge',
        title: tip,
        role: 'img',
        'aria-label': 'Unity',
      }, UnityMark(16))
    }

    function Dock(props) {
      const info = useUnityInfo(props)
      if (!info) return null
      const meta = [info.version, info.root].filter(Boolean).join('  ·  ')
      return h('div', { className: 'dsh-unity-dock', title: info.root || '' },
        h('div', { className: 'dsh-unity-dock-row' },
          h('span', { className: 'dsh-unity-dock-lead', 'aria-hidden': 'true' }, UnityMark(14)),
          h('span', { className: 'dsh-unity-dock-title' }, info.name || 'Unity'),
          h('span', { className: 'dsh-unity-dock-meta' }, meta),
        ),
      )
    }

    function injectStyles() {
      if (typeof document === 'undefined') return
      if (document.querySelector('style[data-plugin="dsh-unity-insight"]')) return
      const tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-unity-insight'
      tag.textContent = CSS
      document.head.appendChild(tag)
    }

    const inject = ['slots']

    function apply(ctx) {
      injectStyles()
      const slots = ctx.get('slots')
      if (!slots) return
      slots.inject('conversation.session.header.utilities', function () {
        return slots.register({
          name: 'conversation.session.header.utilities',
          id: 'unity-badge',
          order: 5,
          label: 'Unity',
        }, Badge)
      })
      slots.inject('conversation.input.dock', function () {
        return slots.register({
          name: 'conversation.input.dock',
          id: 'unity-project-bar',
          order: 15,
          label: 'Unity project',
        }, Dock)
      })
    }

    return { inject, apply }
  },
})
