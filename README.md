# BARDO BURGER — Cliente Python de impresión de pedidos

Este repositorio ahora usa un cliente local en Python para recibir pedidos de la web
(vía Supabase REST API) y enviar el ticket a la impresora térmica.

## 1. Qué hace ahora

- Lee pedidos nuevos de la tabla `pedidos` en Supabase.
- Imprime cada pedido en la impresora configurada.
- Marca el pedido como `impreso=true` en la base de datos.
- Tiene una interfaz gráfica simple para usuarios no técnicos.
- Permite configurar todo desde la misma aplicación sin editar archivos.

## 2. Requisitos

- Python 3.10+ instalado en la PC local.
- Una impresora térmica o impresora de Windows instalada.
- Conexión a Internet para hablar con Supabase.

## 3. Cómo usarlo

1. Instala las dependencias:

```powershell
python -m pip install -r requirements.txt
```

2. Ejecuta la aplicación:

```powershell
python bardo_printer.py
```

3. En la ventana, completa los datos de configuración:
- `Supabase URL`
- `Clave Supabase`
- `Intervalo (s)`
- `Impresora`

4. Presiona `Guardar configuración`.
5. Presiona `Iniciar servicio`.
6. Usa `Probar impresora` para verificar la impresión.

## 4. Configuración desde la UI

La aplicación tiene un panel donde podés:

- seleccionar la impresora instalada
- cargar la lista de impresoras de Windows
- elegir la impresora y guardar la selección
- escribir la URL y la clave de Supabase
- cambiar el intervalo de chequeo

No es necesario editar `config.txt` manualmente.

## 5. Uso avanzado con `config.txt`

Si preferís, la aplicación puede guardar la configuración en `config.txt`.
Tras completar y guardar desde la UI, ese archivo queda disponible para
cargas posteriores.

## 6. Generar el ejecutable `.exe`

Para crear un `.exe` listo para usar:

1. Asegurate de tener las dependencias instaladas:

```powershell
python -m pip install -r requirements.txt
```

2. Ejecuta el script de build:

```powershell
build_exe.bat
```

3. El ejecutable se genera en `dist\bardo_printer.exe`.

4. Copia `bardo_printer.exe` y, si querés,
   `config.txt` al mismo directorio para conservar la configuración.

## 7. Archivos principales

- `bardo_printer.py` — cliente Python principal.
- `requirements.txt` — dependencias necesarias.
- `build_exe.bat` — automatiza la creación del `.exe`.

## 8. Si la impresora no imprime

- Verifica que la impresora esté encendida y conectada.
- Presiona `Cargar impresoras` y selecciona el nombre correcto.
- Si la impresora está instalada en Windows, usa `printer:NombreDeLaImpresora`.
- Si falla, el log en la aplicación mostrará el error de PowerShell.
