/* ============================================================
   BARDO BURGER - Poller de impresion (nube -> impresora)
   --------------------------------------------------------
   Cada pocos segundos le pregunta a Supabase si hay pedidos
   nuevos (impreso = false), los imprime en la termica USB y
   los marca como impresos. NO necesita abrir puertos ni tunel:
   solo internet de salida (cualquier WiFi sirve).

   Ejecutar:  node poller.js   (o doble clic en INICIAR.bat)
   ============================================================ */

const fs = require('fs');
const path = require('path');
const printer = require('./printer');

// ===================== CONFIG (se lee de config.txt) =====================
let IMPRESORA    = 'USB001';
let SUPABASE_URL = '';
let SUPABASE_KEY = '';          // CLAVE SECRETA (service_role). Solo vive en esta PC.
let INTERVALO    = 10;          // segundos entre cada chequeo

function normalizarImpresora(v) {
  v = String(v || '').trim();
  if (!v) return '\\\\.\\USB001';
  if (/^(printer:|tcp:|\/dev\/|\\\\)/i.test(v)) return v;                 // ya trae prefijo
  if (/^(USB|COM|LPT)\d+$/i.test(v)) return '\\\\.\\' + v.toUpperCase();  // USB001 -> \\.\USB001
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
    if (cfg.IMPRESORA)          IMPRESORA    = cfg.IMPRESORA;
    if (cfg.SUPABASE_URL)       SUPABASE_URL = cfg.SUPABASE_URL.replace(/\/+$/, '');
    if (cfg.SUPABASE_KEY)       SUPABASE_KEY = cfg.SUPABASE_KEY;
    if (cfg.INTERVALO && !isNaN(Number(cfg.INTERVALO))) INTERVALO = Math.max(3, Number(cfg.INTERVALO));
  } catch (e) { /* quedan los valores por defecto */ }
}

// -------------------- log con hora --------------------
function log(msg) {
  const d = new Date();
  const h = String(d.getHours()).padStart(2, '0') + ':' +
            String(d.getMinutes()).padStart(2, '0') + ':' +
            String(d.getSeconds()).padStart(2, '0');
  console.log('[' + h + '] ' + msg);
}
function idCorto(id) { return String(id || '').slice(-4) || '----'; }

// -------------------- llamadas a Supabase --------------------
function headers() {
  return {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json'
  };
}

// Trae los pedidos sin imprimir (de las ultimas 24hs, por las dudas no inunde).
async function traerPendientes() {
  const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const url = SUPABASE_URL + '/rest/v1/pedidos'
    + '?impreso=eq.false'
    + '&creado_en=gte.' + encodeURIComponent(desde)
    + '&order=creado_en.asc'
    + '&select=*';
  const r = await fetch(url, { headers: headers() });
  if (!r.ok) throw new Error('GET ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return await r.json();
}

// Marca un pedido como impreso (para que no se reimprima).
async function marcarImpreso(id) {
  const url = SUPABASE_URL + '/rest/v1/pedidos?id=eq.' + encodeURIComponent(id);
  const r = await fetch(url, {
    method: 'PATCH',
    headers: { ...headers(), 'Prefer': 'return=minimal' },
    body: JSON.stringify({ impreso: true, impreso_en: new Date().toISOString(), estado: 'en_preparacion' })
  });
  if (!r.ok) throw new Error('PATCH ' + r.status + ' ' + (await r.text()).slice(0, 200));
}

// -------------------- ciclo principal --------------------
let trabajando = false;
async function chequear() {
  if (trabajando) return;          // evita que dos ciclos se pisen
  trabajando = true;
  try {
    const pendientes = await traerPendientes();
    if (pendientes.length) {
      log(pendientes.length + ' pedido(s) nuevo(s) para imprimir...');
    }
    for (const pedido of pendientes) {
      // printer.js usa pedido.timestamp; en la base la columna es creado_en
      pedido.timestamp = pedido.creado_en;
      let impreso = false;
      try { impreso = await printer.imprimirPedido(pedido); } catch (e) { impreso = false; }
      if (impreso) {
        try {
          await marcarImpreso(pedido.id);
          log('Ticket impreso  #' + idCorto(pedido.id) + ' - ' + (pedido.nombre || 's/nombre'));
        } catch (e) {
          // Se imprimio pero no se pudo marcar: avisamos. Podria reimprimir en el proximo ciclo.
          log('OJO: imprimi #' + idCorto(pedido.id) + ' pero no pude marcarlo (' + e.message + '). Puede salir doble.');
        }
      } else {
        log('No imprimio #' + idCorto(pedido.id) + ' (impresora?). Reintento en ' + INTERVALO + 's.');
      }
    }
  } catch (e) {
    log('Sin conexion con la nube o error: ' + e.message);
  } finally {
    trabajando = false;
  }
}

// -------------------- arranque --------------------
function arrancar() {
  cargarConfig();
  printer.init(normalizarImpresora(IMPRESORA));

  console.log('============================================');
  console.log('   BARDO BURGER - Impresion de pedidos');
  console.log('   DEJA ESTA VENTANA ABIERTA durante el servicio.');
  console.log('============================================');

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.log('');
    console.log('  >> FALTA configurar la conexion a la nube.');
    console.log('  >> Abri config.txt y completa SUPABASE_URL y SUPABASE_KEY.');
    console.log('     (mira las instrucciones dentro de ese archivo)');
    console.log('');
    return; // no tiene sentido seguir sin credenciales
  }

  log('Conectado. Impresora: ' + normalizarImpresora(IMPRESORA) + '  |  Chequeo cada ' + INTERVALO + 's.');
  log('Esperando pedidos...');
  chequear();                                  // primer chequeo inmediato
  setInterval(chequear, INTERVALO * 1000);     // y despues cada X segundos
}

arrancar();
