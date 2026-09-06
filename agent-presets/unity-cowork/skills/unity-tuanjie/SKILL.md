---
name: unity-tuanjie
description: Use for Unity / Tuanjie (团结引擎) projects — scene/prefab/GameObject/GUID work, Insight VFS, official Unity CLI (editors/open/build/test/pipeline/command), sharing the current Editor selection, focusing the editor, play mode, AssetDatabase, and C# that talks to UnityEditor.
---

# Unity / 团结 Cowork

Load this skill before engine work. The DSH **unity** profile provides the tools; this skill is how to use them.

## Project root (never freeze a path)

Resolve the Unity root on every task:

1. Optional tool argument `project`
2. Current session workspace, walking up to `ProjectSettings/ProjectVersion.txt`

A new engineering project only needs the DSH workspace pointed at that new root.

## Offline: Unity Insight VFS

Use these **without** the editor:

| Tool | Use |
|---|---|
| `unity_project_info` | Detect root, editor version, index status |
| `unity_index` | `status` / `build` (once) / `sync` |
| `vfs_ls` | List VFS children (hierarchy inside scenes/prefabs, not just files) |
| `vfs_glob` | Find scenes, prefabs, materials as VFS nodes |
| `vfs_read` | `.meta`, indexed content, `:/.content` |
| `vfs_grep` | Search serialized YAML / GUID fields |
| `vfs_refs` | References in/out, or C# calls |

Do **not** grep `--- !u!` YAML as ordinary text when VFS can answer.

## Live: Unity MCP (Codely Bridge)

Requires Tuanjie/Unity open with `cn.tuanjie.codely.bridge`.

| Tool | Cowork equivalent |
|---|---|
| `unity_live_status` | Green connected dot |
| `unity_share_asset` | “正在与 Cowork 共享 Unity 资产” |
| `unity_focus_editor` | “已连接，点击唤起编辑器窗口” |
| `unity_bridge` | Other live MCP tools |
| `mcp__unity__*` | Same MCP tools if the host MCP client mounted |

When the user talks about 当前资源 / 选中的 / 这个资产, call `unity_share_asset` first.

Live MCP tool names (via `unity_bridge` `tool=`): `unity_editor`, `unity_scene`, `unity_gameobject`, `unity_asset`, `unity_package`, `unity_bake`, `unity_menu`, `unity_screenshot`, `unity_gameview`, `unity_job`, `unity_dialog`, `execute_custom_tool`, `exec_editor_script`, `exec_runtime_script`, `unity_wiki`.

## Official Unity CLI (Production Pipeline local tools)

Docs: https://docs.unity.com/en-us/unity-production-pipeline/local-tools-cli

This is Unity’s experimental `unity` binary (Hub/install/open/build/test + Pipeline). **Not** Tuanjie Cowork Insight.

| Tool | Use |
|---|---|
| `unity_cli_info` | Detect CLI path, version, installed editors, connected-editor status |
| `unity_cli` | `unity <args>` with JSON output |

Common `unity_cli` args:

- `["editors","-i"]` list installed Editors
- `["open"]` open the session Unity project
- `["command"]` list commands on the connected Editor (needs `unity pipeline install`)
- `["list"]` tool schemas the Editor registered
- `["status"]` live connected Editors
- `["pipeline","list"]` / `["pipeline","install"]`
- `["build"]` / `["test"]` batch mode
- `["auth","status"]`

If `unity_cli_info` says the binary is missing, tell the user to install (do not run the installer unless they ask):

```powershell
$env:UNITY_CLI_CHANNEL='beta'; irm https://public-cdn.cloud.unity3d.com/hub/prod/cli/install.ps1 | iex
```

Do not parse progress bars. Prefer JSON. Errors are on stderr.

## Edit rules

- C# source: `read` / `edit` / `pwsh` as usual.
- Do not rewrite `.meta` GUIDs or YAML assets by guesswork.
- After C# changes with the editor open: `unity_bridge` → `unity_editor` action `start_compilation_pipeline`.
- Play Mode generally blocks writes; stop play before authoring.

## If the bridge is down

Say so. Fall back to Insight VFS and files. Do not invent a Selection.
