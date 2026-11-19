// SALDOS CONECTADOS A LA BASE DE DATOS
let resumenSaldos = { admin: 0, proveedores: [], trabajadores: [], total_deuda: 0, total_trabajadores: 0 };

function formatearMoneda(valor) {
    return '$' + Number(valor).toLocaleString('es-CO');
}

function escapar(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function apiSaldos(url, cuerpo) {
    const opciones = { credentials: 'same-origin' };
    if (cuerpo) {
        opciones.method = 'POST';
        opciones.headers = { 'Content-Type': 'application/json' };
        opciones.body = JSON.stringify(cuerpo);
    }
    const resp = await fetch(url, opciones);
    let datos = {};
    try { datos = await resp.json(); } catch (e) {}
    if (!resp.ok) throw new Error(datos.error || 'No se pudo comunicar con el servidor.');
    return datos;
}

function avisarSaldo(texto) {
    return typeof window.avisar === 'function' ? window.avisar(texto) : alert(texto);
}

function llenarSelect(id, lista, textoVacio, etiqueta) {
    const sel = document.getElementById(id);
    if (!sel) return;
    const actual = sel.value;
    sel.innerHTML = `<option value="">${textoVacio}</option>` +
        lista.map(x => `<option value="${x.id}">${escapar(etiqueta(x))}</option>`).join('');
    if (lista.some(x => String(x.id) === actual)) sel.value = actual;
}

async function cargarSaldos() {
    try {
        const [resumen, movimientos] = await Promise.all([
            apiSaldos('/api/saldos'),
            apiSaldos('/api/saldos/movimientos')
        ]);
        resumenSaldos = resumen;
        pintarSaldos(movimientos);
    } catch (err) {
        console.error(err);
    }
}
window.cargarSaldos = cargarSaldos;

function pintarSaldos(movimientos) {
    const r = resumenSaldos;

    const setTxt = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
    setTxt('saldoAdmin', formatearMoneda(r.admin));
    setTxt('saldoTrabajador', formatearMoneda(r.total_trabajadores));   // total de todos los trabajadores
    setTxt('saldoProveedores', formatearMoneda(r.total_deuda));         // deuda total

    // Selectores
    llenarSelect('proveedorCompra', r.proveedores, 'Seleccionar proveedor',
        p => `${p.nombre} (debes ${formatearMoneda(p.deuda)})`);
    llenarSelect('proveedorPago', r.proveedores, 'Seleccionar proveedor',
        p => `${p.nombre} (debes ${formatearMoneda(p.deuda)})`);
    llenarSelect('trabajadorAjuste', r.trabajadores, 'Seleccionar trabajador',
        t => `${t.nombre} ${t.apellido} (${formatearMoneda(t.saldo)})`);

    // Lista de saldos por proveedor
    const tProv = document.getElementById('tablaSaldosProveedores');
    if (tProv) {
        tProv.innerHTML = r.proveedores.length
            ? r.proveedores.map(p => `
                <tr>
                    <td><strong>${escapar(p.nombre)}</strong></td>
                    <td style="color:${p.deuda > 0 ? '#d32f2f' : '#2e7d32'}; font-weight:bold;">
                        ${formatearMoneda(p.deuda)}
                    </td>
                </tr>`).join('')
            : '<tr><td colspan="2" style="text-align:center;">No hay proveedores registrados.</td></tr>';
    }

    // Lista de saldos por trabajador
    const tTrab = document.getElementById('tablaSaldosTrabajadores');
    if (tTrab) {
        tTrab.innerHTML = r.trabajadores.length
            ? r.trabajadores.map(t => `
                <tr>
                    <td><strong>${escapar(t.nombre)} ${escapar(t.apellido)}</strong></td>
                    <td>${escapar(t.rol)}</td>
                    <td style="font-weight:bold;">${formatearMoneda(t.saldo)}</td>
                </tr>`).join('')
            : '<tr><td colspan="3" style="text-align:center;">No hay trabajadores registrados.</td></tr>';
    }

    // Historial
    const tbody = document.getElementById('tablaHistorialSaldos');
    if (tbody) {
        tbody.innerHTML = movimientos.length
            ? movimientos.map(m => `
                <tr>
                    <td>${escapar(m.fecha)}</td>
                    <td>${escapar(m.concepto)}</td>
                    <td><strong>${escapar(m.cuenta)}</strong></td>
                    <td style="color:${m.sube ? '#2e7d32' : '#d32f2f'}; font-weight:bold;">${escapar(m.tipo)}</td>
                    <td>${formatearMoneda(m.monto)}</td>
                </tr>`).join('')
            : '<tr><td colspan="5" style="text-align:center;">No hay movimientos registrados.</td></tr>';
    }
}

// Muestra el selector de trabajador solo cuando la cuenta es "trabajador"
function alternarTrabajador() {
    const cuenta = document.getElementById('cuentaAjuste')?.value;
    const caja = document.getElementById('cajaTrabajadorAjuste');
    if (caja) caja.style.display = cuenta === 'trabajador' ? '' : 'none';
}
document.getElementById('cuentaAjuste')?.addEventListener('change', alternarTrabajador);

async function enviarSaldo(form, url, cuerpo) {
    try {
        await apiSaldos(url, cuerpo);
        form.reset();
        alternarTrabajador();
        await cargarSaldos();
    } catch (err) {
        await avisarSaldo(err.message);
    }
}

// 1. Compra a crédito a un proveedor (aumenta SU deuda)
document.getElementById('formCompraProveedor')?.addEventListener('submit', function (e) {
    e.preventDefault();
    enviarSaldo(this, '/api/saldos/compra-proveedor', {
        proveedor_id: Number(document.getElementById('proveedorCompra').value) || null,
        concepto: document.getElementById('descCompraProveedor').value.trim(),
        monto: Number(document.getElementById('montoCompraProveedor').value)
    });
});

// 2. Pago a un proveedor (baja SU deuda y descuenta al admin)
document.getElementById('formPagoProveedor')?.addEventListener('submit', function (e) {
    e.preventDefault();
    enviarSaldo(this, '/api/saldos/pago-proveedor', {
        proveedor_id: Number(document.getElementById('proveedorPago').value) || null,
        monto: Number(document.getElementById('montoPagoProveedor').value)
    });
});

// 3. Ajuste manual (admin o un trabajador en particular)
document.getElementById('formAjusteSaldo')?.addEventListener('submit', function (e) {
    e.preventDefault();
    enviarSaldo(this, '/api/saldos/ajuste', {
        cuenta: document.getElementById('cuentaAjuste').value,
        usuario_id: Number(document.getElementById('trabajadorAjuste')?.value) || null,
        tipo: document.getElementById('tipoAjuste').value,
        monto: Number(document.getElementById('montoAjuste').value),
        concepto: (document.getElementById('descAjuste')?.value || '').trim()
    });
});

alternarTrabajador();