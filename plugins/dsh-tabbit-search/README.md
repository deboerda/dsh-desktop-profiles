# dsh-tabbit-search

Default **Tabbit AI aggregated web search** for DeepSeek Harness.

## Why

Harness `web_search` uses DeepSeek’s provider and needs `DEEPSEEK_API_KEY`.
This profile often runs Grok via xAI OAuth without that key. Tabbit Browser
already ships multi-source AI search on `https://web.tabbit.com/newtab`.

## Behavior

| At startup | On `tabbit_search` call |
|---|---|
| Registers tool schema + short prompt section only | Spawns `tabbit-cli`, runs newtab search, returns answer + sources |
| **No** Tabbit process, **no** network | One on-demand search (sequential if multiple queries) |

## Install (web profile)

Already intended as a profile bundle:

```json
{
  "dependencies": {
    "dsh-tabbit-search": "link:E:/deepseekharness/dsh-tabbit-search"
  },
  "dsh": {
    "profile": {
      "bundles": ["dsh-tabbit-search"]
    }
  }
}
```

Then `pnpm install` in the profile directory and **restart** `dsh web`.

## Config

```yaml
- id: tabbit-search
  name: dsh-tabbit-search
  config:
    cliPath: ""           # empty = platform default launcher
    newtabUrl: https://web.tabbit.com/newtab
    maxWaitMs: 90000
    toolTimeoutMs: 120000
    keepTabs: true
```

## Model tool

- Name: `tabbit_search`
- Args: `{ queries: string[1..4] }`
- Prefer over `web_search` unless the user asks for DeepSeek search.
