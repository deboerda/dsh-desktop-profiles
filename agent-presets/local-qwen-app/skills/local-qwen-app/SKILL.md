---
name: local-qwen-app
description: Use when building complete apps in this workspace with the local 32K Qwen3.6 (llama-server). Context engineering, working set, memory files, one feature per turn.
---

# Local Qwen 32K app development

Load this skill before writing application code. The model window is 32K; after DSH tools, budget about 12-20K.

## Runtime

- llama-server must be at http://127.0.0.1:8080 (start `E:\\AI\\LLM\\start-qwen36.bat` if health fails).
- Prefer DSH model **Qwen3.6 35B-A3B IQ4_XS (32K local)**.
- Prefill of long files can take 30-120s. Do not retry as a hang.
- Core tools stay always-on: read / write / edit / grep / glob / pwsh / todo / skill / jobs / run_code.
- Every pwsh / run_code call MUST include `description` (5-10 English words). `command`/`code` alone is invalid.
- Excel / Office / Univer / PDF / 键鼠 / Unity schemas are deferred. Call enable_tools only when the user is on those files.

## Layout

- App code: `apps/<name>` only.
- Do not read `LLM/models`, `LLM/llama.cpp`, `LLM/downloads`, or `*.gguf`.
- Memory: `context-eng/memory/progress.md` and `context-eng/memory/decisions.md`.
- Workspace constitution: `AGENTS.md` (already injected; do not paste it again).

## Loop

1. Read the two memory files. List `apps/<name>` (create if missing).
2. grep / read line ranges. Working set ≤ 4 source files.
3. One feature. Small patch. No whole-repo dumps.
4. Append one bullet to progress.md (and a decision if a stack choice was made).
5. Reply with what changed, how to run, and the next slice.

## Stop conditions

If the task is a full product, implement the first vertical slice only, then stop.
