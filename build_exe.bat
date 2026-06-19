@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   Generando ejecutable para Bardo Printer
echo ============================================
echo.
echo Instalando dependencias necesarias...
python -m pip install -r requirements.txt
echo.
echo Construyendo ejecutable...
pyinstaller --noconfirm --onefile --windowed bardo_printer.py
echo.
echo Listo. El ejecutable se encuentra en:
echo    dist\bardo_printer.exe
echo.
echo Si queres, copialo junto a config.txt al mismo directorio.
pause
