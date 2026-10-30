(function () {
  const PREFIJO_CLAVE = "meraki_meta_mesa_";

  const $ = (id) => document.getElementById(id);
  const aNumero = (texto) => parseInt(String(texto || "").replace(/[^\d]/g, ""), 10) || 0;
  const aDinero = (n) => "$" + Number(n).toLocaleString("es-CO");

  // Obtiene el número de la mesa seleccionada actualmente
  function obtenerMesaActual() {
    // 1. Revisa la variable global expuesta por app.js
    if (window.mesaSeleccionada && !isNaN(Number(window.mesaSeleccionada))) {
      return Number(window.mesaSeleccionada);
    }
    // 2. Si no hay variable global, busca la tarjeta que tenga la clase 'seleccionada'
    const card = document.querySelector(".mesa-card.seleccionada, .mesa-card.activa");
    if (card && card.dataset.mesa) {
      return Number(card.dataset.mesa);
    }
    return 1; // Por defecto Mesa 1
  }

  function leerMetaMesa(mesaNum) {
    try {
      return Number(localStorage.getItem(PREFIJO_CLAVE + mesaNum)) || 0;
    } catch (e) {
      return 0;
    }
  }

  function guardarMetaMesa(mesaNum, valor) {
    try {
      localStorage.setItem(PREFIJO_CLAVE + mesaNum, String(valor));
    } catch (e) {}
  }

  function actualizarMeta() {
    const mesaActual = obtenerMesaActual();
    const meta = leerMetaMesa(mesaActual);

    const vendido = aNumero($("totalVentas") && $("totalVentas").textContent);
    const pct = meta > 0 ? Math.min(100, (vendido / meta) * 100) : 0;

    if ($("metaValor")) $("metaValor").textContent = aDinero(meta);
    if ($("metaVendido")) $("metaVendido").textContent = aDinero(vendido);
    if ($("metaFalta")) $("metaFalta").textContent = aDinero(Math.max(0, meta - vendido));
    if ($("metaPorcentaje")) $("metaPorcentaje").textContent = Math.round(pct) + "%";
    if ($("metaBarra")) $("metaBarra").style.width = pct + "%";

    // Actualiza el título dinámicamente con el número de mesa
    const tituloHeader = document.querySelector(".meta-header h3");
    if (tituloHeader) {
      tituloHeader.textContent = `Meta de ventas - Mesa ${mesaActual}`;
    }

    if ($("metaInput")) {
      $("metaInput").value = meta > 0 ? meta : "";
    }

    const estado = $("metaEstado");
    if (estado) {
      if (meta <= 0) {
        estado.textContent = "Sin meta definida";
        estado.className = "meta-estado";
      } else if (vendido >= meta) {
        estado.textContent = "¡Meta cumplida!";
        estado.className = "meta-estado cumplida";
      } else {
        estado.textContent = "En progreso";
        estado.className = "meta-estado progreso";
      }
    }
  }

  function iniciar() {
    const form = $("formMeta");
    if (!form) return;

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const mesaActual = obtenerMesaActual();
      const valor = Number($("metaInput").value);
      if (!(valor > 0)) return;
      guardarMetaMesa(mesaActual, valor);
      actualizarMeta();
    });

    const btnQuitar = $("btnQuitarMeta");
    if (btnQuitar) {
      btnQuitar.addEventListener("click", () => {
        const mesaActual = obtenerMesaActual();
        guardarMetaMesa(mesaActual, 0);
        if ($("metaInput")) $("metaInput").value = "";
        actualizarMeta();
      });
    }

    // Escucha clics en cada tarjeta de mesa para actualizar la meta al instante
    document.querySelectorAll(".mesa-card").forEach((card) => {
      card.addEventListener("click", () => {
        setTimeout(actualizarMeta, 50);
      });
    });

    const total = $("totalVentas");
    if (total) {
      new MutationObserver(actualizarMeta).observe(total, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    }

    actualizarMeta();
  }

  document.addEventListener("DOMContentLoaded", iniciar);
  window.actualizarMeta = actualizarMeta;
})();