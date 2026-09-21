# ===========================================================================
#  NutriTrack — Configurar git de forma segura
#
#  Hace tres cosas:
#    1. Inicializa el repositorio (si no existe)
#    2. Activa el hook pre-commit que bloquea secretos
#    3. VERIFICA que backend/.env realmente queda ignorado
#
#  Uso (desde la raiz del proyecto):
#      powershell -ExecutionPolicy Bypass -File scripts\configurar-git.ps1
#
#  Solo comprueba, sin inicializar:
#      powershell -ExecutionPolicy Bypass -File scripts\configurar-git.ps1 -SoloVerificar
# ===========================================================================

param(
    [switch]$SoloVerificar
)

$ErrorActionPreference = 'Continue'
$raiz = Split-Path $PSScriptRoot -Parent
Set-Location $raiz

function Ok($t)    { Write-Host "  OK   $t" -ForegroundColor Green }
function Aviso($t) { Write-Host "  !!   $t" -ForegroundColor Yellow }
function Fallo($t) { Write-Host "  XX   $t" -ForegroundColor Red }

Write-Host "`n=== Configuracion de git para NutriTrack ===`n" -ForegroundColor White

# --- 1. Repositorio --------------------------------------------------------
$tieneRepo = Test-Path (Join-Path $raiz '.git')

if (-not $tieneRepo) {
    if ($SoloVerificar) {
        Aviso "No hay repositorio git (modo -SoloVerificar: no se crea)"
    } else {
        Write-Host "[1/3] Inicializando repositorio git..."
        git init --quiet
        if ($LASTEXITCODE -eq 0) { Ok "Repositorio creado" } else { Fallo "No se pudo crear el repositorio"; exit 1 }
    }
} else {
    Write-Host "[1/3] Repositorio git"
    Ok "Ya existe"
}

# --- 2. Hook pre-commit ----------------------------------------------------
Write-Host "`n[2/3] Hook pre-commit (bloquea secretos)"

if (Test-Path (Join-Path $raiz '.githooks/pre-commit')) {
    if ($tieneRepo -or -not $SoloVerificar) {
        git config core.hooksPath .githooks
        if ($LASTEXITCODE -eq 0) {
            $actual = git config --get core.hooksPath
            if ($actual -eq '.githooks') {
                Ok "Hook activado (core.hooksPath = .githooks)"
            } else {
                Fallo "No se pudo fijar core.hooksPath (valor: $actual)"
            }
        }
    }
} else {
    Fallo "No se encuentra .githooks/pre-commit"
}

# --- 3. Verificacion -------------------------------------------------------
Write-Host "`n[3/3] Verificando que los secretos quedan fuera"

if (-not (Test-Path (Join-Path $raiz '.git'))) {
    Aviso "Sin repositorio no se puede verificar. Ejecuta sin -SoloVerificar."
} else {
    $criticos = @(
        'backend/.env',
        'frontend/.env',
        'backend/uploads',
        'node_modules',
        'backend/node_modules',
        'frontend/node_modules',
        'frontend/dist'
    )

    $fallos = 0
    foreach ($ruta in $criticos) {
        if (Test-Path (Join-Path $raiz $ruta)) {
            git check-ignore --quiet $ruta 2>$null
            if ($LASTEXITCODE -eq 0) {
                Ok "ignorado: $ruta"
            } else {
                Fallo "NO IGNORADO: $ruta   <-- REVISAR"
                $fallos++
            }
        }
    }

    # Comprobacion definitiva: ¿git ve el .env?
    $versionados = git ls-files --cached 2>$null
    $envVersionado = $versionados | Where-Object { $_ -match '(^|/)\.env$' }

    Write-Host ""
    if ($envVersionado) {
        Fallo "Hay archivos .env VERSIONADOS:"
        $envVersionado | ForEach-Object { Write-Host "       $_" }
        Write-Host "`n     Solucion:  git rm --cached $_" -ForegroundColor Yellow
        $fallos++
    } else {
        Ok "Ningun archivo .env esta versionado"
    }

    # ¿Aparece el .env en lo que git subiria?
    $pendientes = git status --porcelain 2>$null | Where-Object { $_ -match '\.env' }
    if ($pendientes) {
        Aviso "git ve estos .env en el area de trabajo (deberian estar ignorados):"
        $pendientes | ForEach-Object { Write-Host "       $_" }
    }

    Write-Host ""
    if ($fallos -eq 0) {
        Write-Host "=== Todo correcto: los secretos estan protegidos ===" -ForegroundColor Green
    } else {
        Write-Host "=== ATENCION: $fallos problema(s) detectado(s) ===" -ForegroundColor Red
        exit 1
    }
}

Write-Host @"

Recordatorio:
  · backend/.env contiene DEEPSEEK_API_KEY, JWT_SECRET y DATABASE_URL.
  · Nunca lo subas. Si algun dia se sube, REVOCA la clave en DeepSeek:
    borrarla del repositorio no la invalida (queda en el historial).

"@ -ForegroundColor DarkGray
