
// ESTADO DE SALDOS

let saldos = {
    admin: 0,
    trabajador: 0,
    proveedores: 0 // Representa la deuda acumulada
};

let historialSaldos = [];

// Formateador a Pesos / Moneda
function formatearMoneda(valor) {
    return '$' + Number(valor).toLocaleString('es-CO');
}


function actualizarSaldosUI() {
    // Actualizar valores en las tarjetas
    document.getElementById('saldoAdmin').textContent = formatearMoneda(saldos.admin);
    document.getElementById('saldoTrabajador').textContent = formatearMoneda(saldos.trabajador);
    document.getElementById('saldoProveedores').textContent = formatearMoneda(saldos.proveedores);

    // Actualizar tabla de historial
    const tbody = document.getElementById('tablaHistorialSaldos');

    if (historialSaldos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">No hay movimientos registrados.</td></tr>`;
        return;
    }

    tbody.innerHTML = historialSaldos.map(item => `
        <tr>
            <td>${item.fecha}</td>
            <td>${item.concepto}</td>
            <td><strong>${item.cuenta}</strong></td>
            <td style="color: ${item.color}; font-weight: bold;">${item.tipo}</td>
            <td>${formatearMoneda(item.monto)}</td>
        </tr>
    `).join('');
}

// Helper para agregar eventos al historial
function agregarAlHistorial(concepto, cuenta, tipo, monto, color) {
    historialSaldos.unshift({
        fecha: new Date().toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }),
        concepto,
        cuenta,
        tipo,
        monto,
        color
    });
}

// 1. REGISTRAR COMPRA A CRÉDITO AL PROVEEDOR
document.getElementById('formCompraProveedor').addEventListener('submit', function (e) {
    e.preventDefault();

    const concepto = document.getElementById('descCompraProveedor').value.trim();
    const monto = parseFloat(document.getElementById('montoCompraProveedor').value);

    if (!monto || monto <= 0) return;

    // Aumenta la deuda con proveedores
    saldos.proveedores += monto;

    agregarAlHistorial(
        `Préstamo: ${concepto}`,
        'Proveedores',
        'Deuda Aumentó (+)',
        monto,
        '#d32f2f' // Rojo
    );

    this.reset();
    actualizarSaldosUI();
});

// 2. PAGAR A PROVEEDOR (DESCONTANDO DEL ADMIN)
document.getElementById('formPagoProveedor').addEventListener('submit', function (e) {
    e.preventDefault();

    const monto = parseFloat(document.getElementById('montoPagoProveedor').value);

    if (!monto || monto <= 0) return;

    // Validaciones de negocio
    if (monto > saldos.proveedores) {
        alert("El monto ingresado es mayor a la deuda total con proveedores.");
        return;
    }

    if (monto > saldos.admin) {
        alert("El administrador no cuenta con suficiente saldo para realizar este pago.");
        return;
    }

    // Descontar saldo del admin y bajar deuda de proveedores
    saldos.admin -= monto;
    saldos.proveedores -= monto;

    agregarAlHistorial(
        'Pago de deuda a proveedor',
        'Admin / Proveedores',
        'Pago Realizado (-)',
        monto,
        '#2e7d32' // Verde
    );

    this.reset();
    actualizarSaldosUI();
});

// 3. AJUSTE MANUAL (AUMENTAR O REBAJAR ADMIN/TRABAJADOR)
document.getElementById('formAjusteSaldo').addEventListener('submit', function (e) {
    e.preventDefault();

    const cuentaKey = document.getElementById('cuentaAjuste').value; // admin o trabajador
    const tipo = document.getElementById('tipoAjuste').value; // aumentar o rebajar
    const monto = parseFloat(document.getElementById('montoAjuste').value);

    if (!cuentaKey || !monto || monto <= 0) return;

    const nombreCuenta = cuentaKey === 'admin' ? 'Administrador' : 'Trabajador';

    if (tipo === 'aumentar') {
        saldos[cuentaKey] += monto;
        agregarAlHistorial('Aumento manual de saldo', nombreCuenta, 'Ingreso (+)', monto, '#2e7d32');
    } else {
        if (monto > saldos[cuentaKey]) {
            alert(`El saldo actual del ${nombreCuenta} es menor al monto que intentas retirar.`);
            return;
        }
        saldos[cuentaKey] -= monto;
        agregarAlHistorial('Rebaja manual de saldo', nombreCuenta, 'Retiro (-)', monto, '#c62828');
    }

    this.reset();
    actualizarSaldosUI();
});

// Inicialización
actualizarSaldosUI();