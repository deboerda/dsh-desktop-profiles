# DSH Desktop profiles

Backup of local DeepSeek Harness / DSH Desktop **profiles** and the **local plugins** they `link:`.

No API keys, OAuth tokens, sessions, or credentials are stored here.

## What is included

| Profile | Bundles |
|---|---|
| `web` | local Qwen 32K preset, token-saver, dsh-local-qwen, xAI, Tongyuan, Tabbit, office, computer-use, attach, unity-insight |
| `desktop` | token-saver, Tongyuan usage, unity-insight |
| `unity` | Unity Insight + MCP, xAI, Tongyuan usage, Tabbit search |

Local plugins (copied into `plugins/`):

- `dsh-xai-oauth`
- `dsh-tongyuan-usage`
- `dsh-tabbit-search`
- `dsh-token-saver`
- `dsh-local-qwen`
- `dsh-win-job-runner-fix`
- `dsh-unity-insight` (under `profiles/unity/packages/`)

三个 profile 还都挂了 **OpenViking 长期记忆**（见下方专节）。

User agent presets: `agent-presets/unity-cowork`, `agent-presets/local-qwen-app`

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
- machine-local llama.cpp (`local-iq3` / `local-qwen`) endpoint — set `baseURL` to this PC's llama-server

## OpenViking 长记忆（可选，2026-09-14 起）

三个 profile 的 `cordis.patch.yml` 末尾各有一段 `- insert:`，挂载两个本机插件：

| 插件 | 作用 |
|---|---|
| `@deepseek-ai/dsh-memory-openviking` | 会话捕获 → 提交 OpenViking（:1933）→ 蒸馏成记忆 |
| `@deepseek-ai/dsh-tool-memory` | `memory_write/recall/search/profile/forget` + `<memory_profile>` / `<memory_context>` 注入 |

**恢复时要补两件仓库里没有的东西：**

1. **插件包**（`node_modules` 不入库）。按 [deboerda/dsh-openviking-memory](https://github.com/deboerda/dsh-openviking-memory)
   把三个包放进每个 profile 的 `node_modules`：`@deepseek-ai/dsh-memory-openviking`、`@deepseek-ai/dsh-tool-memory`、
   `@openviking/sdk`。共享目录 `%DSH_HOME%\profiles\node_modules\` 或每个 profile 各放一份都行。
   缺了会报 `cannot resolve package "@deepseek-ai/dsh-memory-openviking"`、`plugin tree failed to load`，DSH Desktop 起不来。
2. **user key**：把 patch 里的 `apiKey: <OPENVIKING_USER_KEY>` 换成真实值（也在 `%USERPROFILE%\.openviking\ovcli.conf` 里）。
   **故意不写进仓库。**

后端服务（OpenViking :1933 + 本地 bge-m3 embedding :8089 + 蒸馏 VLM）用
[deploy/](https://github.com/deboerda/dsh-openviking-memory/tree/main/deploy) 里的脚本启动，
或直接跑 `deploy\make-shortcuts.ps1` 生成桌面「OpenViking记忆-启动 / -停止」快捷方式。

## Update this backup

On the source machine, re-copy profiles/plugins (skip `node_modules`) and push.
