(() => {
  const formatoDia = new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });

  const formatoMes = new Intl.DateTimeFormat("es-CO", {
    month: "long",
    year: "numeric"
  });

  function leerFechaFila(texto) {
    // Lee tanto "22/11/2026" como "22/11/2026 16:00".
    const partes = texto.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
    if (!partes) return null;

    const [, dia, mes, anio] = partes;
    return new Date(Number(anio), Number(mes) - 1, Number(dia));
  }

  function calcularPeriodo(fecha, tipo) {
    const inicio = new Date(fecha);
    const fin = new Date(fecha);
    let etiqueta = formatoDia.format(fecha);

    if (tipo === "semana") {
      // La semana empieza el lunes y termina el domingo.
      const diasDesdeLunes = (fecha.getDay() + 6) % 7;
      inicio.setDate(inicio.getDate() - diasDesdeLunes);
      fin.setTime(inicio.getTime());
      fin.setDate(fin.getDate() + 6);
      etiqueta = `Del ${formatoDia.format(inicio)} al ${formatoDia.format(fin)}`;
    } else if (tipo === "mes") {
      inicio.setDate(1);
      fin.setMonth(fin.getMonth() + 1, 0);
      etiqueta = formatoMes.format(fecha);
    } else if (tipo === "anio") {
      inicio.setMonth(0, 1);
      fin.setMonth(11, 31);
      etiqueta = String(fecha.getFullYear());
    }

    return { inicio, fin, etiqueta };
  }

  function conectarHistorial(idTabla) {
    const cuerpo = document.getElementById(idTabla);
    const tarjeta = cuerpo?.closest(".historial-saldos");
    const periodo = tarjeta?.querySelector(".historial-periodo");
    const calendario = tarjeta?.querySelector(".historial-fecha");
    const rango = tarjeta?.querySelector(".historial-rango");

    if (!cuerpo || !periodo || !calendario || !rango) return;

    const hoy = new Date();
    const mesActual = String(hoy.getMonth() + 1).padStart(2, "0");
    const diaActual = String(hoy.getDate()).padStart(2, "0");
    calendario.value = `${hoy.getFullYear()}-${mesActual}-${diaActual}`;

    function filtrar() {
      if (!calendario.value) {
        for (const fila of cuerpo.rows) fila.hidden = false;
        rango.textContent = "Elige una fecha para filtrar.";
        return;
      }

      const [anio, mes, dia] = calendario.value.split("-").map(Number);
      const fecha = new Date(anio, mes - 1, dia);
      const { inicio, fin, etiqueta } = calcularPeriodo(fecha, periodo.value);
      let visibles = 0;

      for (const fila of cuerpo.rows) {
        const celda = fila.cells[0];
        // Una celda combinada contiene el mensaje de tabla vacía.
        if (!celda || celda.colSpan > 1) continue;

        const fechaFila = leerFechaFila(celda.textContent);
        const coincide = fechaFila !== null && fechaFila >= inicio && fechaFila <= fin;
        fila.hidden = !coincide;
        if (coincide) visibles++;
      }

      rango.textContent = visibles > 0
        ? etiqueta
        : `${etiqueta} · Sin registros en este período`;
    }

    periodo.addEventListener("change", filtrar);
    calendario.addEventListener("change", filtrar);

    // Vuelve a aplicar el filtro cuando la aplicación actualiza la tabla.
    new MutationObserver(filtrar).observe(cuerpo, { childList: true });
    filtrar();
  }

  conectarHistorial("tablaContabilidad");
  conectarHistorial("tablaHistorialSaldos");
})();