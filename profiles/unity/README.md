# DSH profile: `unity`

Dedicated **Unity / Tuanjie** profile for DSH Desktop. It does not replace the default `desktop` / `web` profiles.

## Why a separate profile

- Default DSH stays a general coding agent.
- This profile adds Unity Insight VFS tools (`vfs_ls` / `vfs_read` / `vfs_refs` / …) and a Unity-oriented system prompt.
- New engineering projects do **not** require editing this profile: the project root is detected from the **current session workspace**.

## Switch to it

In DSH Desktop tray: **Profile → unity**. The app restarts onto this profile.

Then open a session whose workspace is a Unity / Tuanjie project root (the folder that contains `ProjectSettings/ProjectVersion.txt`). Prefer agent preset **unity-cowork** (composition default). Global `settings.yaml` `agent-presets.default: cordis` may still override — pick `unity-cowork` in the session picker if so. Load skill `unity-tuanjie`.

## New project

1. Create the Unity project as usual.
2. In DSH, set the session workspace to that new root (or pass `project` on a tool).
3. Call `unity_project_info`, then `unity_index` with `build` once.

No path is compiled into `cordis.yml`.

## Tools

See `packages/dsh-unity-insight/README.md`.

Live editor features (`unity_share_asset`, `unity_focus_editor`, `unity_bridge`) spawn `codely serve unity-mcp` on demand against the **current** project. They need Tuanjie/Unity open with Codely Bridge; they do not run at profile boot.
