# DSH Desktop profiles

Backup of local DeepSeek Harness / DSH Desktop **profiles** and the **local plugins** they `link:`.

No API keys, OAuth tokens, sessions, or credentials are stored here.

## What is included

| Profile | Bundles |
|---|---|
| `web` | xAI OAuth + Tongyuan usage, Tabbit search, office plugins, computer-use, attach, unity-insight |
| `desktop` | token-saver, Tongyuan usage, unity-insight |
| `unity` | Unity Insight + MCP, xAI, Tongyuan usage, Tabbit search |

Local plugins (copied into `plugins/`):

- `dsh-xai-oauth`
- `dsh-tongyuan-usage`
- `dsh-tabbit-search`
- `dsh-token-saver`
- `dsh-unity-insight` (under `profiles/unity/packages/`)

User agent preset: `agent-presets/unity-cowork`

## Restore on a new PC

1. Install DSH Desktop and launch it once (creates `%USERPROFILE%\.dsh`).
2. Install [pnpm](https://pnpm.io/) and Node.js.
3. Clone this repo.
4. Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\restore.ps1
```

5. Edit `%USERPROFILE%\.dsh\.credentials.yaml` and set `TONGYUAN_API_KEY` if you use Tongyuan.
6. Restart DSH Desktop. Tray → Profile → `web` / `desktop` / `unity`.
7. In the app: Settings → **xAI（Grok/X）** → login (do not copy `xai-oauth.json` between machines).

## Not restored (on purpose)

- `.credentials.yaml` secrets
- `xai-oauth.json`
- session logs, attachments, telemetry
- machine-local llama.cpp (`local-iq3`) endpoint

## Update this backup

On the source machine, re-copy profiles/plugins (skip `node_modules`) and push.
