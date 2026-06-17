$ErrorActionPreference = 'Stop'
$files = @(
  'src/main/main.js',
  'src/preload/preload.js',
  'src/preload/preload-settings.js',
  'src/main/app-preferences.js',
  'src/main/paths.js',
  'src/main/docs/doc-loader.js',
  'src/main/bridge/bridge-client.js',
  'src/preload/dropped-files.js',
  'src/main/migration/user-data-migrate.js',
  'scripts/build-win.js',
  'scripts/generate-icons.js',
  'scripts/generate-placeholders.js'
)
foreach ($file in $files) {
  if (-not (Test-Path $file)) {
    throw "Syntax check file missing: $file"
  }
  node --check $file
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
Write-Host 'Syntax check passed.'
