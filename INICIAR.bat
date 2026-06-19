@echo off
chcp 65001 >nul
title BARDO - Sistema de Pedidos  (DEJAR ESTA VENTANA ABIERTA)
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo  Falta instalar Node.js. Abri primero INSTALAR.bat
  echo.
  pause
  exit /b
)
if not exist "node_modules" (
  echo  Falta instalar. Abri primero INSTALAR.bat
  echo.
  pause
  exit /b
)
echo ============================================
echo    BARDO BURGER - SISTEMA EN MARCHA
echo.
echo    Los pedidos de la web se imprimen solos aca.
echo    DEJA ESTA VENTANA ABIERTA durante el servicio.
echo    Para apagar: cerra esta ventana.
echo ============================================
echo.
node poller.js
echo.
echo  El sistema se detuvo. Apreta una tecla para cerrar.
pause
