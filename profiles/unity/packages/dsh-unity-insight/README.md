# dsh-unity-insight

Host-plane Unity / Tuanjie Insight tools for the dedicated DSH **`unity`** profile.

Wraps the Tuanjie Cowork `unity-insight-cli`. The Unity project root is resolved **per tool call**:

1. optional `project` argument
2. current DSH session workspace, walking up to `ProjectSettings/ProjectVersion.txt`

A new engineering project does **not** require editing this profile. Point the session workspace at the new root (or pass `project`).

## Tools

| Tool | Purpose |
|---|---|
| `unity_project_info` | Detect root, editor version, CLI, index status |
| `unity_index` | `status` / `build` / `sync` |
| `vfs_ls` | List VFS children (GameObject hierarchy, not just files) |
| `vfs_glob` | Glob VFS nodes |
| `vfs_read` | Read `.meta`, indexed content, `:/.content` |
| `vfs_grep` | Search serialized YAML / indexed text |
| `vfs_refs` | GUID / call references in/out |
| `unity_live_status` | Codely Bridge / Unity MCP connection |
| `unity_share_asset` | Share current Editor selection (Cowork asset chip) |
| `unity_focus_editor` | Bring Unity to front (Cowork green Unity button) |
| `unity_bridge` | Other live MCP tools (play, hierarchy, screenshot, C#) |
| `unity_cli_info` | Official Unity CLI (Production Pipeline) path/version/editors |
| `unity_cli` | Run `unity <args>` (open/build/test/pipeline/command/mcp) |

VFS tools work **without** the editor. Live tools need Tuanjie/Unity open with `cn.tuanjie.codely.bridge`.

## CLI discovery

Default install: `%LOCALAPPDATA%\Programs\Tuanjie Cowork\cli\bin\win32-x64\`

Overrides: `TUANJIE_COWORK_ROOT`, `UNITY_INSIGHT_NODE`, `UNITY_INSIGHT_CLI`, or plugin config `coworkRoot` / `nodePath` / `cliScript`.
