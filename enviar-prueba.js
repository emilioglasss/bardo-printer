// Imprime un ticket de PRUEBA directo en la impresora (lo usa PROBAR-IMPRESORA.bat).
// No necesita que INICIAR.bat este corriendo: imprime el solo.
const fs = require('fs');
const path = require('path');
const printer = require('./printer');

// lee el puerto de la impresora desde config.txt
let impresora = 'USB001';
try {
  const txt = fs.readFileSync(path.join(__dirname, 'config.txt'), 'utf8');
  const m = txt.match(/^\s*IMPRESORA\s*=\s*(.+)$/mi);
  if (m) impresora = m[1].trim();
} catch (e) {}

function normalizarImpresora(v) {
  v = String(v || '').trim();
  if (!v) return '\\\\.\\USB001';
  if (/^(printer:|tcp:|\/dev\/|\\\\)/i.test(v)) return v;
  if (/^(USB|COM|LPT)\d+$/i.test(v)) return '\\\\.\\' + v.toUpperCase();
  return v;
}

printer.init(normalizarImpresora(impresora));

const pedido = {
  id: 'PRUEBA' + Date.now(),
  nombre: 'PRUEBA DE IMPRESION',
  modalidad: 'retiro',
  turno: '20:00',
  items: [
    { nombre: 'CHEESE (DOBLE)', qty: 1, precio: 16000 },
    { nombre: 'COCA LATA', qty: 2, precio: 2500 }
  ],
  total: 21000,
  pago: 'efectivo',
  medallones: 2,
  aclaraciones: 'Ticket de prueba - si lees esto, anda todo OK',
  timestamp: new Date().toISOString()
};

(async () => {
  const ok = await printer.imprimirPedido(pedido);
  console.log('');
  if (ok) {
    console.log('>> LISTO: el ticket de PRUEBA ya salio por la impresora.');
  } else {
    console.log('>> NO salio el ticket. Revisa:');
    console.log('   - que la impresora este encendida y con papel');
    console.log('   - el puerto en config.txt (corre BUSCAR-IMPRESORA.bat)');
    console.log('   (arriba esta el ticket en texto, para que veas el formato)');
  }
})();
