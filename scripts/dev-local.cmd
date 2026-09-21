@echo off
REM ===========================================================================
REM  NutriTrack - Arranque de desarrollo local (Windows)
REM
REM  Levanta el backend con base de datos EN MEMORIA y el frontend con Vite,
REM  cada uno en su propia ventana. No requiere instalar PostgreSQL ni Docker.
REM
REM  Uso:  doble clic, o desde la raiz del proyecto:
REM          scripts\dev-local.cmd
REM ===========================================================================

setlocal
set "ROOT=%~dp0.."

if not exist "%ROOT%\backend\node_modules" (
  echo.
  echo   [!] Faltan las dependencias del backend.
  echo       Ejecuta primero:  cd backend ^&^& npm install
  echo.
  pause
  exit /b 1
)

if not exist "%ROOT%\frontend\node_modules" (
  echo.
  echo   [!] Faltan las dependencias del frontend.
  echo       Ejecuta primero:  cd frontend ^&^& npm install
  echo.
  pause
  exit /b 1
)

echo.
echo   Iniciando NutriTrack...
echo.
echo   Backend  : http://localhost:5000/api   (PostgreSQL en memoria + datos demo)
echo   Frontend : http://localhost:5173
echo.
echo   Usuario demo:  demo@nutritrack.app  /  demo1234
echo.
echo   Cierra las dos ventanas que se abren para detener la app.
echo.

REM /D fija el directorio de trabajo sin necesidad de comillas anidadas
start "NutriTrack API" /D "%ROOT%\backend" cmd /k "npm run dev:memory -- --seed"
timeout /t 4 /nobreak >nul
start "NutriTrack Web" /D "%ROOT%\frontend" cmd /k "npm run dev"

timeout /t 8 /nobreak >nul
start "" "http://localhost:5173"

endlocal
