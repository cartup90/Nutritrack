# ===========================================================================
#  NutriTrack - Finalizar la instalacion de Docker (ejecutar TRAS reiniciar)
#
#  Qué hace:
#    1. Instala/actualiza el kernel de WSL2
#    2. Arranca Docker Desktop y espera a que el daemon responda
#    3. Verifica que `docker run hello-world` funciona
#
#  Uso (PowerShell COMO ADMINISTRADOR):
#      powershell -ExecutionPolicy Bypass -File scripts\finalizar-docker.ps1
# ===========================================================================

$ErrorActionPreference = 'Continue'

function Paso($n, $texto) { Write-Host "`n[$n] $texto" -ForegroundColor Cyan }
function Ok($t)    { Write-Host "    OK  $t" -ForegroundColor Green }
function Aviso($t) { Write-Host "    !!  $t" -ForegroundColor Yellow }
function Fallo($t) { Write-Host "    XX  $t" -ForegroundColor Red }

# --- Comprobar privilegios -------------------------------------------------
$esAdmin = ([Security.Principal.WindowsPrincipal] `
    [Security.Principal.WindowsIdentity]::GetCurrent()
).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $esAdmin) {
    Fallo "Este script necesita permisos de administrador."
    Write-Host "    Abre PowerShell como administrador y vuelve a ejecutarlo.`n"
    exit 1
}

Write-Host "`n=== Finalizando instalacion de Docker para NutriTrack ===" -ForegroundColor White

# --- 1. Kernel de WSL2 -----------------------------------------------------
Paso 1 "Instalando / actualizando el kernel de WSL2..."

try {
    $salida = wsl --update 2>&1 | Out-String
    if ($salida -match 'error|no se reconoce|not recognized') {
        Aviso "wsl --update no funciono, probando 'wsl --install --no-distribution'..."
        wsl --install --no-distribution 2>&1 | Out-String | Write-Host
    } else {
        Ok "WSL actualizado"
    }
} catch {
    Aviso "No se pudo actualizar WSL automaticamente: $_"
}

wsl --version 2>&1 | Select-Object -First 3 | ForEach-Object { Write-Host "    $_" }

# --- 2. Arrancar Docker Desktop -------------------------------------------
Paso 2 "Arrancando Docker Desktop..."

$dockerExe = @(
    "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe",
    "${env:ProgramFiles(x86)}\Docker\Docker\Docker Desktop.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $dockerExe) {
    Fallo "No se encuentra 'Docker Desktop.exe'. Reinstala con:"
    Write-Host "        winget install --id Docker.DockerDesktop -e"
    exit 1
}

if (-not (Get-Process -Name 'Docker Desktop' -ErrorAction SilentlyContinue)) {
    Start-Process $dockerExe | Out-Null
    Ok "Docker Desktop lanzado"
} else {
    Ok "Docker Desktop ya estaba en marcha"
}

# --- 3. Esperar al daemon --------------------------------------------------
Paso 3 "Esperando a que el daemon de Docker responda (hasta 3 minutos)..."

$docker = "$env:ProgramFiles\Docker\Docker\resources\bin\docker.exe"
$listo = $false

for ($i = 1; $i -le 36; $i++) {
    Start-Sleep -Seconds 5
    $out = & $docker info --format '{{.ServerVersion}}' 2>$null
    if ($LASTEXITCODE -eq 0 -and $out) {
        Ok "Daemon activo (Docker Engine $out) -- tras $($i * 5)s"
        $listo = $true
        break
    }
    Write-Host "    ... esperando ($($i * 5)s)" -ForegroundColor DarkGray
}

if (-not $listo) {
    Fallo "El daemon no respondio a tiempo."
    Write-Host @"

    Prueba manualmente:
      1. Abre 'Docker Desktop' desde el menu Inicio
      2. Acepta el contrato de licencia la primera vez
      3. Espera a que el icono de la ballena deje de animarse
      4. Vuelve a ejecutar este script

"@
    exit 1
}

# --- 4. Prueba real --------------------------------------------------------
Paso 4 "Ejecutando contenedor de prueba..."

& $docker run --rm hello-world 2>&1 | Select-String -Pattern 'Hello from Docker|working correctly' | ForEach-Object { Ok $_.Line.Trim() }

# --- 5. Utilidad para NutriTrack ------------------------------------------
Paso 5 "Comprobando 'docker compose' para NutriTrack..."

$compose = & $docker compose version 2>&1
if ($LASTEXITCODE -eq 0) {
    Ok ($compose | Select-Object -First 1)
    Write-Host @"

    Ya puedes levantar el stack completo del proyecto:
        cd '$(Split-Path $PSScriptRoot -Parent)'
        docker compose --profile full up -d --build

    O solo la base de datos (aunque ya tienes PostgreSQL nativo):
        docker compose up -d db

"@
} else {
    Aviso "El plugin 'docker compose' no responde todavia."
}

Write-Host "=== Docker listo ===" -ForegroundColor Green
