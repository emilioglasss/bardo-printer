/* ============================================================
   BARDO BURGER - Modulo de impresion termica (ESC/POS)
   Usa node-thermal-printer. Si la impresora no esta disponible,
   NUNCA rompe el flujo: muestra el ticket en consola y devuelve
   false para que el pedido se registre igual y se reintente.
   ============================================================ */

// Ancho del ticket en caracteres.  Papel 58mm = 32  ·  papel 80mm = 48.
const ANCHO = 32;

// Carga "perezosa" y tolerante: si la libreria no esta instalada o
// falla, el sistema sigue funcionando (imprime en consola).
let ThermalPrinter, PrinterTypes, CharacterSet;
try {
  ({ ThermalPrinter, PrinterTypes, CharacterSet } = require('node-thermal-printer'));
} catch (e) {
  console.log('[impresora] node-thermal-printer no se pudo cargar; se imprimira en consola. (' + e.message + ')');
}

let NOMBRE_IMPRESORA = '\\\\.\\USB001'; // se sobreescribe desde server.js con init()

function init(nombreImpresora) {
  if (nombreImpresora) NOMBRE_IMPRESORA = nombreImpresora;
}

// -------------------- helpers de formato --------------------
function formatPrecio(n) {
  return '$' + Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
function idCorto(id) {
  return String(id || '').slice(-4) || '----';
}
function horaLocal(iso) {
  const d = iso ? new Date(iso) : new Date();
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
// arma una fila "nombre .... precio" alineada al ancho del ticket
function filaItem(izq, der) {
  izq = String(izq); der = String(der);
  const maxIzq = ANCHO - der.length - 1;
  if (izq.length > maxIzq) izq = izq.slice(0, Math.max(0, maxIzq));
  const relleno = ANCHO - izq.length - der.length;
  return izq + ' '.repeat(Math.max(1, relleno)) + der;
}
function centrar(s) {
  s = String(s);
  if (s.length >= ANCHO) return s.slice(0, ANCHO);
  return ' '.repeat(Math.floor((ANCHO - s.length) / 2)) + s;
}

// -------------------- ticket en texto (consola / fallback) --------------------
function ticketTexto(pedido) {
  const linea = '='.repeat(ANCHO);
  const fina = '-'.repeat(ANCHO);
  const L = [];
  L.push(linea);
  L.push(centrar('BARDO BURGER'));
  L.push(centrar('PEDIDO #' + idCorto(pedido.id)));
  L.push(linea);
  L.push(horaLocal(pedido.timestamp) + ' hs');
  L.push('');
  L.push('TURNO: ' + (pedido.turno || '-') + ' hs');
  L.push('MODALIDAD: ' + String(pedido.modalidad || '-').toUpperCase());
  if (pedido.modalidad === 'delivery' && pedido.direccion) L.push('DIRECCION: ' + pedido.direccion);
  L.push('CLIENTE: ' + (pedido.nombre || '-'));
  if (pedido.telefono) L.push('TEL: ' + pedido.telefono);
  L.push(fina);
  (pedido.items || []).forEach(it => {
    const qty = it.qty || 1;
    L.push(filaItem(qty + 'x ' + it.nombre, it.precio ? formatPrecio(it.precio * qty) : ''));
  });
  L.push(fina);
  L.push(filaItem('TOTAL:', formatPrecio(pedido.total)));
  L.push('PAGO: ' + (pedido.pago === 'transferencia' ? 'TRANSFERENCIA' : 'EFECTIVO'));
  if (pedido.pago === 'transferencia' && pedido.alias) L.push('ALIAS: ' + pedido.alias);
  L.push(linea);
  L.push(centrar('MEDALLONES EN PLANCHA: ' + (pedido.medallones || 0)));
  L.push(linea);
  if (pedido.aclaraciones && String(pedido.aclaraciones).trim()) {
    L.push('ACLARACIONES:');
    L.push(String(pedido.aclaraciones).trim());
    L.push(linea);
  }
  return L.join('\n');
}

// -------------------- impresion real (ESC/POS) --------------------
function crearImpresora() {
  if (!ThermalPrinter) throw new Error('libreria de impresion no disponible');
  return new ThermalPrinter({
    type: PrinterTypes.EPSON,            // EPSON cubre la mayoria de las termicas ESC/POS
    interface: NOMBRE_IMPRESORA,
    characterSet: CharacterSet ? CharacterSet.WPC1252 : undefined, // acentos y enie
    removeSpecialCharacters: false,
    lineCharacter: '-',
    width: ANCHO,
    options: { timeout: 5000 }
  });
}

function construirTicket(printer, pedido) {
  const linea = '='.repeat(ANCHO);
  const fina = '-'.repeat(ANCHO);

  // encabezado centrado
  printer.alignCenter();
  printer.setTextNormal(); printer.bold(false);
  printer.println(linea);
  printer.bold(true);
  printer.setTextDoubleHeight(); printer.setTextDoubleWidth();
  printer.println('BARDO BURGER');                 // nombre grande y en negrita
  printer.setTextNormal();
  printer.println('PEDIDO #' + idCorto(pedido.id)); // numero de pedido centrado
  printer.bold(false);
  printer.println(linea);

  // datos del pedido (alineados a la izquierda)
  printer.alignLeft();
  printer.println(horaLocal(pedido.timestamp) + ' hs');
  printer.newLine();
  printer.println('TURNO: ' + (pedido.turno || '-') + ' hs');
  printer.println('MODALIDAD: ' + String(pedido.modalidad || '-').toUpperCase());
  if (pedido.modalidad === 'delivery' && pedido.direccion) printer.println('DIRECCION: ' + pedido.direccion);
  printer.println('CLIENTE: ' + (pedido.nombre || '-'));
  if (pedido.telefono) printer.println('TEL: ' + pedido.telefono);
  printer.println(fina);

  // items: nombre a la izquierda, precio a la derecha
  (pedido.items || []).forEach(it => {
    const qty = it.qty || 1;
    printer.println(filaItem(qty + 'x ' + it.nombre, it.precio ? formatPrecio(it.precio * qty) : ''));
  });
  printer.println(fina);

  // total en negrita
  printer.bold(true);
  printer.println(filaItem('TOTAL:', formatPrecio(pedido.total)));
  printer.bold(false);
  printer.println('PAGO: ' + (pedido.pago === 'transferencia' ? 'TRANSFERENCIA' : 'EFECTIVO'));
  if (pedido.pago === 'transferencia' && pedido.alias) printer.println('ALIAS: ' + pedido.alias);
  printer.println(linea);

  // MEDALLONES resaltado: info critica para el cocinero
  printer.alignCenter();
  printer.bold(true);
  printer.setTextDoubleHeight();
  printer.println('MEDALLONES EN PLANCHA: ' + (pedido.medallones || 0));
  printer.setTextNormal();
  printer.bold(false);
  printer.println(linea);

  // aclaraciones: solo si existen, en seccion aparte
  if (pedido.aclaraciones && String(pedido.aclaraciones).trim()) {
    printer.alignLeft();
    printer.bold(true);
    printer.println('ACLARACIONES:');
    printer.bold(false);
    printer.println(String(pedido.aclaraciones).trim());
    printer.alignCenter();
    printer.println(linea);
  }

  printer.newLine();
  printer.cut(); // corte de papel automatico
}

// -------------------- fallback: imprimir via Windows (Out-Printer) --------------------
// Cuando node-thermal-printer no puede conectarse (comun en Windows con impresoras USB),
// usamos PowerShell para mandar el ticket de texto directamente a la impresora instalada.
// Funciona con cualquier impresora que Windows tenga instalada, sin ESC/POS.
const { execSync } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

function imprimirPorWindows(texto, nombreImpresora) {
  // extraer el nombre limpio: "printer:POS-80C" -> "POS-80C", "\\.\USB001" -> usa variable tal cual
  let nombre = nombreImpresora;
  if (/^printer:/i.test(nombre)) nombre = nombre.slice(8);

  // escribir el ticket a un archivo temporal
  const tmp = path.join(os.tmpdir(), 'bardo_ticket_' + Date.now() + '.txt');
  fs.writeFileSync(tmp, texto, { encoding: 'utf8' });

  try {
    // Out-Printer: manda el archivo de texto directo a la impresora de Windows
    const ps = `Get-Content -Raw "${tmp.replace(/\\/g, '\\\\')}" | Out-Printer -Name "${nombre}"`;
    execSync(`powershell -NoProfile -Command "${ps}"`, { timeout: 10000 });
    return true;
  } finally {
    try { fs.unlinkSync(tmp); } catch (e) { /* no importa */ }
  }
}

// -------------------- API publica --------------------
// Devuelve true si imprimio, false si fallo (sin lanzar excepcion).
async function imprimirPedido(pedido) {
  const texto = ticketTexto(pedido);

  // Intento 1: node-thermal-printer (ticket con formato ESC/POS, negrita, doble altura)
  try {
    const printer = crearImpresora();
    construirTicket(printer, pedido);
    await printer.execute();
    console.log('[impresora] ESC/POS ok');
    return true;
  } catch (err) {
    const detalle = (err && err.message) ? err.message : 'error desconocido';
    console.log('[impresora] ESC/POS fallo (' + detalle + '), probando fallback Windows...');
  }

  // Intento 2: Out-Printer de Windows (texto plano, funciona con cualquier impresora instalada)
  try {
    // nombre para Out-Printer: sacar prefijos tecnicos, dejar solo el nombre de Windows
    let nombre = NOMBRE_IMPRESORA;
    if (nombre.startsWith('\\\\.\\')) nombre = nombre.slice(4); // \\.\USB001 -> USB001
    if (/^printer:/i.test(nombre)) nombre = nombre.slice(8);    // printer:POS-80C -> POS-80C
    // si sigue siendo USB001/COM5 etc, buscar el nombre real de la impresora
    // (el usuario ya sabe que su impresora es POS-80C; si pone USB001 en config usamos igual)

    imprimirPorWindows(texto, nombre);
    console.log('[impresora] Fallback Windows ok (impresora: ' + nombre + ')');
    return true;
  } catch (err2) {
    console.log('[impresora] Fallback Windows tambien fallo (' + (err2 && err2.message) + ')');
    console.log('[impresora] Ticket en consola para registro:');
    console.log('\n' + texto + '\n');
    return false;
  }
}

async function estaConectada() {
  try {
    const printer = crearImpresora();
    return await printer.isPrinterConnected();
  } catch (e) {
    return false;
  }
}

module.exports = { init, imprimirPedido, estaConectada, ticketTexto };
