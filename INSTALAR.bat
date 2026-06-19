@echo off
chcp 65001 >nul
title BARDO - Instalacion (una sola vez)
cd /d "%~dp0"
echo ============================================
echo    BARDO BURGER - Instalacion
echo ============================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo  [ FALTA NODE.JS ]
  echo.
  echo  1^) Entra a:   https://nodejs.org
  echo  2^) Descarga el boton verde "LTS"
  echo  3^) Instalalo: Siguiente, Siguiente, Listo
  echo  4^) Volve a abrir este INSTALAR.bat
  echo.
  pause
  exit /b
)
echo  Node.js detectado:
node --version
echo.
echo  Instalando lo necesario... (puede tardar 1-2 minutos)
echo.
call npm install
echo.
echo ============================================
echo    LISTO. Ya podes usar INICIAR.bat
echo ============================================
pause
