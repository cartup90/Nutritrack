# ===========================================================================
#  NutriTrack — Levantar la app y exponerla por HTTPS
#
#  Arranca los tres servicios necesarios y te da una URL publica para probar
#  en el movil e instalar la PWA:
#
#    1. Backend  (Node + Express + PostgreSQL)   -> localhost:5000
#    2. Frontend (build de produccion, Vite)     -> localhost:4173
#    3. Tunel HTTPS (cloudflared)                -> https://xxxx.trycloudflare.com
#
#  El tunel es necesario porque Chrome solo permite instalar una PWA (y
#  registrar el service worker) desde HTTPS o localhost. Por la IP de la red
#  local no funciona.
#
#  Uso:
#      powershell -ExecutionPolicy Bypass -File scripts\probar-app.ps1
#
#  Para detenerlo: cierra las dos ventanas que se abren y pulsa Ctrl+C aqui.
# ===========================================================================

$ErrorActionPreference = 'Continue'
$raiz = Split-Path $PSScriptRoot -Parent

function Paso($t) { Write-Host "`n$t" -ForegroundColor Cyan }
function Ok($t)   { Write-Host "  OK  $t" -ForegroundColor Green }
function Mal($t)  { Write-Host "  XX  $t" -ForegroundColor Red }

Write-Host "`n=== NutriTrack: pruebas en el movil ===" -ForegroundColor White

# --- Comprobaciones previas ------------------------------------------------
Paso "Comprobando requisitos..."

if (-not (Test-Path "$raiz\backend\node_modules")) { Mal "Faltan dependencias: cd backend && npm install"; exit 1 }
if (-not (Test-Path "$raiz\frontend\node_modules")) { Mal "Faltan dependencias: cd frontend && npm install"; exit 1 }
Ok "Dependencias instaladas"

if (-not (Test-Path "$raiz\backend\.env")) {
  Mal "Falta backend\.env (ahi van la API key de DeepSeek y la base de datos)"
  exit 1
}
Ok "backend\.env presente"

if (-not (Get-Service postgresql-x64-16 -ErrorAction SilentlyContinue | Where-Object Status -eq 'Running')) {
  Write-Host "  !   PostgreSQL no esta corriendo. Arrancandolo..." -ForegroundColor Yellow
  Start-Service postgresql-x64-16 -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 3
}
Ok "PostgreSQL en marcha"

$cloudflared = @(
  "$env:ProgramFiles\cloudflared\cloudflared.exe",
  "${env:ProgramFiles(x86)}\cloudflared\cloudflared.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $cloudflared) {
  Mal "No se encuentra cloudflared. Instalalo con:"
  Write-Host "        winget install --id Cloudflare.cloudflared -e"
  exit 1
}
Ok "cloudflared encontrado"

# --- Build del frontend ---------------------------------------------------
Paso "Construyendo el frontend (build de produccion)..."
Push-Location "$raiz\frontend"
npm run build 2>&1 | Out-Null
$buildOk = $LASTEXITCODE -eq 0
if (Test-Path "$raiz\frontend\dist\index.html") { $buildOk = $true }
Pop-Location

if ($buildOk) { Ok "Build listo en frontend\dist" } else { Mal "El build fallo"; exit 1 }

# --- Backend y frontend ---------------------------------------------------
Paso "Arrancando backend y frontend en ventanas aparte..."

Start-Process cmd -ArgumentList '/k', "title NutriTrack API && cd /d `"$raiz\backend`" && node src/server.js"
Start-Sleep -Seconds 6

Start-Process cmd -ArgumentList '/k', "title NutriTrack Web && cd /d `"$raiz\frontend`" && node node_modules\vite\bin\vite.js preview --port 4173 --strictPort"
Start-Sleep -Seconds 8

try {
  Invoke-RestMethod -Uri 'http://127.0.0.1:5000/api/health' -TimeoutSec 8 | Out-Null
  Ok "Backend responde en localhost:5000"
} catch { Mal "El backend no responde. Revisa la ventana 'NutriTrack API'."; exit 1 }

try {
  Invoke-WebRequest -Uri 'http://127.0.0.1:4173/' -UseBasicParsing -TimeoutSec 8 | Out-Null
  Ok "Frontend responde en localhost:4173"
} catch { Mal "El frontend no responde. Revisa la ventana 'NutriTrack Web'."; exit 1 }

# --- Tunel ----------------------------------------------------------------
Paso "Abriendo el tunel HTTPS (leyendo la URL)..."
Write-Host "  (la primera vez tarda unos segundos)" -ForegroundColor DarkGray

$log = Join-Path $env:TEMP "nutritrack-tunel.log"
if (Test-Path $log) { Remove-Item $log -Force }

$proc = Start-Process -FilePath $cloudflared `
  -ArgumentList 'tunnel', '--url', 'http://localhost:4173', '--no-autoupdate' `
  -RedirectStandardError $log -NoNewWindow -PassThru

$url = $null
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Seconds 1
  if (Test-Path $log) {
    $m = Select-String -Path $log -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -ErrorAction SilentlyContinue |
      Select-Object -First 1
    if ($m) { $url = $m.Matches[0].Value; break }
  }
}

if (-not $url) {
  Mal "No se pudo obtener la URL del tunel. Revisa: $log"
  exit 1
}

# Comprobacion de que la URL responde de verdad
$accesible = $false
for ($i = 0; $i -lt 6; $i++) {
  try {
    Invoke-WebRequest -Uri "$url/api/health" -UseBasicParsing -TimeoutSec 20 | Out-Null
    $accesible = $true; break
  } catch { Start-Sleep -Seconds 3 }
}

Write-Host ""
Write-Host "  ============================================================" -ForegroundColor Green
Write-Host "    TU APP ESTA PUBLICADA" -ForegroundColor Green
Write-Host ""
Write-Host "    $url" -ForegroundColor White
Write-Host ""
Write-Host "    PC   : abre esa URL en el navegador" -ForegroundColor Gray
Write-Host "    MOVIL: abrela en Chrome y toca 'Instalar NutriTrack'" -ForegroundColor Gray
Write-Host "  ============================================================" -ForegroundColor Green

if ($accesible) { Write-Host "`n  Verificado: la API responde a traves del tunel" -ForegroundColor Green }
else { Write-Host "`n  !  El tunel aun no responde; espera unos segundos y recarga" -ForegroundColor Yellow }

Write-Host @"

  Notas:
    - La primera vez, crea una cuenta (no hay usuarios de demo en la
      base de datos real).
    - Si ves algo raro, recarga con Ctrl+Shift+R: el service worker
      cachea la app con agresividad.
    - La URL cambia cada vez que reinicias este script.
    - Para parar: cierra las ventanas 'NutriTrack API' y 'NutriTrack Web'
      y pulsa Ctrl+C aqui.

"@ -ForegroundColor DarkGray

Write-Host "  Tunel en marcha. Pulsa Ctrl+C para detenerlo." -ForegroundColor DarkGray

try { Wait-Process -Id $proc.Id } catch { }
