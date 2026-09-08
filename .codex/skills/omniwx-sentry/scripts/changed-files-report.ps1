param(
  [string]$BaseRef = "",
  [switch]$Cached
)

$ErrorActionPreference = "Stop"

function Get-UntrackedNames {
  git ls-files --others --exclude-standard
}

function Get-DiffNames {
  param(
    [string]$Ref,
    [bool]$UseCached
  )

  if ($Ref) {
    git diff --name-only $Ref...HEAD
    return
  }

  if ($UseCached) {
    git diff --cached --name-only
    return
  }

  git diff --name-only
}

$trackedFiles = @(Get-DiffNames -Ref $BaseRef -UseCached $Cached.IsPresent | Where-Object { $_ -and $_.Trim() -ne "" })
$untrackedFiles = @()

if (-not $BaseRef -and -not $Cached.IsPresent) {
  $untrackedFiles = @(Get-UntrackedNames | Where-Object { $_ -and $_.Trim() -ne "" })
}

$files = @($trackedFiles + $untrackedFiles | Sort-Object -Unique)

if (-not $files.Count) {
  Write-Output "No changed files found for the selected diff."
  exit 0
}

$buckets = [ordered]@{
  "app" = @()
  "android" = @()
  "backend" = @()
  "docs" = @()
  "config" = @()
  "other" = @()
}

foreach ($file in $files) {
  switch -Regex ($file) {
    '^app/' { $buckets["app"] += $file; continue }
    '^components/' { $buckets["app"] += $file; continue }
    '^hooks/' { $buckets["app"] += $file; continue }
    '^android/' { $buckets["android"] += $file; continue }
    '^omniwx-api/' { $buckets["backend"] += $file; continue }
    '^docs/' { $buckets["docs"] += $file; continue }
    '^(app\.json|app\.config\.js|package\.json|package-lock\.json|eas\.json|tsconfig\.json|eslint\.config\.js)$' {
      $buckets["config"] += $file
      continue
    }
    default { $buckets["other"] += $file }
  }
}

foreach ($bucket in $buckets.Keys) {
  $items = @($buckets[$bucket])
  if (-not $items.Count) {
    continue
  }

  Write-Output "[$bucket]"
  $items | ForEach-Object { Write-Output " - $_" }
}

$needsNative = $files | Where-Object {
  $_ -match '^android/' -or
  $_ -match '^app/' -or
  $_ -match '^components/' -or
  $_ -match '^app\.json$' -or
  $_ -match '^app\.config\.js$'
}

$needsBackendSecurity = $files | Where-Object {
  $_ -match '^omniwx-api/src/' -or
  $_ -match '^omniwx-api/wrangler\.jsonc$'
}

Write-Output ""
Write-Output "Suggested checks:"
Write-Output " - npm run lint -- --quiet"
Write-Output " - npx tsc --noEmit"
if ($needsNative) {
  Write-Output " - cd android; .\\gradlew.bat :app:compileReleaseKotlin --console=plain"
}
if ($needsBackendSecurity) {
  Write-Output " - security review omniwx-api request flow, headers, CORS, logging, and rate limiting"
}
