/**
 * Restore the Windows subprocess Job runner in DSH Desktop.
 *
 * @deepseek-ai/dsh-subprocess-local launches its runner with
 * `process.execPath` — the Electron binary. Electron only starts as Node when
 * `ELECTRON_RUN_AS_NODE` is set. Without it the runner boots a second GUI
 * application that exits 0 immediately, never sending its IPC result, so every
 * local command fails with:
 *
 *   subprocess-local: Windows Job runner exited with exit code 0 before
 *   proving its managed range empty
 *
 * The runner environment comes from `scrubbedParentEnv()`, which re-reads
 * `process.env` on every spawn and only drops credential-shaped names and
 * `DSH_*`. Setting the flag here therefore reaches the runner — and every
 * other Host-side `process.execPath` child (MCP servers, the directory-picker
 * worker, the sandbox worker) — without patching app.asar, so the installer
 * integrity check stays intact.
 */

export const name = 'win-job-runner-fix'

/** No Host service is needed: this only prepares the process environment. */
export const inject = []

let installed = false

/**
 * Mark Host-side children of the Electron binary as Node processes.
 * @returns whether this call changed the environment.
 */
export function installElectronRunAsNode() {
  if (installed) return false
  installed = true
  if (process.platform !== 'win32') return false
  if (process.versions.electron === undefined) return false
  if (process.env.ELECTRON_RUN_AS_NODE === '1') return false
  process.env.ELECTRON_RUN_AS_NODE = '1'
  return true
}

// Set at import time as well: the flag must be in place before the first child
// spawn, and bundle plugins are imported while the Host composes.
installElectronRunAsNode()

/**
 * Cordis entry point.
 * @param ctx - Host context.
 */
export function apply(ctx) {
  installElectronRunAsNode()
  ctx?.logger?.debug?.('win-job-runner-fix: ELECTRON_RUN_AS_NODE=1 for Host-side children')
}
