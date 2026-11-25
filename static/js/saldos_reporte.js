// PASO 3 · Guardar como static/js/saldos_reporte.js
// y agregar en index.html, DESPUÉS de saldos.js:
//   <script src="{{ url_for('static', filename='js/saldos_reporte.js') }}"></script>
// Usa las funciones globales de saldos.js: apiSaldos, formatearMoneda, escapar, avisarSaldo.

(() => {
  const $ = id => document.getElementById(id);
  let ultimoReporte = null;

  const NOMBRES_PERIODO = { dia: 'Diario', semana: 'Semanal', mes: 'Mensual' };

  const hoy = () => new Date().toLocaleDateString('en-CA');
  if ($('repFecha')) $('repFecha').value = hoy();

  // Un bloque por cuenta: inicio, lo que subió, lo que bajó y cierre
  function bloqueCuenta(titulo, r, textoMas, textoMenos, textoIni, textoFin) {
    const celda = (et, valor, color) => `
      <div style="flex:1; min-width:140px;">
        <small style="opacity:.7;">${et}</small><br>
        <strong style="font-size:1.15rem; ${color ? 'color:' + color : ''}">${formatearMoneda(valor)}</strong>
      </div>`;
    return `
      <div style="border:1px solid rgba(255,255,255,.08); border-radius:10px; padding:14px; margin-bottom:12px;">
        <strong>${titulo}</strong>
        <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:10px;">
          ${celda(textoIni, r.inicial)}
          ${celda(textoMas, r.aumentos, '#2e7d32')}
          ${celda(textoMenos, r.disminuciones, '#d32f2f')}
          ${celda(textoFin, r.final)}
        </div>
      </div>`;
  }

  function filasMovimientos(lista) {
    return lista.length
      ? lista.map(m => `
          <tr>
            <td>${escapar(m.fecha)}</td>
            <td>${escapar(m.concepto)}</td>
            <td><strong>${escapar(m.cuenta)}</strong></td>
            <td style="color:${m.sube ? '#2e7d32' : '#d32f2f'}; font-weight:bold;">${escapar(m.tipo)}</td>
            <td>${formatearMoneda(m.monto)}</td>
          </tr>`).join('')
      : '<tr><td colspan="5" style="text-align:center;">Sin movimientos en este periodo.</td></tr>';
  }

  function pintarReporte(r) {
    const total = r.movimientos.length;
    $('repSaldosResultado').innerHTML = `
      <p style="margin:0 0 12px;">
        <strong>${NOMBRES_PERIODO[r.periodo]}:</strong> del ${r.desde} al ${r.hasta}
        · ${total} movimiento${total === 1 ? '' : 's'}
      </p>
      ${bloqueCuenta('Saldo Administrador', r.admin,
        'Ingresos', 'Retiros', 'Saldo al inicio', 'Saldo al cierre')}
      ${bloqueCuenta('Saldo Trabajadores (total)', r.trabajadores,
        'Ingresos', 'Retiros', 'Saldo al inicio', 'Saldo al cierre')}
      ${bloqueCuenta('Deuda con Proveedores', r.proveedores,
        'Nueva deuda', 'Pagos', 'Deuda al inicio', 'Deuda al cierre')}
      <div class="tabla-contenedor">
        <table class="tabla">
          <thead><tr><th>Fecha</th><th>Concepto</th><th>Cuenta</th><th>Tipo</th><th>Monto</th></tr></thead>
          <tbody>${filasMovimientos(r.movimientos)}</tbody>
        </table>
      </div>`;
    $('btnImprimirRepSaldos').hidden = false;
  }

  async function generarReporteSaldos() {
    const periodo = $('repPeriodo').value;
    const fecha = $('repFecha').value || hoy();
    try {
      ultimoReporte = await apiSaldos(
        `/api/saldos/reporte?periodo=${encodeURIComponent(periodo)}&fecha=${encodeURIComponent(fecha)}`
      );
      pintarReporte(ultimoReporte);
    } catch (err) {
      await avisarSaldo(err.message);
    }
  }

  function imprimirReporteSaldos() {
    if (!ultimoReporte) return;
    const r = ultimoReporte;
    const v = window.open('', '_blank');
    if (!v) { alert('Permite las ventanas emergentes para imprimir el reporte.'); return; }

    const fila = (n, x, mas, menos, ini, fin) => `
      <tr><td><strong>${n}</strong></td>
          <td>${formatearMoneda(x.inicial)}</td>
          <td>${formatearMoneda(x.aumentos)}</td>
          <td>${formatearMoneda(x.disminuciones)}</td>
          <td><strong>${formatearMoneda(x.final)}</strong></td></tr>`;

    v.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
      <title>Meraki - Reporte de saldos</title>
      <style>
        @page { margin: 1.5cm; }
        body { font: 11pt/1.4 Arial, sans-serif; color:#111; }
        h1 { font-size: 17pt; margin-bottom: 4px; }
        table { width:100%; border-collapse:collapse; margin:14px 0; }
        th, td { border:1px solid #bbb; padding:6px 8px; text-align:left; font-size:10pt; }
        th { background:#f0f0f0; }
      </style></head><body>
      <h1>Meraki · Reporte de saldos (${NOMBRES_PERIODO[r.periodo]})</h1>
      <p>Del ${r.desde} al ${r.hasta}</p>
      <table>
        <thead><tr><th>Cuenta</th><th>Al inicio</th><th>Aumentos</th><th>Disminuciones</th><th>Al cierre</th></tr></thead>
        <tbody>
          ${fila('Administrador', r.admin)}
          ${fila('Trabajadores (total)', r.trabajadores)}
          ${fila('Deuda con proveedores', r.proveedores)}
        </tbody>
      </table>
      <h3>Movimientos del periodo</h3>
      <table>
        <thead><tr><th>Fecha</th><th>Concepto</th><th>Cuenta</th><th>Tipo</th><th>Monto</th></tr></thead>
        <tbody>${filasMovimientos(r.movimientos)}</tbody>
      </table>
      </body></html>`);
    v.document.close();
    v.focus();
    v.print();
  }

  $('btnGenerarRepSaldos')?.addEventListener('click', generarReporteSaldos);
  $('btnImprimirRepSaldos')?.addEventListener('click', imprimirReporteSaldos);
})();