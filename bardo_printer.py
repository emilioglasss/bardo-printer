import json
import os
import re
import subprocess
import tempfile
import threading
import time
import urllib.parse
from datetime import datetime, timedelta

import requests

ROOT = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(ROOT, 'config.txt')

DEFAULT_CONFIG = {
    'IMPRESORA': 'POS-80C',
    'SUPABASE_URL': 'https://ammbpyjcdjevwdnzezzo.supabase.co',
    'SUPABASE_KEY': '',
    'INTERVALO': '10',
}

TICKET_WIDTH = 32


class Config:
    def __init__(self):
        self.values = DEFAULT_CONFIG.copy()
        self.load()

    def load(self):
        if not os.path.exists(CONFIG_PATH):
            return

        try:
            with open(CONFIG_PATH, 'r', encoding='utf8') as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith('#'):
                        continue
                    if '=' not in line:
                        continue
                    name, value = line.split('=', 1)
                    self.values[name.strip().upper()] = value.strip()
        except Exception:
            pass

    def save_template(self):
        self.save()

    def save(self):
        lines = [
            '# CONFIGURACION DE BARDO - editar solo el valor despues del =',
            '# Ejemplo: IMPRESORA=printer:MiImpresoraTermica',
            '',
            '# Puerto o nombre de la impresora. En Windows suele ser USB001, USB002, etc.',
            f'IMPRESORA={self.values.get("IMPRESORA", "POS-80C")}',
            '',
            '# Conexión Supabase (no cambies la URL salvo que tu proyecto use otra).',
            f'SUPABASE_URL={self.values.get("SUPABASE_URL", "https://ammbpyjcdjevwdnzezzo.supabase.co")}',
            '',
            '# Clave secreta service_role. Solo vive en esta computadora.',
            f'SUPABASE_KEY={self.values.get("SUPABASE_KEY", "")}',
            '',
            '# Segundos entre cada chequeo de pedidos nuevos.',
            f'INTERVALO={self.values.get("INTERVALO", "10")}',
        ]
        with open(CONFIG_PATH, 'w', encoding='utf8', newline='\n') as f:
            f.write('\n'.join(lines) + '\n')

    def set_value(self, name, value):
        self.values[name.strip().upper()] = str(value).strip()
        self.save()

    @property
    def printer(self):
        return self.normalize_printer(self.values.get('IMPRESORA', '').strip())

    @property
    def supabase_url(self):
        url = self.values.get('SUPABASE_URL', '').strip()
        return url.rstrip('/')

    @property
    def supabase_key(self):
        return self.values.get('SUPABASE_KEY', '').strip()

    @property
    def intervalo(self):
        try:
            value = int(self.values.get('INTERVALO', '10'))
            return max(3, value)
        except Exception:
            return 10

    @staticmethod
    def normalize_printer(value):
        if not value:
            return 'POS-80C'
        value = value.strip()
        if re.match(r'^(printer:|tcp:|/dev/|\\\\)', value, re.I):
            return value
        if re.match(r'^(USB|COM|LPT)\d+$', value, re.I):
            return value.upper()
        return value


class BardoPrinter:
    def __init__(self, config):
        self.config = config
        self.session = requests.Session()
        self.update_session_headers()
        self.stop_event = threading.Event()
        self.thread = None
        self.lock = threading.Lock()
        self.on_log = lambda message: None

    def update_session_headers(self):
        self.session.headers.update({
            'apikey': self.config.supabase_key,
            'Authorization': f'Bearer {self.config.supabase_key}',
            'Content-Type': 'application/json',
        })

    def log(self, message):
        now = datetime.now().strftime('%H:%M:%S')
        text = f'[{now}] {message}'
        self.on_log(text)
        print(text)

    def fetch_pending(self):
        if not self.config.supabase_url or not self.config.supabase_key:
            raise RuntimeError('Falta SUPABASE_URL o SUPABASE_KEY en la configuración')
        since = (datetime.utcnow() - timedelta(hours=24)).isoformat() + 'Z'
        query = (
            f'impreso=eq.false&creado_en=gte.{urllib.parse.quote_plus(since)}'
            '&order=creado_en.asc&select=*'
        )
        url = f'{self.config.supabase_url}/rest/v1/pedidos?{query}'
        response = self.session.get(url, timeout=20)
        response.raise_for_status()
        return response.json()

    def mark_printed(self, pedido_id):
        url = f'{self.config.supabase_url}/rest/v1/pedidos?id=eq.{urllib.parse.quote_plus(str(pedido_id))}'
        payload = {'impreso': True, 'impreso_en': datetime.utcnow().isoformat() + 'Z', 'estado': 'en_preparacion'}
        response = self.session.patch(url, json=payload, timeout=20, headers={'Prefer': 'return=minimal'})
        response.raise_for_status()

    def build_ticket(self, pedido):
        lines = []

        def line_separator(char='='):
            return char * TICKET_WIDTH

        def center(text):
            text = str(text)
            if len(text) >= TICKET_WIDTH:
                return text[:TICKET_WIDTH]
            padding = (TICKET_WIDTH - len(text)) // 2
            return ' ' * padding + text

        def format_price(value):
            try:
                number = round(float(value) or 0)
            except Exception:
                number = 0
            return '$' + f'{number:,}'.replace(',', '.')

        def row(left, right=''):
            left = str(left)
            right = str(right)
            max_left = TICKET_WIDTH - len(right) - 1
            if len(left) > max_left:
                left = left[:max_left]
            fill = TICKET_WIDTH - len(left) - len(right)
            return left + ' ' * max(1, fill) + right

        timestamp = pedido.get('timestamp') or pedido.get('creado_en') or datetime.utcnow().isoformat()
        created = datetime.fromisoformat(timestamp.replace('Z', '+00:00')) if timestamp else datetime.utcnow()
        lines.append(line_separator('='))
        lines.append(center('BARDO BURGER'))
        lines.append(center(f'PEDIDO #{str(pedido.get("id", "----"))[-4:]}'))
        lines.append(line_separator('='))
        lines.append(created.strftime('%H:%M') + ' hs')
        lines.append('')
        lines.append(f'TURNO: {pedido.get("turno", "-") or "-"} hs')
        lines.append(f'MODALIDAD: {str(pedido.get("modalidad", "-")).upper()}')
        direccion = pedido.get('direccion')
        if pedido.get('modalidad') == 'delivery' and direccion:
            lines.append(f'DIRECCION: {direccion}')
        lines.append(f'CLIENTE: {pedido.get("nombre", "-") or "-"}')
        telefono = pedido.get('telefono')
        if telefono:
            lines.append(f'TEL: {telefono}')
        lines.append(line_separator('-'))
        for item in pedido.get('items', []):
            qty = item.get('qty', 1)
            name = item.get('nombre', '')
            price = item.get('precio', 0)
            lines.append(row(f'{qty}x {name}', format_price(price * qty)))
        lines.append(line_separator('-'))
        lines.append(row('TOTAL:', format_price(pedido.get('total', 0))))
        pago = str(pedido.get('pago', 'efectivo')).lower()
        lines.append(f'PAGO: {'TRANSFERENCIA' if pago == 'transferencia' else 'EFECTIVO'}')
        if pago == 'transferencia' and pedido.get('alias'):
            lines.append(f'ALIAS: {pedido.get("alias")}')
        lines.append(line_separator('='))
        lines.append(center('MEDALLONES EN PLANCHA: ' + str(pedido.get('medallones', 0))))
        lines.append(line_separator('='))
        aclaraciones = pedido.get('aclaraciones')
        if aclaraciones and str(aclaraciones).strip():
            lines.append('ACLARACIONES:')
            lines.append(str(aclaraciones).strip())
            lines.append(line_separator('='))
        return '\n'.join(lines)

    def print_text(self, text):
        printer_name = self.config.printer
        if printer_name.lower().startswith('printer:'):
            printer_name = printer_name[8:]
        with tempfile.NamedTemporaryFile('w', encoding='utf8', delete=False, suffix='.txt') as tmp:
            tmp.write(text)
            tmp_path = tmp.name

        try:
            ps_command = (
                'Get-Content -Raw "{path}" | Out-Printer {name}'
                .format(path=tmp_path.replace('"', '\\"'), name=f'-Name "{printer_name}"' if printer_name else '')
            )
            subprocess.run([
                'powershell', '-NoProfile', '-Command', ps_command
            ], check=True, capture_output=True, text=True, timeout=30)
            return True
        except subprocess.CalledProcessError as exc:
            self.log(f'Error de impresora: {exc.stderr.strip() or exc.stdout.strip()}')
            return False
        except Exception as exc:
            self.log(f'Error imprimiendo: {exc}')
            return False
        finally:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass

    def print_order(self, pedido):
        texto = self.build_ticket(pedido)
        return self.print_text(texto)

    def test_print(self):
        pedido = {
            'id': 'PRUEBA' + datetime.utcnow().strftime('%Y%m%d%H%M%S'),
            'nombre': 'PRUEBA DE IMPRESION',
            'modalidad': 'retiro',
            'turno': '20:00',
            'items': [
                {'nombre': 'CHEESE (DOBLE)', 'qty': 1, 'precio': 16000},
                {'nombre': 'COCA LATA', 'qty': 2, 'precio': 2500},
            ],
            'total': 21000,
            'pago': 'efectivo',
            'medallones': 2,
            'aclaraciones': 'Ticket de prueba - si lees esto, anda todo OK',
            'timestamp': datetime.utcnow().isoformat() + 'Z',
        }
        return self.print_order(pedido)

    def printer_choices(self):
        try:
            cmd = 'Get-Printer | Select-Object Name, PortName | ConvertTo-Json -Compress'
            result = subprocess.run(
                ['powershell', '-NoProfile', '-Command', cmd],
                check=True, capture_output=True, text=True, timeout=20)
            data = json.loads(result.stdout)
            if isinstance(data, dict):
                data = [data]
            choices = []
            for item in data:
                name = item.get('Name', '').strip()
                port = item.get('PortName', '').strip()
                if not name:
                    continue
                choices.append({'name': name, 'port': port})
            return choices
        except Exception:
            return []

    def list_printers(self):
        printers = self.printer_choices()
        if not printers:
            return 'No se pudo obtener la lista de impresoras o no hay impresoras instaladas.'
        lines = []
        for printer in printers:
            if printer['port']:
                lines.append(f"{printer['name']} ({printer['port']})")
            else:
                lines.append(printer['name'])
        return '\n'.join(lines)

    def status(self):
        if not self.config.supabase_url:
            return 'SUPABASE_URL no configurada'
        if not self.config.supabase_key:
            return 'SUPABASE_KEY no configurada'
        try:
            pedidos = self.fetch_pending()
            return f'Supabase OK - {len(pedidos)} pedido(s) pendientes'
        except Exception as exc:
            return f'Error de conexion: {exc}'

    def worker(self):
        self.log('Servicio iniciado.')
        while not self.stop_event.is_set():
            try:
                pedidos = self.fetch_pending()
                if pedidos:
                    self.log(f'{len(pedidos)} pedido(s) nuevos para imprimir.')
                for pedido in pedidos:
                    if self.stop_event.is_set():
                        break
                    pedido['timestamp'] = pedido.get('creado_en') or pedido.get('timestamp')
                    ok = self.print_order(pedido)
                    if ok:
                        try:
                            self.mark_printed(pedido.get('id'))
                            self.log(f'Ticket impreso y marcado: #{str(pedido.get("id", ""))[-4:]}')
                        except Exception as exc:
                            self.log(f'Impreso pero no se pudo marcar: {exc}')
                    else:
                        self.log(f'No se pudo imprimir el pedido #{str(pedido.get("id", ""))[-4:]}')
                if self.stop_event.wait(self.config.intervalo):
                    break
            except Exception as exc:
                self.log(f'Error en ciclo de chequeo: {exc}')
                if self.stop_event.wait(self.config.intervalo):
                    break
        self.log('Servicio detenido.')

    def start(self):
        if self.thread and self.thread.is_alive():
            self.log('El servicio ya está en marcha.')
            return
        self.stop_event.clear()
        self.thread = threading.Thread(target=self.worker, daemon=True)
        self.thread.start()

    def stop(self):
        self.stop_event.set()
        if self.thread:
            self.thread.join(timeout=5)


def run_gui():
    try:
        import tkinter as tk
        from tkinter import ttk
        from tkinter import scrolledtext
    except ImportError:
        raise RuntimeError('Tkinter no está disponible en esta instalación de Python.')

    config = Config()
    app = BardoPrinter(config)

    root = tk.Tk()
    root.title('Bardo Printer - Servicio de Impresión')
    root.geometry('720x520')

    frame = ttk.Frame(root, padding=12)
    frame.grid(sticky='nsew')
    root.grid_rowconfigure(0, weight=1)
    root.grid_columnconfigure(0, weight=1)

    upper = ttk.Frame(frame)
    upper.grid(row=0, column=0, sticky='ew')
    upper.columnconfigure(0, weight=1)

    def add_button(text, command):
        btn = ttk.Button(upper, text=text, command=command)
        btn.pack(side='left', padx=4, pady=4)
        return btn

    def apply_ui_to_config():
        config.values['SUPABASE_URL'] = supabase_url_var.get().strip()
        config.values['SUPABASE_KEY'] = supabase_key_var.get().strip()
        config.values['INTERVALO'] = intervalo_var.get().strip() or '10'
        selection = printer_var.get().strip()
        if selection.endswith(')') and ' (' in selection:
            selection = selection[:selection.rfind(' (')]
        config.values['IMPRESORA'] = selection
        try:
            int(config.values['INTERVALO'])
        except Exception:
            config.values['INTERVALO'] = '10'
        app.config = config
        app.update_session_headers()

    def button_start():
        apply_ui_to_config()
        app.start()

    def button_stop():
        app.stop()

    def button_test():
        apply_ui_to_config()
        app.log('Enviando ticket de prueba...')
        ok = app.test_print()
        app.log('Ticket de prueba ' + ('impreso' if ok else 'NO impreso'))

    def button_status():
        apply_ui_to_config()
        app.log(app.status())

    def button_open_config():
        if os.path.exists(CONFIG_PATH):
            os.startfile(CONFIG_PATH)
        else:
            app.log('No existe config.txt. Se generará uno nuevo.')
            config.save_template()
            os.startfile(CONFIG_PATH)

    def button_list_printers():
        result = app.list_printers()
        app.log('Impresoras instaladas:')
        app.log(result)

    add_button('Iniciar servicio', button_start)
    add_button('Detener servicio', button_stop)
    add_button('Probar impresora', button_test)
    add_button('Estado', button_status)
    add_button('Abrir config', button_open_config)
    add_button('Buscar impresora', button_list_printers)

    supabase_url_var = tk.StringVar(value=config.values.get('SUPABASE_URL', ''))
    supabase_key_var = tk.StringVar(value=config.values.get('SUPABASE_KEY', ''))
    intervalo_var = tk.StringVar(value=str(config.values.get('INTERVALO', '10')))
    printer_var = tk.StringVar(value=config.values.get('IMPRESORA', ''))

    settings_frame = ttk.LabelFrame(frame, text='Configuración local')
    settings_frame.grid(row=1, column=0, sticky='ew', pady=(8, 8))
    settings_frame.columnconfigure(1, weight=1)
    settings_frame.columnconfigure(3, weight=1)

    ttk.Label(settings_frame, text='Supabase URL:').grid(row=0, column=0, sticky='w', padx=2, pady=2)
    supabase_url_entry = ttk.Entry(settings_frame, textvariable=supabase_url_var)
    supabase_url_entry.grid(row=0, column=1, columnspan=3, sticky='ew', padx=2, pady=2)

    ttk.Label(settings_frame, text='Clave Supabase:').grid(row=1, column=0, sticky='w', padx=2, pady=2)
    supabase_key_entry = ttk.Entry(settings_frame, textvariable=supabase_key_var, show='*')
    supabase_key_entry.grid(row=1, column=1, columnspan=3, sticky='ew', padx=2, pady=2)

    ttk.Label(settings_frame, text='Intervalo (s):').grid(row=2, column=0, sticky='w', padx=2, pady=2)
    intervalo_entry = ttk.Entry(settings_frame, textvariable=intervalo_var, width=8)
    intervalo_entry.grid(row=2, column=1, sticky='w', padx=2, pady=2)

    ttk.Label(settings_frame, text='Impresora:').grid(row=3, column=0, sticky='w', padx=2, pady=2)
    printer_combo = ttk.Combobox(settings_frame, textvariable=printer_var, state='readonly', width=52)
    printer_combo.grid(row=3, column=1, columnspan=2, sticky='ew', padx=2, pady=2)

    def button_refresh_printers():
        printers = app.printer_choices()
        if not printers:
            app.log('No se encontraron impresoras instaladas o no se pudo obtener la lista.')
            printer_combo['values'] = []
            return
        values = [f"{p['name']} ({p['port']})" if p['port'] else p['name'] for p in printers]
        printer_combo['values'] = values
        current = printer_var.get().strip()
        if current and current in values:
            printer_var.set(current)
        elif values:
            printer_var.set(values[0])
        app.log(f'Lista de impresoras cargada ({len(values)}).')

    refresh_printers_button = ttk.Button(settings_frame, text='Cargar impresoras', command=button_refresh_printers)
    refresh_printers_button.grid(row=3, column=3, sticky='w', padx=2, pady=2)

    def button_save_config():
        config.values['SUPABASE_URL'] = supabase_url_var.get().strip()
        config.values['SUPABASE_KEY'] = supabase_key_var.get().strip()
        config.values['INTERVALO'] = intervalo_var.get().strip() or '10'
        selection = printer_var.get().strip()
        if selection.endswith(')') and ' (' in selection:
            selection = selection[:selection.rfind(' (')]
        config.values['IMPRESORA'] = selection
        try:
            int(config.values['INTERVALO'])
        except Exception:
            config.values['INTERVALO'] = '10'
        config.save()
        app.config = config
        app.update_session_headers()
        app.log('Configuración guardada.')

    save_config_button = ttk.Button(settings_frame, text='Guardar configuración', command=button_save_config)
    save_config_button.grid(row=4, column=0, columnspan=2, sticky='w', padx=2, pady=(8, 0))

    label_info = ttk.Label(frame, text='Configura todo desde aquí. No hace falta editar config.txt manualmente.', wraplength=700)
    label_info.grid(row=2, column=0, sticky='ew', pady=(0, 8))

    log_widget = scrolledtext.ScrolledText(frame, wrap='word', state='disabled', height=16)
    log_widget.grid(row=3, column=0, sticky='nsew')
    frame.rowconfigure(3, weight=1)

    def append_log(text):
        log_widget.configure(state='normal')
        log_widget.insert('end', text + '\n')
        log_widget.see('end')
        log_widget.configure(state='disabled')

    app.on_log = append_log
    button_refresh_printers()

    root.protocol('WM_DELETE_WINDOW', lambda: (app.stop(), root.destroy()))
    root.mainloop()


if __name__ == '__main__':
    run_gui()
