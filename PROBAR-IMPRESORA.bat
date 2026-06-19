@echo off
chcp 65001 >nul
title BARDO - Prueba de impresion
cd /d "%~dp0"
echo ============================================
echo    PRUEBA DE IMPRESION
echo ============================================
echo.
echo  Imprime directo, no hace falta que INICIAR.bat este abierto.
echo.
echo  Enviando un ticket de prueba...
echo.
node enviar-prueba.js
echo.
pause
