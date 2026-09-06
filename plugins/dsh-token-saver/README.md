# dsh-token-saver

Cut the huge **缓存读取 / cache_read** number that DSH shows on every turn,
without removing tools from the host.

## Why cache_read looks huge

DSH sends a stable prefix every request: system prompt + **every tool schema**.
Providers then report that prefix as `cache_read` on later turns. Caching is
working — the prefix is just enormous, mostly from always-on Office / Univer /
Excel / PDF / Computer-Use schemas.

This plugin:

1. **Slims schemas** — keeps names, types, enums, `oneOf`, `required`; drops
   nested descriptions / examples.
2. **Defers bulky families** until the session actually needs them (user text,
   prior tool calls, or `enable_tools`). Once enabled, they stay enabled so the
   catalog stays cache-stable.
3. Optionally shortens the always-on Cordis plugin essay (the skill still has
   the full protocol).

Host tool registrations are unchanged. Hidden tools still execute if a provider
emits them; the model normally cannot name a tool that is not in the wire
catalog, so it should call `enable_tools` first.

## Install

Add the bundle to a profile (`web` is the one with Excel/Univer/Office):

```json
"dsh-token-saver": "link:E:/deepseekharness/dsh-token-saver"
```

and include `"dsh-token-saver"` in `dsh.profile.bundles`. Restart the host.

## Config

| field | default | meaning |
|---|---|---|
| `slimSchemas` | `true` | Strip nested descriptions from every tool schema |
| `deferFamilies` | `true` | Hide bulky families until the session needs them |
| `slimCordisPrompt` | `true` | Replace the long Cordis essay with a skill pointer |
| `maxDescriptionChars` | `220` | Cap kept top-level descriptions |

## Manual enable

```
enable_tools { "families": ["excel", "office"] }
```

Families: `excel`, `office`, `univer`, `pdf`, `wincu`.
