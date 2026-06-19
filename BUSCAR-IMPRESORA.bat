@echo off
chcp 65001 >nul
title BARDO - Buscar impresora
cd /d "%~dp0"
echo ============================================
echo    IMPRESORAS INSTALADAS EN ESTA PC
echo ============================================
echo.
powershell -NoProfile -Command "Get-Printer | Select-Object Name, PortName | Format-Table -AutoSize"
echo.
echo --------------------------------------------
echo  Buscа tu impresora termica y mira la columna PortName.
echo  Suele ser USB001, USB002, etc.
echo.
echo  Despues abri config.txt (Bloc de notas) y poni esa linea, ej:
echo       IMPRESORA=USB001
echo.
echo  Si el ticket no sale con el puerto, proba con el nombre:
echo       IMPRESORA=printer:NOMBRE_QUE_APARECE_ARRIBA
echo --------------------------------------------
echo.
pause
