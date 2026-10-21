/* Meta de ventas - Meraki
   Se conecta solo con #totalVentas: cada vez que ese valor cambia
   (al registrar una venta), la barra de progreso se actualiza. */
(function () {
  const CLAVE = "meraki_meta_ventas";

  const $ = (id) => document.getElementById(id);
  const aNumero = (texto) => parseInt(String(texto || "").replace(/[^\d]/g, ""), 10) || 0;
  const aDinero = (n) => "$" + Number(n).toLocaleString("es-CO");

  function leerMeta() {
    try { return Number(localStorage.getItem(CLAVE)) || 0; } catch (e) { return 0; }
  }
  function guardarMeta(valor) {
    try { localStorage.setItem(CLAVE, String(valor)); } catch (e) {}
  }

  function actualizarMeta() {
    const meta = leerMeta();
    const vendido = aNumero($("totalVentas") && $("totalVentas").textContent);
    const pct = meta > 0 ? Math.min(100, (vendido / meta) * 100) : 0;

    $("metaValor").textContent = aDinero(meta);
    $("metaVendido").textContent = aDinero(vendido);
    $("metaFalta").textContent = aDinero(Math.max(0, meta - vendido));
    $("metaPorcentaje").textContent = Math.round(pct) + "%";
    $("metaBarra").style.width = pct + "%";

    const estado = $("metaEstado");
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

  function iniciar() {
    const form = $("formMeta");
    if (!form) return;

    $("metaInput").value = leerMeta() || "";

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const valor = Number($("metaInput").value);
      if (!(valor > 0)) return;
      guardarMeta(valor);
      actualizarMeta();
    });

    $("btnQuitarMeta").addEventListener("click", () => {
      guardarMeta(0);
      $("metaInput").value = "";
      actualizarMeta();
    });

    // Se actualiza automáticamente cuando cambia el total de ventas
    const total = $("totalVentas");
    if (total) {
      new MutationObserver(actualizarMeta).observe(total, {
        childList: true, characterData: true, subtree: true,
      });
    }
    actualizarMeta();
  }

  document.addEventListener("DOMContentLoaded", iniciar);
  window.actualizarMeta = actualizarMeta; // por si quieres llamarla manualmente
})();