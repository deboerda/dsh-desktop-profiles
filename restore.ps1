# Restore DSH Desktop profiles + local plugins onto this machine.
# Run AFTER DSH Desktop has been launched once (so %USERPROFILE%\.dsh exists).
#
#   powershell -ExecutionPolicy Bypass -File .\restore.ps1
#
$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$DshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE ".dsh" }

if (-not (Test-Path $DshHome)) {
  throw "DSH home not found: $DshHome. Install and launch DSH Desktop once, then re-run."
}

Write-Host "DSH home: $DshHome"
Write-Host "Repo:     $RepoRoot"

$pluginDst = Join-Path $DshHome "plugins"
$profileDst = Join-Path $DshHome "profiles"
$presetDst = Join-Path $DshHome ".agent-presets"
New-Item -ItemType Directory -Force -Path $pluginDst, $profileDst, $presetDst | Out-Null

function Copy-Dir($src, $dst) {
  if (Test-Path $dst) {
    Get-ChildItem $dst -Force | Where-Object { $_.Name -ne "node_modules" } | Remove-Item -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path $dst | Out-Null
  robocopy $src $dst /E /XD node_modules .git /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy failed $src -> $dst ($LASTEXITCODE)" }
}

Copy-Dir (Join-Path $RepoRoot "plugins") $pluginDst
foreach ($name in @("web", "desktop", "unity")) {
  Copy-Dir (Join-Path $RepoRoot "profiles\$name") (Join-Path $profileDst $name)
}
Copy-Dir (Join-Path $RepoRoot "agent-presets\unity-cowork") (Join-Path $presetDst "unity-cowork")
Copy-Dir (Join-Path $RepoRoot "agent-presets\local-qwen-app") (Join-Path $presetDst "local-qwen-app")

$example = Join-Path $RepoRoot "settings.example.yaml"
$settings = Join-Path $DshHome "settings.yaml"
if (-not (Test-Path $settings)) {
  Copy-Item $example $settings
  Write-Host "Wrote $settings from example (no API keys)."
} else {
  Write-Host "Kept existing $settings"
}

$cred = Join-Path $DshHome ".credentials.yaml"
if (-not (Test-Path $cred)) {
  @"
version: 1
refs:
  TONGYUAN_API_KEY: REPLACE_ME
  LOCAL_IQ3_API_KEY: local-iq3
  LOCAL_QWEN_API_KEY: local-qwen
records: {}
"@ | Set-Content -Path $cred -Encoding utf8
  Write-Host "Created $cred — fill TONGYUAN_API_KEY, then login xAI in the app."
} else {
  Write-Host "Kept existing $cred"
}

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Write-Warning "pnpm not found. Install pnpm, then run: pnpm install in each profile folder."
  exit 0
}

foreach ($name in @("web", "desktop", "unity")) {
  $dir = Join-Path $profileDst $name
  Write-Host "pnpm install $name ..."
  Push-Location $dir
  try {
    pnpm install
  } finally {
    Pop-Location
  }
}

# Link every local plugin under plugins\ into each profile node_modules. `pnpm install`
# only restores what each package.json declares; plugins dropped in by hand (and bundled
# packages such as the OpenViking memory plugins) need an explicit link.
$linked = 0
foreach ($plugin in (Get-ChildItem $pluginDst -Directory -ErrorAction SilentlyContinue)) {
  foreach ($name in @("web", "desktop", "unity")) {
    $nm = Join-Path (Join-Path $profileDst $name) "node_modules"
    if (-not (Test-Path $nm)) { continue }
    $link = Join-Path $nm $plugin.Name
    if (Test-Path $link) { continue }
    try {
      New-Item -ItemType Junction -Path $link -Target $plugin.FullName -ErrorAction Stop | Out-Null
      $linked++
    } catch {
      Write-Warning ("could not link " + $plugin.Name + " into " + $name + ": " + $_.Exception.Message)
    }
  }
}
Write-Host ("Linked $linked local plugin(s) into profile node_modules.")

Write-Host ""
Write-Host "Restore done. Restart DSH Desktop, then pick profile web / desktop / unity."
Write-Host "OpenViking memory (optional): copy the 3 packages listed in README into profile node_modules"
Write-Host "  and replace <OPENVIKING_USER_KEY> in the profile patches."
Write-Host "xAI: Settings -> xAI (Grok/X) login."
Write-Host "Tongyuan: put TONGYUAN_API_KEY in $cred"
