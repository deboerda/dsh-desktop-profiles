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

Write-Host ""
Write-Host "Restore done. Restart DSH Desktop, then pick profile web / desktop / unity."
Write-Host "xAI: Settings -> xAI (Grok/X) login."
Write-Host "Tongyuan: put TONGYUAN_API_KEY in $cred"
