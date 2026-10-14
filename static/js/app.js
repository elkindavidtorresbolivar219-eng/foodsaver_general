(() => {
  "use strict";
 
  /* Comunicación con el servidor (Flask + PostgreSQL) */
  async function api(url, opciones) {
    const resp = await fetch(url, Object.assign({ credentials: "same-origin" }, opciones));
    let cuerpo = {};
    try { cuerpo = await resp.json(); } catch (e) { /* sin cuerpo JSON */ }
    if (!resp.ok) {
      if (resp.status === 401 && url !== "/api/login") mostrarLogin();
      throw new Error(cuerpo.error || "No se pudo comunicar con el servidor.");
    }
    return cuerpo;
  }
 
  const GET = url => api(url);
  const POST = (url, cuerpo) => api(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo || {})
  });
 
  let sesion = null;
  let datos = { usuarios: [], alimentos: [], perdidas: [], contabilidad: [], sedes: [] };
 
  const hoyISO = () => new Date().toLocaleDateString("en-CA");
 
  function esc(texto) {
    const mapa = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return String(texto == null ? "" : texto).replace(/[&<>"']/g, c => mapa[c]);
  }
 
  // Asignaciones seguras: si el elemento no existe en el HTML, no lanzan error
  function setHTML(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }
  function setText(id, texto) {
    const el = document.getElementById(id);
    if (el) el.textContent = texto;
  }
 
  function mensaje(id, texto, tipo) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = texto;
    el.className = "mensaje visible " + (tipo || "ok");
    setTimeout(() => el.classList.remove("visible"), 4000);
  }
 
  function formatoMoneda(valor) {
    return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(valor || 0);
  }
 
  function iniciales(nombre) {
    return nombre.split(" ").map(x => x[0]).join("").slice(0, 2).toUpperCase();
  }
 
  function fechaBonita(fecha) {
    if (!fecha) return "-";
    const [y, m, d] = fecha.split("-");
    return d + "/" + m + "/" + y;
  }
 
  /* Carga de datos (GET) */
  async function cargarDatos() {
    if (!sesion) return;
    const peticiones = [
      GET("/api/alimentos"),
      GET("/api/perdidas"),
      GET("/api/contabilidad"),
      GET("/api/sedes")
    ];
    if (sesion.rol === "Administrador") peticiones.push(GET("/api/usuarios"));
    const r = await Promise.all(peticiones);
    datos = {
      alimentos: r[0],
      perdidas: r[1],
      contabilidad: r[2],
      sedes: r[3],
      usuarios: r[4] || []
    };
    renderizarTodo();
  }
 
  function recargar() {
    return cargarDatos().catch(err => console.error(err));
  }
 
  /* Vistas y sesión */
  function mostrarVista(nombre) {
    if (!sesion) return;
    document.querySelectorAll(".vista").forEach(v => v.classList.remove("activa"));
    const vista = document.getElementById("vista-" + nombre);
    if (vista) vista.classList.add("activa");
 
    document.querySelectorAll(".elemento-menu").forEach(a => {
      a.classList.toggle("activo", a.dataset.vista === nombre);
    });
 
    const titulos = {
      dashboard: ["Inicio / Dashboard", "Panel principal"],
      usuarios: ["Inicio / Usuarios", "Gestión de usuarios"],
      alimentos: ["Inicio / Alimentos", "Administración de alimentos"],
      inventario: ["Inicio / Inventario", "Inventario en tiempo real"],
      sincronizacion: ["Inicio / Sincronización", "Sincronización de inventario"],
      contabilidad: ["Inicio / Contabilidad", "Movimientos contables"],
      reportes: ["Inicio / Reportes", "Generación de reportes"],
      configuracion: ["Inicio / Configuración", "Configuración"],
      ayuda: ["Inicio / Ayuda", "Ayuda"]
    };
    const t = titulos[nombre] || ["Inicio", "Meraki"];
    setText("migas", t[0]);
    setText("tituloSuperior", t[1]);
 
    recargar();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  window.mostrarVista = mostrarVista;
 
  async function iniciarSesion(usuario) {
    sesion = { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol, login: usuario.login };
    document.getElementById("pantallaLogin").classList.add("oculto");
    document.getElementById("aplicacion").classList.remove("oculto");
    setText("nombreSidebar", sesion.nombre);
    setText("rolSidebar", sesion.rol);
    setText("nombreTop", sesion.nombre);
    setText("avatarSidebar", iniciales(sesion.nombre));
    setText("avatarTop", iniciales(sesion.nombre));
    aplicarPermisos();
    await recargar();
  }
 
  function aplicarPermisos() {
    const enlaceUsuarios = document.querySelector('[data-vista="usuarios"]');
    if (enlaceUsuarios) enlaceUsuarios.style.display = sesion && sesion.rol === "Administrador" ? "flex" : "none";
  }
 
  function mostrarLogin() {
    sesion = null;
    datos = { usuarios: [], alimentos: [], perdidas: [], contabilidad: [], sedes: [] };
    document.getElementById("aplicacion").classList.add("oculto");
    document.getElementById("pantallaLogin").classList.remove("oculto");
    document.getElementById("formLogin").reset();
    document.getElementById("formRestablecer").classList.add("oculto");
  }
 
  async function cerrarSesion() {
    try { await POST("/api/logout"); } catch (e) { /* se cierra igual */ }
    mostrarLogin();
  }
  window.cerrarSesion = cerrarSesion;
 
  document.querySelectorAll(".elemento-menu").forEach(enlace => {
    enlace.addEventListener("click", e => {
      e.preventDefault();
      mostrarVista(enlace.dataset.vista);
    });
  });
 
  document.getElementById("formLogin").addEventListener("submit", async e => {
    e.preventDefault();
    try {
      const usuario = await POST("/api/login", {
        usuario: document.getElementById("loginUsuario").value.trim(),
        clave: document.getElementById("loginClave").value
      });
      await iniciarSesion(usuario);
    } catch (err) {
      mensaje("mensajeLogin", err.message, "error");
    }
  });
 
  document.getElementById("btnRestablecer").addEventListener("click", () => {
    document.getElementById("formRestablecer").classList.toggle("oculto");
  });
 
  document.getElementById("formRestablecer").addEventListener("submit", async e => {
    e.preventDefault();
    const formulario = e.target;
    try {
      await POST("/api/restablecer", {
        usuario: document.getElementById("recUsuario").value.trim(),
        clave: document.getElementById("recNuevaClave").value
      });
      mensaje("mensajeReset", "Contraseña restablecida correctamente.", "ok");
      formulario.reset();
    } catch (err) {
      mensaje("mensajeReset", err.message, "error");
    }
  });
 
  document.getElementById("btnPerfil").addEventListener("click", () => mostrarVista("configuracion"));
 
  /* Usuarios (RF 2) */
  document.getElementById("formUsuario").addEventListener("submit", async e => {
    e.preventDefault();
    try {
      const id = Number(document.getElementById("usuarioId").value) || null;
      const nombre = document.getElementById("usuarioNombre").value.trim();
      const apellido = document.getElementById("usuarioApellido").value.trim();
      const usuario = document.getElementById("usuarioLogin").value.trim();
      const clave = document.getElementById("usuarioClave").value;
      const rol = document.getElementById("usuarioRol").value;
 
      if (!nombre || !apellido || !usuario || !rol) {
        mensaje("mensajeUsuario", "Completa todos los campos obligatorios.", "error");
        return;
      }
      if (!id && clave.length < 4) {
        mensaje("mensajeUsuario", "La contraseña debe tener mínimo 4 caracteres.", "error");
        return;
      }
 
      const r = await POST("/api/usuarios", {
        id: id,
        nombre: nombre,
        apellido: apellido,
        usuario: usuario,
        login: usuario,
        clave: clave,
        rol: rol
      });
 
      mensaje("mensajeUsuario", r.mensaje || "Usuario guardado correctamente.", "ok");
      limpiarUsuario();
      await recargar();
    } catch (err) {
      mensaje("mensajeUsuario", err.message, "error");
    }
  });
 
  function limpiarUsuario() {
    document.getElementById("formUsuario").reset();
    document.getElementById("usuarioId").value = "";
    document.getElementById("usuarioClave").required = true;
  }
  window.limpiarUsuario = limpiarUsuario;
 
  function editarUsuario(id) {
    const u = datos.usuarios.find(usuario => Number(usuario.id) === Number(id));
    if (!u) {
      mensaje("mensajeUsuario", "No se encontró el usuario.", "error");
      return;
    }
    document.getElementById("usuarioId").value = u.id || "";
    document.getElementById("usuarioNombre").value = u.nombre || "";
    document.getElementById("usuarioApellido").value = u.apellido || "";
    document.getElementById("usuarioLogin").value = u.login || u.usuario || "";
    document.getElementById("usuarioClave").value = "";
    document.getElementById("usuarioClave").required = false;
    document.getElementById("usuarioRol").value = u.rol || "";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  window.editarUsuario = editarUsuario;
 
  async function eliminarUsuario(id) {
    if (!confirm("¿Deseas eliminar este usuario?")) return;
    try {
      await POST("/api/usuarios/" + id + "/eliminar");
      mensaje("mensajeUsuario", "Usuario eliminado correctamente.", "ok");
      await recargar();
    } catch (err) {
      mensaje("mensajeUsuario", err.message, "error");
    }
  }
  window.eliminarUsuario = eliminarUsuario;
 
  /* Alimentos y pérdidas (RF 3) */
  document.getElementById("formAlimento").addEventListener("submit", async e => {
    e.preventDefault();
    try {
      const r = await POST("/api/alimentos", {
        id: Number(document.getElementById("alimentoId").value) || null,
        nombre: document.getElementById("alimentoNombre").value.trim(),
        categoria: document.getElementById("alimentoCategoria").value,
        cantidad: Number(document.getElementById("alimentoCantidad").value),
        vencimiento: document.getElementById("alimentoVencimiento").value,
        sede: document.getElementById("alimentoSede").value
      });
      mensaje("mensajeAlimento", r.mensaje, "ok");
      limpiarAlimento();
      await recargar();
    } catch (err) {
      mensaje("mensajeAlimento", err.message, "error");
    }
  });
 
  function limpiarAlimento() {
    document.getElementById("formAlimento").reset();
    document.getElementById("alimentoId").value = "";
  }
  window.limpiarAlimento = limpiarAlimento;
 
  function editarAlimento(id) {
    const a = datos.alimentos.find(x => x.id === id);
    if (!a) return;
    document.getElementById("alimentoId").value = a.id;
    document.getElementById("alimentoNombre").value = a.nombre;
    document.getElementById("alimentoCategoria").value = a.categoria;
    document.getElementById("alimentoCantidad").value = a.cantidad;
    document.getElementById("alimentoVencimiento").value = a.vencimiento;
    document.getElementById("alimentoSede").value = a.sede;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  window.editarAlimento = editarAlimento;
 
  async function eliminarAlimento(id) {
    if (!confirm("¿Desea eliminar este alimento?")) return;
    try {
      await POST("/api/alimentos/" + id + "/eliminar");
      await recargar();
    } catch (err) {
      mensaje("mensajeAlimento", err.message, "error");
    }
  }
  window.eliminarAlimento = eliminarAlimento;
 
  document.getElementById("formPerdida").addEventListener("submit", async e => {
    e.preventDefault();
    const formulario = e.target;
    try {
      const r = await POST("/api/perdidas", {
        alimento_id: Number(document.getElementById("perdidaAlimento").value),
        cantidad: Number(document.getElementById("perdidaCantidad").value),
        motivo: document.getElementById("perdidaMotivo").value,
        observacion: document.getElementById("perdidaObservacion").value
      });
      formulario.reset();
      mensaje("mensajePerdida", r.mensaje, "ok");
      await recargar();
    } catch (err) {
      mensaje("mensajePerdida", err.message, "error");
    }
  });
 
  /* Contabilidad (RF 5) */
  document.getElementById("formContable").addEventListener("submit", async e => {
    e.preventDefault();
    const formulario = e.target;
    try {
      const r = await POST("/api/contabilidad", {
        tipo: document.getElementById("contableTipo").value,
        descripcion: document.getElementById("contableDescripcion").value.trim(),
        valor: Number(document.getElementById("contableValor").value)
      });
      formulario.reset();
      mensaje("mensajeContable", r.mensaje, "ok");
      await recargar();
    } catch (err) {
      mensaje("mensajeContable", err.message, "error");
    }
  });
 
  /* Sincronización (RF 4) */
  async function sincronizar() {
    setText("estadoSync", "Sincronizando información...");
    const punto = document.getElementById("puntoSync");
    if (punto) punto.style.background = "var(--warning)";
    try {
      const r = await POST("/api/sincronizar");
      await cargarDatos();
      setText("estadoSync", "Información sincronizada");
      if (punto) punto.style.background = "var(--success)";
      mensaje("mensajeSync", r.mensaje, "ok");
    } catch (err) {
      setText("estadoSync", "Error de sincronización");
      mensaje("mensajeSync", err.message, "error");
    }
  }
  window.sincronizar = sincronizar;
 
  /* Pintado de pantalla */
  function diasParaVencer(a) {
    return Math.ceil((new Date(a.vencimiento + "T23:59:59") - new Date()) / 86400000);
  }
 
  function estadoAlimento(a) {
    if (a.cantidad <= 15) return ["Crítico", "bad"];
    if (diasParaVencer(a) <= 3) return ["Por vencer", "bad"];
    if (a.cantidad <= 30) return ["Stock bajo", "warn"];
    return ["Disponible", "ok"];
  }
 
  function renderizarTodo() {
    if (!sesion) return;
    const totalUnidades = datos.alimentos.reduce((s, a) => s + a.cantidad, 0);
    const criticos = datos.alimentos.filter(a => estadoAlimento(a)[1] === "bad").length;
    const porVencer = datos.alimentos.filter(a => diasParaVencer(a) <= 3).length;
    const ventas = datos.contabilidad.filter(x => x.tipo === "Venta").reduce((s, x) => s + Number(x.valor), 0);
    const gastos = datos.contabilidad.filter(x => x.tipo === "Gasto operativo").reduce((s, x) => s + Number(x.valor), 0);
 
    setText("statProductos", datos.alimentos.length);
    setText("statInventario", totalUnidades);
    setText("statVencer", porVencer);
    setText("statVentas", formatoMoneda(ventas));
    setText("invTotal", datos.alimentos.length);
    setText("invUnidades", totalUnidades);
    setText("invCriticos", criticos);
    setText("totalVentas", formatoMoneda(ventas));
    setText("totalGastos", formatoMoneda(gastos));
    setText("balance", formatoMoneda(ventas - gastos));
 
    // Usuarios: ahora incluye la columna Apellido
    setHTML("tablaUsuarios", datos.usuarios.map(u =>
      "<tr><td><strong>" + esc(u.nombre) + "</strong></td><td>" + esc(u.apellido) + "</td><td>" + esc(u.login) +
      "</td><td>" + esc(u.rol) +
      '</td><td><div class="acciones-tabla"><button onclick="editarUsuario(' + u.id + ')">Editar</button>' +
      '<button class="eliminar" onclick="eliminarUsuario(' + u.id + ')">Eliminar</button></div></td></tr>'
    ).join(""));
 
    setHTML("tablaAlimentos", datos.alimentos.map(a =>
      "<tr><td><strong>" + esc(a.nombre) + "</strong></td><td>" + esc(a.categoria) + "</td><td>" + a.cantidad +
      "</td><td>" + fechaBonita(a.vencimiento) + "</td><td>" + esc(a.sede) +
      '</td><td><div class="acciones-tabla"><button onclick="editarAlimento(' + a.id + ')">Editar</button>' +
      '<button class="eliminar" onclick="eliminarAlimento(' + a.id + ')">Eliminar</button></div></td></tr>'
    ).join(""));
 
    setHTML("tablaInventario", datos.alimentos.map(a => {
      const est = estadoAlimento(a);
      return "<tr><td><strong>" + esc(a.nombre) + "</strong></td><td>" + esc(a.categoria) + "</td><td>" + a.cantidad +
        " unidades</td><td>" + fechaBonita(a.vencimiento) + "</td><td>" + esc(a.sede) +
        '</td><td><span class="estado-demo ' + est[1] + '">' + est[0] + "</span></td></tr>";
    }).join(""));
 
    const comboPerdida = document.getElementById("perdidaAlimento");
    if (comboPerdida) {
      const seleccionado = comboPerdida.value;
      comboPerdida.innerHTML = datos.alimentos.map(a =>
        '<option value="' + a.id + '">' + esc(a.nombre) + " (" + a.cantidad + " disponibles)</option>"
      ).join("");
      if (seleccionado) comboPerdida.value = seleccionado;
    }
 
    setHTML("tablaContabilidad", datos.contabilidad.slice().reverse().map(x =>
      "<tr><td>" + fechaBonita(x.fecha) + '</td><td><span class="estado-demo ' + (x.tipo === "Venta" ? "ok" : "warn") + '">' +
      esc(x.tipo) + "</span></td><td>" + esc(x.descripcion) + "</td><td><strong>" + formatoMoneda(x.valor) + "</strong></td></tr>"
    ).join(""));
 
    // Elementos opcionales (ya no están en el HTML; se ignoran si no existen)
    setHTML("tablaSedes", datos.sedes.map(s =>
      "<tr><td><strong>" + esc(s.nombre) + '</strong></td><td><span class="estado-demo ok">' + esc(s.estado) +
      "</span></td><td>" + esc(s.actualizacion) + "</td></tr>"
    ).join(""));
 
    const alertas = [];
    datos.alimentos.forEach(a => {
      const estado = estadoAlimento(a)[0];
      if (estado !== "Disponible") {
        alertas.push('<div class="elemento-alerta alerta-' + (estado === "Crítico" ? "peligro" : "advertencia") +
          '"><div class="icono-alerta">!</div><div><strong>' + esc(a.nombre) + "</strong><p>" + estado + ": " + a.cantidad +
          " unidades disponibles.</p><small>Actualizado ahora</small></div></div>");
      }
    });
    if (!alertas.length) {
      alertas.push('<div class="elemento-alerta alerta-exito"><div class="icono-alerta">✓</div><div><strong>Sin alertas críticas</strong><p>El inventario se encuentra dentro de los niveles configurados.</p><small>Actualizado ahora</small></div></div>');
    }
    setHTML("dashboardAlertas", alertas.join(""));
    setText("contadorAlertas", alertas.length);
 
    setHTML("dashboardInventario", datos.alimentos.slice(0, 5).map(a => {
      const porcentaje = Math.min(100, Math.max(5, a.cantidad));
      const est = estadoAlimento(a);
      const clase = est[1];
      return '<div class="fila-inventario"><div class="producto"><div class="icono-producto">▤</div><div><strong>' + esc(a.nombre) +
        "</strong><span>" + esc(a.categoria) + '</span></div></div><div class="existencias"><div class="texto-existencias"><span>' +
        a.cantidad + " unidades</span><strong>" + porcentaje + '%</strong></div><div class="progreso ' +
        (clase === "warn" ? "advertencia" : clase === "bad" ? "peligro" : "") + '"><span style="width:' + porcentaje +
        '%"></span></div></div><span class="estado ' + (clase === "ok" ? "exito" : clase === "warn" ? "advertencia" : "peligro") +
        '">' + est[0] + "</span></div>";
    }).join(""));
 
    const alturas = [45, 68, 54, 82, 61, 90, 72];
    const dias = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
    setHTML("graficaBarras", alturas.map((h, i) =>
      '<div class="contenedor-barra"><div class="barra" style="height:' + h + '%"></div><small>' + dias[i] + "</small></div>"
    ).join(""));
 
    const primera = datos.sedes[0];
    setText("ultimaSync", primera && primera.actualizacion !== "Pendiente"
      ? "Última sincronización: " + primera.actualizacion
      : "Aún no se ha ejecutado una sincronización.");
  }
 
  /* Reportes (RF 6) */
  function generarReporte() {
    const tipo = document.getElementById("tipoReporte").value;
    const fecha = document.getElementById("fechaReporte").value || hoyISO();
    let texto = "";
    if (tipo === "Reporte diario") {
      texto = "Fecha: " + fechaBonita(fecha) +
        "\nProductos registrados: " + datos.alimentos.length +
        "\nUnidades disponibles: " + datos.alimentos.reduce((s, a) => s + a.cantidad, 0) +
        "\nPérdidas registradas: " + datos.perdidas.length +
        "\nOperaciones contables: " + datos.contabilidad.length;
    } else if (tipo === "Inventario general") {
      texto = datos.alimentos.map(a => a.nombre + " | " + a.categoria + " | " + a.cantidad + " unidades | " + a.sede).join("\n") ||
        "No hay alimentos registrados.";
    } else if (tipo === "Pérdida de alimentos") {
      texto = datos.perdidas.length
        ? datos.perdidas.map(p => fechaBonita(p.fecha) + " | " + p.alimento + " | " + p.cantidad + " unidades | " + p.motivo).join("\n")
        : "No hay pérdidas registradas.";
    } else if (tipo === "Consumo") {
      texto = "Consumo estimado a partir de las salidas registradas.\n\n" +
        (datos.perdidas.length
          ? datos.perdidas.map(p => p.alimento + ": " + p.cantidad + " unidades registradas como salida/pérdida").join("\n")
          : "No hay registros de consumo/salidas disponibles.");
    } else {
      texto = datos.contabilidad.map(x => fechaBonita(x.fecha) + " | " + x.tipo + " | " + x.descripcion + " | " + formatoMoneda(x.valor)).join("\n") ||
        "No hay operaciones contables registradas.";
    }
    setHTML("resultadoReporte", "<h4>" + esc(tipo) + "</h4><p>" + esc(texto) + "</p>");
  }
  window.generarReporte = generarReporte;
 
  /* Inicio: restaura la sesión si el servidor ya la tiene abierta */
  GET("/api/sesion")
    .then(r => { if (r.usuario) return iniciarSesion(r.usuario); })
    .catch(err => console.error(err));
})();
 