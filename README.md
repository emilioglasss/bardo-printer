# BARDO BURGER — Sistema de impresión de pedidos

Servidor local que recibe los pedidos de la web e imprime el ticket en la
impresora térmica USB **automáticamente**. Funciona sin internet (solo la
web de pedidos necesita conexión).

---

## 1. Requisitos (una sola vez)

- **Node.js** instalado en la computadora del local.
  Descargar de **https://nodejs.org** → botón verde **LTS** → instalar (Siguiente, Siguiente, Listo).
- **Impresora térmica** conectada por USB y encendida.

> **Modo fácil (recomendado):** seguí el archivo **`LEEME-PRIMERO.txt`** y usá
> los botones de doble clic (`INICIAR.bat`, `BUSCAR-IMPRESORA.bat`,
> `PROBAR-IMPRESORA.bat`). No hace falta tocar código ni terminal. El resto de
> este README es la referencia técnica detallada.

## 2. Instalación (una sola vez)

1. Copiar la carpeta `bardo-printer` a la computadora del local (por ejemplo, al Escritorio).
2. Las dependencias **vienen incluidas** (carpeta `node_modules`), así que normalmente
   solo necesitás tener Node.js instalado (punto 1).
3. Si por algún motivo faltan (p. ej. `INICIAR.bat` dice "falta instalar"), doble clic en
   **`INSTALAR.bat`** y esperá a que termine. *(Eso corre `npm install` y necesita internet una vez.)*

## 3. Configuración (una sola vez)

La configuración está en **`config.txt`** (se abre con el Bloc de notas). No hace falta tocar el código.

```
IMPRESORA=USB001      # el puerto de TU impresora (ver abajo)
PUERTO=3001           # dejar así salvo que 3001 esté ocupado
PIN=0000              # mismo PIN que la web
ALIAS=Bardo.esquel    # alias de transferencias (informativo)
```

### ¿Cómo sé el nombre de mi impresora? (IMPRESORA)

La forma fácil: doble clic en **`BUSCAR-IMPRESORA.bat`** y mirá la columna **PortName**
de tu impresora térmica (suele ser **USB001**, **USB002**, etc.). Poné ese valor en
`config.txt` (ej. `IMPRESORA=USB001`), guardá y reabrí `INICIAR.bat`.

A mano: Menú Inicio → **Impresoras y escáneres** → tu impresora → **Propiedades** →
pestaña **Puertos** → mirá cuál está tildado.

Si con el puerto no imprime, otra opción es **compartir** la impresora en Windows y poner
su nombre así: `IMPRESORA=printer:NombreDeLaImpresora`. En Linux sería `IMPRESORA=/dev/usb/lp0`.

## 4. Usar todos los días

1. Doble clic en **`INICIAR.bat`**.
2. **Dejar esa ventana abierta todo el día.** Mientras esté abierta, los pedidos se imprimen solos.
3. Para ver los pedidos del día en pantalla: abrir el navegador y entrar a **http://localhost:3001**
4. Para probar la impresora cuando quieras: doble clic en **`PROBAR-IMPRESORA.bat`** (con `INICIAR.bat` abierto).

Al cerrar el local: cerrá la ventana de `INICIAR.bat`.

*(Técnicamente `INICIAR.bat` corre `node server.js`; podés hacerlo a mano desde una terminal si preferís.)*

## 5. El panel de pedidos (http://localhost:3001)

- Se actualiza solo **cada 10 segundos**.
- Cada pedido muestra: número, turno, cliente, modalidad, items, total y **medallones en plancha**.
- Botones para ir moviendo el pedido: **EN PREPARACIÓN → LISTO → ENTREGADO**.
- Filtros arriba: **TODOS / PENDIENTES / LISTOS / ENTREGADOS**.
- Arriba se ve el total de **pedidos** y de **medallones** del día.
- Los pedidos nuevos (últimos 2 minutos) **parpadean en dorado**.
- Botón **REIMPRIMIR** en cada pedido (pide el PIN `0000`).
- El puntito al lado del título es **verde** si la impresora responde, **rojo** si no.

## 6. Si la impresora no imprime

El sistema **nunca pierde un pedido**, aunque la impresora falle:
- El pedido igual queda guardado y aparece en el panel.
- Cada **30 segundos** reintenta imprimir los que quedaron pendientes.
- Mientras tanto, el ticket se muestra en la ventana de la Terminal.

Qué revisar:
1. Que la impresora esté **encendida** y con papel.
2. Que el cable **USB** esté bien conectado.
3. Que `NOMBRE_IMPRESORA` en `server.js` sea el correcto (ver punto 3).
4. Cerrar la ventana de la Terminal y volver a ejecutar `node server.js`.

## 7. Conexión con la web de pedidos

La web `bardo-pedidos.html` **ya está conectada**: cuando un cliente confirma el
pedido, además de abrir WhatsApp le avisa a este servidor para imprimir. Apunta a
`http://localhost:3001/nuevo-pedido` (es "fire-and-forget": si el servidor está
apagado, el pedido por WhatsApp se manda igual).

> **⚠ Importante si la web está publicada en Netlify (https):**
> Algunos navegadores bloquean que una página `https://` le hable a
> `http://localhost`. Si ves que los pedidos llegan por WhatsApp pero **no se
> imprimen solos**, no se pierde nada: el local los imprime desde el panel con el
> botón **REIMPRIMIR**, o se abre la web localmente. El pedido siempre queda registrado.

## Estructura de archivos

```
bardo-printer/
├── server.js        ← servidor principal (config arriba de todo)
├── printer.js       ← cómo se arma e imprime el ticket
├── package.json     ← lista de dependencias
├── pedidos.json     ← base de datos del día (se crea solo)
├── public/
│   └── index.html   ← el panel de pedidos
└── README.md        ← este archivo
```

## Endpoints (referencia técnica)

| Método | Ruta | Para qué |
|--------|------|----------|
| POST | `/nuevo-pedido` | la web manda un pedido nuevo |
| GET | `/pedidos` | pedidos de hoy (opcional `?estado=pendiente`) |
| PATCH | `/pedidos/:id` | cambiar estado `{ "estado": "listo" }` |
| POST | `/reimprimir/:id` | reimprimir (header `x-pin: 0000`) |
| GET | `/status` | estado del sistema e impresora |
