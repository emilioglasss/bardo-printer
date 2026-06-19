/* ============================================================
   BARDO BURGER - Servidor de pedidos + impresion termica
   Levanta un servidor local, recibe los pedidos de la web,
   los guarda en pedidos.json y los manda a la impresora USB.
   Ejecutar:   npm install    y luego    node server.js
   ============================================================ */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');
const printer = require('./printer');

// ===================== CONFIG =====================
// Estos valores se cambian SIN tocar codigo: edita el archivo "config.txt"
// con el Bloc de notas. Si config.txt no existe, se usan estos por defecto.
let PUERTO_SERVIDOR  = 3001;
let PIN_ADMIN_WEB    = '0000';
let NOMBRE_IMPRESORA = '\\\\.\\USB001';

// convierte lo que escribe el usuario en config.txt al formato que necesita la impresora
function normalizarImpresora(v) {
  v = String(v || '').trim();
  if (!v) return '\\\\.\\USB001';
  if (/^(printer:|tcp:|\/dev\/|\\\\)/i.test(v)) return v;               // ya trae prefijo
  if (/^(USB|COM|LPT)\d+$/i.test(v)) return '\\\\.\\' + v.toUpperCase(); // USB001 -> \\.\USB001
  return v;
}

function cargarConfig() {
  try {
    const ruta = path.join(__dirname, 'config.txt');
    if (!fs.existsSync(ruta)) return;
    const cfg = {};
    fs.readFileSync(ruta, 'utf8').split(/\r?\n/).forEach(linea => {
      const l = linea.trim();
      if (!l || l.startsWith('#')) return;
      const i = l.indexOf('=');
      if (i === -1) return;
      cfg[l.slice(0, i).trim().toUpperCase()] = l.slice(i + 1).trim();
    });
    if (cfg.PUERTO && !isNaN(Number(cfg.PUERTO))) PUERTO_SERVIDOR = Number(cfg.PUERTO);
    if (cfg.PIN) PIN_ADMIN_WEB = cfg.PIN;
    if (cfg.IMPRESORA) NOMBRE_IMPRESORA = normalizarImpresora(cfg.IMPRESORA);
  } catch (e) { /* si algo falla, quedan los valores por defecto */ }
}

cargarConfig();
printer.init(NOMBRE_IMPRESORA);

const ARCHIVO_PEDIDOS = path.join(__dirname, 'pedidos.json');

const app = express();
app.use(cors());                          // permite cualquier origen (la web viene de Netlify)
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // sirve el panel en /

// -------------------- utilidades --------------------
function log(msg) {
  const d = new Date();
  const h = String(d.getHours()).padStart(2, '0') + ':' +
            String(d.getMinutes()).padStart(2, '0') + ':' +
            String(d.getSeconds()).padStart(2, '0');
  console.log('[' + h + '] ' + msg);
}

function idCortoLog(id) { return String(id).slice(-4); }

function generarId() {
  // timestamp + 3 digitos al azar  ->  id unico
  return Date.now().toString() + Math.floor(100 + Math.random() * 900).toString();
}

function esDeHoy(ts) {
  const d = new Date(ts), h = new Date();
  return d.getFullYear() === h.getFullYear() &&
         d.getMonth() === h.getMonth() &&
         d.getDate() === h.getDate();
}

async function leerPedidos() {
  try {
    if (!(await fs.pathExists(ARCHIVO_PEDIDOS))) return [];
    const data = await fs.readJson(ARCHIVO_PEDIDOS, { throws: false });
    return Array.isArray(data) ? data : [];
  } catch (e) {
    log('Error leyendo pedidos.json: ' + e.message);
    return [];
  }
}

async function guardarPedidos(lista) {
  try {
    await fs.writeJson(ARCHIVO_PEDIDOS, lista, { spaces: 2 });
  } catch (e) {
    log('Error guardando pedidos.json: ' + e.message);
  }
}

// -------------------- endpoints --------------------

// La web manda el pedido aca
app.post('/nuevo-pedido', async (req, res) => {
  const p = req.body || {};
  const pedido = {
    id: generarId(),
    estado: 'pendiente',
    impreso: false,
    nombre: p.nombre || '',
    telefono: p.telefono || '',
    modalidad: p.modalidad || 'retiro',
    direccion: p.direccion || '',
    turno: p.turno || '',
    items: Array.isArray(p.items) ? p.items : [],
    total: Number(p.total) || 0,
    pago: p.pago || 'efectivo',
    alias: p.alias || '',
    comprobante: p.comprobante || '',
    aclaraciones: p.aclaraciones || '',
    medallones: Number(p.medallones) || 0,
    timestamp: p.timestamp || new Date().toISOString()
  };

  const pedidos = await leerPedidos();
  pedidos.push(pedido);
  await guardarPedidos(pedidos);
  log('Pedido #' + idCortoLog(pedido.id) + ' - ' + (pedido.nombre || 's/nombre') +
      ' | turno ' + (pedido.turno || '-') + ' | ' + pedido.medallones + ' medallones');

  let impreso = false;
  try { impreso = await printer.imprimirPedido(pedido); } catch (e) { impreso = false; }

  if (impreso) {
    pedido.impreso = true;
    await guardarPedidos(pedidos);
    log('Ticket impreso - #' + idCortoLog(pedido.id));
    return res.json({ ok: true, id: pedido.id });
  }

  // NUNCA bloqueamos el pedido por una falla de impresora
  log('No se imprimio #' + idCortoLog(pedido.id) + ' - se reintentara cada 30s');
  return res.json({ ok: true, id: pedido.id, advertencia: 'No se pudo imprimir' });
});

// Pedidos de HOY (opcional: ?estado=pendiente)
app.get('/pedidos', async (req, res) => {
  let pedidos = (await leerPedidos()).filter(p => esDeHoy(p.timestamp));
  if (req.query.estado) pedidos = pedidos.filter(p => p.estado === req.query.estado);
  pedidos.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)); // mas nuevos primero
  res.json(pedidos);
});

// Cambiar el estado de un pedido
app.patch('/pedidos/:id', async (req, res) => {
  const estado = (req.body || {}).estado;
  const validos = ['pendiente', 'en_preparacion', 'listo', 'entregado'];
  if (!validos.includes(estado)) return res.status(400).json({ ok: false, error: 'estado invalido' });
  const pedidos = await leerPedidos();
  const pedido = pedidos.find(p => p.id === req.params.id);
  if (!pedido) return res.status(404).json({ ok: false, error: 'pedido no encontrado' });
  pedido.estado = estado;
  await guardarPedidos(pedidos);
  log('#' + idCortoLog(pedido.id) + ' -> ' + estado);
  res.json({ ok: true });
});

// Reimprimir un ticket (requiere PIN en el header x-pin)
app.post('/reimprimir/:id', async (req, res) => {
  if (req.headers['x-pin'] !== PIN_ADMIN_WEB) return res.status(401).json({ ok: false, error: 'PIN incorrecto' });
  const pedidos = await leerPedidos();
  const pedido = pedidos.find(p => p.id === req.params.id);
  if (!pedido) return res.status(404).json({ ok: false, error: 'pedido no encontrado' });
  const impreso = await printer.imprimirPedido(pedido);
  if (impreso) { pedido.impreso = true; await guardarPedidos(pedidos); }
  log('Reimpresion #' + idCortoLog(pedido.id) + (impreso ? ' ok' : ' (fallo)'));
  res.json({ ok: true, impreso });
});

// Estado del sistema
app.get('/status', async (req, res) => {
  const pedidos_hoy = (await leerPedidos()).filter(p => esDeHoy(p.timestamp)).length;
  let impresora = 'error';
  try { impresora = (await printer.estaConectada()) ? 'ok' : 'error'; } catch (e) { impresora = 'error'; }
  res.json({ servidor: 'ok', impresora, pedidos_hoy });
});

// -------------------- reintento automatico de impresion --------------------
let reintentando = false;
async function reintentarImpresiones() {
  if (reintentando) return;            // evita solapamientos
  reintentando = true;
  try {
    const pedidos = await leerPedidos();
    const pendientes = pedidos.filter(p => p.impreso === false && esDeHoy(p.timestamp));
    if (pendientes.length) {
      log('Reintentando impresion de ' + pendientes.length + ' pedido(s) sin imprimir...');
      let cambios = false;
      for (const pedido of pendientes) {
        const ok = await printer.imprimirPedido(pedido);
        if (ok) { pedido.impreso = true; cambios = true; log('Reimpreso #' + idCortoLog(pedido.id)); }
      }
      if (cambios) await guardarPedidos(pedidos);
    }
  } catch (e) {
    log('Error en reintento: ' + e.message);
  } finally {
    reintentando = false;
  }
}
setInterval(reintentarImpresiones, 30000); // cada 30 segundos

// -------------------- arranque --------------------
async function iniciar() {
  try {
    if (!(await fs.pathExists(ARCHIVO_PEDIDOS))) await fs.writeJson(ARCHIVO_PEDIDOS, [], { spaces: 2 });
  } catch (e) {
    log('No se pudo crear pedidos.json: ' + e.message);
  }

  app.listen(PUERTO_SERVIDOR, () => {
    log('===================================================');
    log('   BARDO BURGER - Sistema de impresion EN LINEA');
    log('   Panel del local:  http://localhost:' + PUERTO_SERVIDOR);
    log('   Impresora:        ' + NOMBRE_IMPRESORA);
    log('   Deja esta ventana ABIERTA durante el servicio.');
    log('===================================================');
  });
}
iniciar();
