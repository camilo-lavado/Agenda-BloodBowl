# Envoltorio para la tarea programada de Windows: corre el sincronizador
# y deja un registro con fecha en automation\sync.log (se sobreescribe
# quedándose solo con las últimas ejecuciones, no crece sin límite).
$ErrorActionPreference = 'Continue'
Set-Location -Path $PSScriptRoot

# Desde una tarea programada, el proceso a veces no ve el Chromium instalado
# en el caché global de %LOCALAPPDATA%\ms-playwright (aunque exista y sea
# visible en una sesión interactiva normal). Para evitarlo, el navegador se
# instala DENTRO del proyecto (automation\node_modules\playwright-core\.local-browsers)
# con PLAYWRIGHT_BROWSERS_PATH=0; hay que instalarlo así una vez:
#   cd automation
#   $env:PLAYWRIGHT_BROWSERS_PATH = "0"; npx playwright install chromium
$env:PLAYWRIGHT_BROWSERS_PATH = '0'

$logPath = Join-Path $PSScriptRoot 'sync.log'
$stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'

"----- $stamp -----" | Out-File -FilePath $logPath -Append -Encoding utf8

& node sync-fumbbl.mjs *>&1 | Out-File -FilePath $logPath -Append -Encoding utf8

# Deja como máximo las últimas ~500 líneas para que el log no crezca sin límite.
if (Test-Path $logPath) {
  $lines = Get-Content $logPath
  if ($lines.Count -gt 500) {
    $lines[-500..-1] | Set-Content $logPath -Encoding utf8
  }
}
