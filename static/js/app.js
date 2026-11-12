(() => {
  "use strict";
    function confirmar(mensaje, textoBoton) {
    return new Promise(resolve => {
      const fondo = document.createElement("div");
      fondo.className = "cf-fondo";
      fondo.innerHTML =
        '<div class="cf-tarjeta">' +
          '<div class="cf-icono">🗑️</div>' +
          "<h3>¿Estás seguro?</h3>" +
          "<p>" + esc(mensaje) + "</p>" +
          '<div class="cf-botones">' +
            '<button type="button" class="cf-no">Cancelar</button>' +
            '<button type="button" class="cf-si">' + esc(textoBoton || "Sí, eliminar") + "</button>" +
          "</div>" +
        "</div>";

      document.body.appendChild(fondo);

      const cerrar = valor => {
        document.removeEventListener("keydown", alEscape, true);
        fondo.remove();
        resolve(valor);
      };

      const alEscape = e => {
        if (e.key === "Escape") {
          e.stopImmediatePropagation();
          cerrar(false);
        }
      };

      document.addEventListener("keydown", alEscape, true);
      fondo.querySelector(".cf-si").onclick = () => cerrar(true);
      fondo.querySelector(".cf-no").onclick = () => cerrar(false);
      fondo.addEventListener("click", e => { if (e.target === fondo) cerrar(false); });
      fondo.querySelector(".cf-si").focus();
    });
  }

  function avisar(mensaje) {
    return new Promise(resolve => {
      const fondo = document.createElement("div");
      fondo.className = "cf-fondo";
      fondo.innerHTML =
        '<div class="cf-tarjeta">' +
          '<div class="cf-icono aviso">!</div>' +
          "<h3>Atención</h3>" +
          "<p>" + esc(mensaje) + "</p>" +
          '<div class="cf-botones">' +
            '<button type="button" class="cf-ok">Entendido</button>' +
          "</div>" +
        "</div>";

      document.body.appendChild(fondo);

      const cerrar = () => {
        document.removeEventListener("keydown", alEscape, true);
        fondo.remove();
        resolve();
      };

      const alEscape = e => {
        if (e.key === "Escape" || e.key === "Enter") {
          e.stopImmediatePropagation();
          cerrar();
        }
      };

      document.addEventListener("keydown", alEscape, true);
      fondo.querySelector(".cf-ok").onclick = cerrar;
      fondo.addEventListener("click", e => { if (e.target === fondo) cerrar(); });
      fondo.querySelector(".cf-ok").focus();
    });
  }

  window.confirmar = confirmar;
  window.avisar = avisar;

  /* 
     COMUNICACIÓN CON EL SERVIDOR
 */

  async function api(url, opciones) {
    const resp = await fetch(
      url,
      Object.assign({ credentials: "same-origin" }, opciones)
    );

    let cuerpo = {};
    try {
      cuerpo = await resp.json();
    } catch (e) {}

    if (!resp.ok) {
      if (resp.status === 401 && url !== "/api/login") {
        mostrarLogin();
      }
      throw new Error(cuerpo.error || "No se pudo comunicar con el servidor.");
    }

    return cuerpo;
  }

  const GET = url => api(url);

  const POST = (url, cuerpo) =>
    api(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(cuerpo || {})
    });

  /* 
     DATOS
  */

  let sesion = null;

  let datos = {
    usuarios: [],
    alimentos: [],
    perdidas: [],
    contabilidad: [],
    sedes: [],
    proveedores: []
  };

  /* 
     SISTEMA DE MESAS
*/

  let mesaSeleccionada = null;

  const mesas = {
    1: { estado: "disponible", productos: [] },
    2: { estado: "disponible", productos: [] },
    3: { estado: "disponible", productos: [] },
    4: { estado: "disponible", productos: [] }
  };

  /* 
     FUNCIONES GENERALES
 */

  const hoyISO = () => new Date().toLocaleDateString("en-CA");

  function esc(texto) {
    const mapa = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return String(texto == null ? "" : texto).replace(/[&<>"']/g, c => mapa[c]);
  }

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

    setTimeout(() => {
      el.classList.remove("visible");
    }, 4000);
  }

  function formatoMoneda(valor) {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0
    }).format(valor || 0);
  }

  function iniciales(nombre) {
    return String(nombre || "")
      .split(" ")
      .map(x => x[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }

  function fechaBonita(fecha) {
    if (!fecha) return "-";
    const [y, m, d] = fecha.split("-");
    return d + "/" + m + "/" + y;
  }

  /*
     CARGA DE DATOS
 */

  async function cargarDatos() {
    if (!sesion) return;

    const peticiones = [
      GET("/api/alimentos"),
      GET("/api/perdidas"),
      GET("/api/contabilidad"),
      GET("/api/sedes"),
      GET("/api/proveedores")
    ];

    if (sesion.rol === "Administrador") {
      peticiones.push(GET("/api/usuarios"));
    }

    const r = await Promise.all(peticiones);

    datos = {
      alimentos: Array.isArray(r[0]) ? r[0] : [],
      perdidas: Array.isArray(r[1]) ? r[1] : [],
      contabilidad: Array.isArray(r[2]) ? r[2] : [],
      sedes: Array.isArray(r[3]) ? r[3] : [],
      proveedores: Array.isArray(r[4]) ? r[4] : [],
      usuarios: Array.isArray(r[5]) ? r[5] : []
    };

    renderizarTodo();
    actualizarProductosOrden();
  }

  function recargar() {
    return cargarDatos().catch(err => console.error(err));
  }

  /* 
     VISTAS Y SESIÓN
 */

  function mostrarVista(nombre) {
    if (!sesion) return;

    document
      .querySelectorAll(".vista")
      .forEach(v => v.classList.remove("activa"));

    const vista = document.getElementById("vista-" + nombre);
    if (vista) vista.classList.add("activa");

    document
      .querySelectorAll(".elemento-menu")
      .forEach(a => {
        a.classList.toggle(
          "activo",
          a.dataset.vista === nombre
        );
      });

    const titulos = {
      dashboard: ["Inicio / Dashboard", "Panel principal"],
      usuarios: ["Inicio / Usuarios y Proveedores", "Usuarios y proveedores"],
      alimentos: ["Inicio / Alimentos", "Administración de alimentos"],
      platos: ["Inicio / Platos", "Menú de platos"],
      inventario: ["Inicio / Inventario", "Inventario en tiempo real"],
      sincronizacion: ["Inicio / Sincronización", "Sincronización de inventario"],
      ventas: ["Inicio / Ventas", "Gestión de mesas y ventas"],
      saldos: ["Inicio / Saldos", "Gestión de Saldos y Cuentas"],
      reportes: ["Inicio / Reportes", "Generación de reportes"],
      inversiones: ["Inicio / Inversiones", "Control de inversiones"],
      configuracion: ["Inicio / Configuración", "Configuración"],
      ayuda: ["Inicio / Ayuda", "Ayuda"]
    };

    const t = titulos[nombre] || ["Inicio", "Meraki"];
    setText("migas", t[0]);
    setText("tituloSuperior", t[1]);

    recargar();

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  }

  window.mostrarVista = mostrarVista;

  async function iniciarSesion(usuario) {
    sesion = {
      id: usuario.id,
      nombre: usuario.nombre,
      rol: usuario.rol,
      login: usuario.login
    };

    document.getElementById("pantallaLogin").classList.add("oculto");
    document.getElementById("aplicacion").classList.remove("oculto");

    setText("nombreSidebar", sesion.nombre);
    setText("rolSidebar", sesion.rol);
    setText("nombreTop", sesion.nombre);
    setText("avatarSidebar", iniciales(sesion.nombre));
    setText("avatarTop", iniciales(sesion.nombre));

   aplicarPermisos();

    if (typeof window.cargarCategoriasSelect === "function") {
      window.cargarCategoriasSelect();
    }

    await recargar();
  }
  // Solo el Administrador ve el bloque de usuarios.
  // Proveedores queda visible para todos los roles.
  function aplicarPermisos() {
    const bloque = document.getElementById("bloqueUsuarios");
    if (bloque) {
      bloque.style.display =
        sesion && sesion.rol === "Administrador" ? "block" : "none";
    }
  }

  function mostrarLogin() {
    sesion = null;

    datos = {
      usuarios: [],
      alimentos: [],
      perdidas: [],
      contabilidad: [],
      sedes: [],
      proveedores: []
    };

    document.getElementById("aplicacion").classList.add("oculto");
    document.getElementById("pantallaLogin").classList.remove("oculto");
    document.getElementById("formLogin").reset();
    document.getElementById("formRestablecer").classList.add("oculto");
  }

  async function cerrarSesion() {
    try {
      await POST("/api/logout");
    } catch (e) {}
    mostrarLogin();
  }

  window.cerrarSesion = cerrarSesion;

  document
    .querySelectorAll(".elemento-menu")
    .forEach(enlace => {
      enlace.addEventListener("click", e => {
        e.preventDefault();

        mostrarVista(
          enlace.dataset.vista
        );
      });
    });

  /*
     LOGIN
 */

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

  document
    .getElementById("formRestablecer")
    .addEventListener("submit", async e => {
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

  document
    .getElementById("btnPerfil")
    .addEventListener("click", () => mostrarVista("configuracion"));

  /* 
     USUARIOS
   */

  document.getElementById("formUsuario").addEventListener("submit", async e => {
    e.preventDefault();

    try {
      const id = Number(document.getElementById("usuarioId").value) || null;
      const nombre = document.getElementById("usuarioNombre").value.trim();
      const apellido = document.getElementById("usuarioApellido").value.trim();
      const usuario = document.getElementById("usuarioLogin").value.trim();
      const clave = document.getElementById("usuarioClave").value;
      const rol = document.getElementById("usuarioRol").value;
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

  window.limpiarUsuario =
    limpiarUsuario;

  function editarUsuario(id) {
    const u = datos.usuarios.find(x => Number(x.id) === Number(id));

    if (!u) {
      mensaje(
        "mensajeUsuario",
        "No se encontró el usuario.",
        "error"
      );

      return;
    }

    document
      .getElementById("usuarioId")
      .value = u.id || "";

    document
      .getElementById("usuarioNombre")
      .value = u.nombre || "";

    document
      .getElementById("usuarioApellido")
      .value = u.apellido || "";

    document
      .getElementById("usuarioLogin")
      .value =
        u.login ||
        u.usuario ||
        "";

    document
      .getElementById("usuarioClave")
      .value = "";

    document
      .getElementById("usuarioClave")
      .required = false;

    document
      .getElementById("usuarioRol")
      .value = u.rol || "";

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  }

  window.editarUsuario =
    editarUsuario;

  async function eliminarUsuario(id) {
    if (!(await confirmar("¿Deseas eliminar este usuario?"))) return;

    try {
      await POST("/api/usuarios/" + id + "/eliminar");
      mensaje("mensajeUsuario", "Usuario eliminado correctamente.", "ok");
      await recargar();

    } catch (err) {
      mensaje(
        "mensajeUsuario",
        err.message,
        "error"
      );
    }
  }

  window.eliminarUsuario =
    eliminarUsuario;

  function generarInformeUsuarios() {
    const html = datos.usuarios.length
      ? "<h4>Total: " + datos.usuarios.length + " usuarios</h4><p>" +
        datos.usuarios
          .map(u => esc(u.nombre) + " " + esc(u.apellido) + " | " + esc(u.login) + " | " + esc(u.rol))
          .join("<br>") +
        "</p>"
      : "<p>No hay usuarios registrados.</p>";

    setHTML("informeUsuarios", html);
  }

  window.generarInformeUsuarios = generarInformeUsuarios;

  /* 
     PROVEEDORES
 */

  
  /*
     MODAL Y CRUD DE PROVEEDORES
 */

  function abrirModalProveedores() {
    const modal = document.getElementById("modalProveedores");

    modal.classList.add("abierto");
    modal.setAttribute("aria-hidden", "false");

    renderizarProveedores();
  }

  window.abrirModalProveedores = abrirModalProveedores;

  function cerrarModalProveedores() {
    const modal = document.getElementById("modalProveedores");

    modal.classList.remove("abierto");
    modal.setAttribute("aria-hidden", "true");

    limpiarProveedor();
  }

  window.cerrarModalProveedores = cerrarModalProveedores;


  // CERRAR AL HACER CLIC FUERA DEL MODAL

  document.getElementById("modalProveedores").addEventListener("click", e => {
    if (e.target.id === "modalProveedores") {
      cerrarModalProveedores();
    }
  });


  // MOSTRAR PROVEEDORES EN LA TABLA

  function renderizarProveedores() {
    const tabla = document.getElementById("tablaProveedores");

    if (!datos.proveedores.length) {
      tabla.innerHTML = `
        <tr>
          <td colspan="3">No hay proveedores registrados.</td>
        </tr>
      `;
      return;
    }

    tabla.innerHTML = datos.proveedores.map(p => `
      <tr>
        <td><strong>${esc(p.nombre)}</strong></td>
        <td>${esc(p.telefono)}</td>
        <td>
          <div class="acciones-tabla">
            <button type="button" onclick="editarProveedor(${p.id})">
              Editar
            </button>

            <button type="button" class="eliminar"
                    onclick="eliminarProveedor(${p.id})">
              Eliminar
            </button>
          </div>
        </td>
      </tr>
    `).join("");
  }


  // GUARDAR PROVEEDOR

  document.getElementById("formProveedor").addEventListener("submit", async e => {
    e.preventDefault();

    try {
      const r = await POST("/api/proveedores", {
        id: Number(document.getElementById("proveedorId").value) || null,
        nombre: document.getElementById("proveedorNombre").value.trim(),
        telefono: document.getElementById("proveedorTelefono").value.trim()
      });

      mensaje("mensajeProveedor", r.mensaje || "Proveedor guardado correctamente.", "ok");
      limpiarProveedor();
      await recargar();
      renderizarProveedores();
    } catch (err) {
      mensaje("mensajeProveedor", err.message, "error");
    }
  });

  // LIMPIAR FORMULARIO

  function limpiarProveedor() {
    document.getElementById("formProveedor").reset();
    document.getElementById("proveedorId").value = "";
  }

  // EDITAR PROVEEDOR

  function editarProveedor(id) {
    const p = datos.proveedores.find(x => Number(x.id) === Number(id));

    if (!p) {
      mensaje("mensajeProveedor", "No se encontró el proveedor.", "error");
      return;
    }

    document.getElementById("proveedorId").value = p.id;
    document.getElementById("proveedorNombre").value = p.nombre || "";
    document.getElementById("proveedorTelefono").value = p.telefono || "";
    document.getElementById("proveedorNombre").focus();
  }

  window.editarProveedor = editarProveedor;

  // ELIMINAR PROVEEDOR

  async function eliminarProveedor(id) {
if (!(await confirmar("¿Deseas eliminar este proveedor?"))) return;

    try {
      await POST("/api/proveedores/" + id + "/eliminar");
      await recargar();
      renderizarProveedores();
      mensaje("mensajeProveedor", "Proveedor eliminado correctamente.", "ok");
    } catch (err) {
      mensaje("mensajeProveedor", err.message, "error");
    }
  }

  window.eliminarProveedor = eliminarProveedor;

  // INFORME DE PROVEEDORES

  function generarInformeProveedores() {
    const html = datos.proveedores.length
      ? "<h4>Total: " + datos.proveedores.length +
        " proveedores</h4><p>" +
        datos.proveedores
          .map(p => esc(p.nombre) + " | " + esc(p.telefono))
          .join("<br>") +
        "</p>"
      : "<p>No hay proveedores registrados.</p>";

    setHTML("informeProveedores", html);
  }

  /*
     ALIMENTOS
  */

  function alimentosFiltrados() {
    const texto = (document.getElementById("filtroAlimentoTexto")?.value || "").trim().toLowerCase();
    const cat = document.getElementById("filtroAlimentoCategoria")?.value || "";

    return datos.alimentos.filter(a =>
      (!texto || String(a.nombre || "").toLowerCase().includes(texto)) &&
      (!cat || String(a.categoria) === cat)
    );
  }

  function renderizarTablaAlimentos() {
    const lista = alimentosFiltrados();

    setHTML(
      "tablaAlimentos",
      lista.length
        ? lista.map(a =>
            "<tr>" +
            "<td><strong>" + esc(a.nombre) + "</strong></td>" +
            "<td>" + esc(a.categoria) + "</td>" +
            "<td>" + a.cantidad + "</td>" +
            "<td>" + formatoMoneda(a.precio) + "</td>" +
            "<td>" + fechaBonita(a.vencimiento) + "</td>" +
            "<td>" + esc(a.proveedor || "-") + "</td>" +
            '<td><div class="acciones-tabla">' +
            '<button onclick="editarAlimento(' + a.id + ')">Editar</button>' +
            '<button class="eliminar" onclick="eliminarAlimento(' + a.id + ')">Eliminar</button>' +
            "</div></td>" +
            "</tr>"
          ).join("")
        : '<tr><td colspan="7">No hay alimentos que coincidan.</td></tr>'
    );
  }

  function limpiarFiltroAlimentos() {
    const inputTexto = document.getElementById("filtroAlimentoTexto");
    const selectCat = document.getElementById("filtroAlimentoCategoria");

    if (inputTexto) inputTexto.value = "";
    if (selectCat) selectCat.value = "";

    renderizarTablaAlimentos();
  }

  window.limpiarFiltroAlimentos = limpiarFiltroAlimentos;

  document
    .getElementById("filtroAlimentoTexto")
    ?.addEventListener("input", renderizarTablaAlimentos);

  document
    .getElementById("filtroAlimentoCategoria")
    ?.addEventListener("change", renderizarTablaAlimentos);

  document.getElementById("formAlimento").addEventListener("submit", async e => {
    e.preventDefault();

    try {
      const r = await POST("/api/alimentos", {
        id: Number(document.getElementById("alimentoId").value) || null,
        nombre: document.getElementById("alimentoNombre").value.trim(),
        categoria: document.getElementById("alimentoCategoria").value,
        cantidad: Number(document.getElementById("alimentoCantidad").value),
        precio: Number(document.getElementById("alimentoPrecio").value),
        vencimiento: document.getElementById("alimentoVencimiento").value,
        proveedor_id: Number(document.getElementById("alimentoProveedor").value) || null
      });

      mensaje("mensajeAlimento", r.mensaje || "Alimento guardado correctamente.", "ok");
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

  const modal = document.getElementById("modalEditarAlimento");
  const categoria = document.getElementById("editCategoria");
  const proveedor = document.getElementById("editProveedor");

  /*  MODAL EDITAR ALIMENTOS  */

  let stockOriginal = 0;

  function editarAlimento(id) {
    const alimento = datos.alimentos.find(a => Number(a.id) === Number(id));

    if (!alimento) {
      mensaje("mensajeAlimento", "No se encontró el alimento.", "error");
      return;
    }

    const modal = document.getElementById("modalEditarAlimento");
    const categoria = document.getElementById("editCategoria");
    const proveedor = document.getElementById("editProveedor");

    categoria.innerHTML = document.getElementById("alimentoCategoria").innerHTML;

    proveedor.innerHTML = '<option value="">Seleccione un proveedor</option>';

    datos.proveedores.forEach(p => {
      const opcion = document.createElement("option");
      opcion.value = p.id ?? p.nombre;
      opcion.textContent = p.nombre;
      proveedor.appendChild(opcion);
    });

    document.getElementById("editId").value = alimento.id;
    document.getElementById("editNombre").value = alimento.nombre ?? "";
    document.getElementById("editCategoria").value = alimento.categoria ?? "";
    document.getElementById("editPrecio").value = alimento.precio ?? 0;
    document.getElementById("editVencimiento").value = alimento.vencimiento ?? "";
    document.getElementById("editCantidad").value = Number(alimento.cantidad) || 0;
    document.getElementById("editPaso").value = 1;

    const proveedorEncontrado = datos.proveedores.find(
      p =>
        String(p.id) === String(alimento.proveedor_id) ||
        String(p.nombre).trim().toLowerCase() ===
          String(alimento.proveedor || "").trim().toLowerCase()
    );

    proveedor.value = proveedorEncontrado
      ? String(proveedorEncontrado.id ?? proveedorEncontrado.nombre)
      : "";

    stockOriginal = Number(alimento.cantidad) || 0;

    actualizarDeltaStock();

    document.getElementById("mensajeEdicion").textContent = "";

    modal.classList.add("abierto");
    modal.setAttribute("aria-hidden", "false");
  }

  window.editarAlimento = editarAlimento;

  function cerrarModalAlimento() {
    const modal = document.getElementById("modalEditarAlimento");
    modal.classList.remove("abierto");
    modal.setAttribute("aria-hidden", "true");
  }

  function cambiarStock(signo) {
    const cantidad = document.getElementById("editCantidad");
    const pasoInput = document.getElementById("editPaso");

    const paso = Math.max(1, Number(pasoInput.value) || 1);
    const actual = Math.max(0, Number(cantidad.value) || 0);

    cantidad.value = Math.max(0, actual + signo * paso);

    actualizarDeltaStock();
  }

  function actualizarDeltaStock() {
    const nuevo = Math.max(
      0,
      Number(document.getElementById("editCantidad").value) || 0
    );

    const diferencia = nuevo - stockOriginal;
    const indicador = document.getElementById("stockDelta");

    indicador.className = "stock-delta";

    if (diferencia > 0) {
      indicador.classList.add("sube");
    } else if (diferencia < 0) {
      indicador.classList.add("baja");
    }

    if (diferencia === 0) {
      indicador.textContent = `Stock actual: ${stockOriginal}`;
    } else {
      indicador.textContent =
        `${stockOriginal} → ${nuevo} (${diferencia > 0 ? "+" : ""}${diferencia})`;
    }
  }

  async function guardarEdicionAlimento() {
    const id = Number(document.getElementById("editId").value);

    const nombre = document.getElementById("editNombre").value.trim();
    const categoria = document.getElementById("editCategoria").value;
    const precio = Number(document.getElementById("editPrecio").value);
    const cantidad = Number(document.getElementById("editCantidad").value);
    const vencimiento = document.getElementById("editVencimiento").value;
    const proveedorId = document.getElementById("editProveedor").value;

    if (!nombre) {
      mensaje("mensajeEdicion", "El nombre del alimento es obligatorio.", "error");
      return;
    }

    if (!Number.isFinite(precio) || precio < 0) {
      mensaje("mensajeEdicion", "El precio no puede ser negativo.", "error");
      return;
    }

    if (!Number.isInteger(cantidad) || cantidad < 0) {
      mensaje(
        "mensajeEdicion",
        "El stock debe ser un número entero igual o mayor a cero.",
        "error"
      );
      return;
    }

    const boton = document.getElementById("btnGuardarEdicion");
    boton.disabled = true;
    boton.textContent = "Guardando...";

    try {
      const respuesta = await POST("/api/alimentos", {
        id,
        nombre,
        categoria,
        precio,
        cantidad,
        vencimiento,
        proveedor_id: Number(proveedorId) || null
      });

      cerrarModalAlimento();

      mensaje(
        "mensajeAlimento",
        respuesta.mensaje || "Alimento actualizado correctamente.",
        "ok"
      );

      await recargar();
    } catch (error) {
      mensaje(
        "mensajeEdicion",
        error.message || "No se pudieron guardar los cambios.",
        "error"
      );
    } finally {
      boton.disabled = false;
      boton.textContent = "Guardar cambios";
    }
  }

  document.getElementById("btnStockMas")?.addEventListener("click", () => cambiarStock(1));
  document.getElementById("btnStockMenos")?.addEventListener("click", () => cambiarStock(-1));
  document.getElementById("editCantidad")?.addEventListener("input", actualizarDeltaStock);

  document.getElementById("editPaso")?.addEventListener("input", () => {
    const paso = document.getElementById("editPaso");
    if (Number(paso.value) < 1) paso.value = 1;
  });

  document.getElementById("btnGuardarEdicion")?.addEventListener("click", guardarEdicionAlimento);
  document.getElementById("btnCancelarEdicion")?.addEventListener("click", cerrarModalAlimento);

  document.getElementById("modalEditarAlimento")?.addEventListener("click", evento => {
    if (evento.target.id === "modalEditarAlimento") {
      cerrarModalAlimento();
    }
  });

  document.addEventListener("keydown", evento => {
    if (evento.key === "Escape") {
      cerrarModalAlimento();
    }
  });

  /*  FIN MODAL EDITAR ALIMENTOS  */

  async function eliminarAlimento(id) {
    if (!(await confirmar("¿Desea eliminar este alimento?"))) return;
    try {
      await POST("/api/alimentos/" + id + "/eliminar");
      await recargar();
    } catch (err) {
      mensaje("mensajeAlimento", err.message, "error");
    }
  }

  window.eliminarAlimento = eliminarAlimento;


  /* 
     PÉRDIDAS
   */

  document.getElementById("formPerdida").addEventListener("submit", async e => {
    e.preventDefault();

    const formulario = e.target;

    try {
      const r = await POST("/api/perdidas", {
        alimento_id: Number(document.getElementById("perdidaAlimento").value),
        cantidad: Number(document.getElementById("perdidaCantidad").value),
        motivo: document.getElementById("perdidaMotivo").value,
        observacion: document.getElementById("perdidaObservacion").value.trim()
      });

      formulario.reset();
      mensaje("mensajePerdida", r.mensaje || "Pérdida registrada correctamente.", "ok");
      await recargar();
    } catch (err) {
      mensaje("mensajePerdida", err.message, "error");
    }
  });

  /* 
     MESAS
 */

  function inicializarMesas() {
    document.querySelectorAll(".mesa-card").forEach(card => {
      card.addEventListener("click", () => seleccionarMesa(Number(card.dataset.mesa)));
    });

    const btnAgregar = document.getElementById("btnAgregarProducto");
    if (btnAgregar) btnAgregar.addEventListener("click", agregarProductoOrden);

    const btnVenta = document.getElementById("btnRegistrarVenta");
    if (btnVenta) btnVenta.addEventListener("click", registrarVenta);

    const btnLiberar = document.getElementById("btnLiberarMesa");
    if (btnLiberar) btnLiberar.addEventListener("click", liberarMesa);

    actualizarProductosOrden();
    actualizarVisualMesas();
  }

  function seleccionarMesa(numero) {
    if (!mesas[numero]) return;

    mesaSeleccionada = numero;
    window.mesaSeleccionada = numero;

    setText("mesaSeleccionada", "Mesa " + numero);
    setText(
      "estadoOrden",
      mesas[numero].estado === "ocupada" ? "Orden activa" : "Mesa disponible"
    );

    actualizarProductosOrden();
    renderizarOrden();
    actualizarVisualMesas();

    // Notifica al módulo de meta que la mesa cambió
    if (typeof window.actualizarMeta === "function") {
      window.actualizarMeta();
    }
  }

  function actualizarVisualMesas() {
    document.querySelectorAll(".mesa-card").forEach(card => {
      const numero = Number(card.dataset.mesa);
      const mesa = mesas[numero];

      card.classList.remove("disponible", "ocupada", "seleccionada");
      card.classList.add(mesa.estado);

      if (numero === mesaSeleccionada) {
        card.classList.add("seleccionada");
      }

      const estado = card.querySelector(".mesa-estado");
      if (estado) {
        estado.textContent = mesa.estado === "ocupada" ? "Ocupada" : "Disponible";
      }
    });
  }

  /* 
     PRODUCTOS DE LA ORDEN
 */

  function obtenerPrecioProducto(producto) {
    return Number(
      producto.precio ?? producto.precio_venta ?? producto.valor ?? 0
    );
  }

  function actualizarProductosOrden() {
    const select = document.getElementById("productoOrden");
    if (!select) return;

    const seleccionado =
      select.value;

    select.innerHTML =
      '<option value="">Seleccionar producto</option>' +
      datos.alimentos
        .map(a => {
          const precio = obtenerPrecioProducto(a);
          return (
            '<option value="' + esc(a.id) + '">' +
            esc(a.nombre) + " — " + formatoMoneda(precio) +
            "</option>"
          );
        })
        .join("");

    if (seleccionado) select.value = seleccionado;
  }

  function agregarProductoOrden() {
    if (!mesaSeleccionada) {
        avisar(
        "Primero selecciona una mesa."
      );

      return;
    }

    const productoId =
      Number(
        document
          .getElementById("productoOrden")
          .value
      );

    const cantidad =
      Number(
        document
          .getElementById("cantidadOrden")
          .value
      );

    if (!productoId) {
      avisar("Selecciona un producto.");
      return;
    }

    if (
      !cantidad ||
      cantidad < 1
    ) {
      avisar("La cantidad debe ser mayor a 0.");

      return;
    }

    const producto =
      datos.alimentos.find(
        a =>
          Number(a.id) ===
          productoId
      );

    if (!producto) {
      avisar("No se encontró el producto.");
      return;
    }

    const precio =
      obtenerPrecioProducto(
        producto
      );

    const orden =
      mesas[
        mesaSeleccionada
      ];

    const existente =
      orden.productos.find(
        p =>
          Number(p.id) ===
          productoId
      );

    if (existente) {
      existente.cantidad +=
        cantidad;
    } else {
      orden.productos.push({
        id: producto.id,
        nombre: producto.nombre,
        cantidad: cantidad,
        precio: precio
      });
    }

    orden.estado = "ocupada";

    document
      .getElementById(
        "cantidadOrden"
      )
      .value = 1;

    document
      .getElementById(
        "productoOrden"
      )
      .value = "";

    setText("estadoOrden", "Orden activa");

    renderizarOrden();
    actualizarVisualMesas();
  }

  function renderizarOrden() {
    const lista = document.getElementById("listaOrden");
    if (!lista) return;

    if (!mesaSeleccionada) {
      lista.innerHTML = `
        <div class="orden-vacia">
          <span>🍽️</span>
          <p>Selecciona una mesa para comenzar.</p>
        </div>
      `;
      setText("totalOrden", formatoMoneda(0));
      return;
    }

    const orden =
      mesas[
        mesaSeleccionada
      ];

    if (
      !orden ||
      !orden.productos.length
    ) {
      lista.innerHTML = `
        <div class="orden-vacia">
          <span>🍽️</span>
          <p>No hay productos en esta orden.</p>
        </div>
      `;
      setText("totalOrden", formatoMoneda(0));
      return;
    }

    lista.innerHTML = orden.productos
      .map((producto, indice) => {
        const subtotal = producto.precio * producto.cantidad;

        return `
          <div class="orden-producto">
            <span><strong>${esc(producto.nombre)}</strong></span>
            <span>${producto.cantidad}</span>
            <span>${formatoMoneda(producto.precio)}</span>
            <strong>${formatoMoneda(subtotal)}</strong>
            <button type="button" class="btn-eliminar-producto"
              onclick="eliminarProductoOrden(${indice})">×</button>
          </div>
        `;
      })
      .join("");

    setText(
      "totalOrden",
      formatoMoneda(
        calcularTotalOrden()
      )
    );
  }

  function calcularTotalOrden() {
    if (!mesaSeleccionada) return 0;

    return mesas[mesaSeleccionada].productos.reduce(
      (total, p) => total + p.precio * p.cantidad,
      0
    );
  }

  function eliminarProductoOrden(indice) {
    if (!mesaSeleccionada) return;

    const orden = mesas[mesaSeleccionada];
    orden.productos.splice(indice, 1);

    if (orden.productos.length === 0) {
      orden.estado = "disponible";
      setText("estadoOrden", "Mesa disponible");
    }

    renderizarOrden();
    actualizarVisualMesas();
  }

  window.eliminarProductoOrden =
    eliminarProductoOrden;

  /* 
     REGISTRAR VENTA (CONECTADO A SALDOS)
   */

  async function registrarVenta() {
    if (!mesaSeleccionada) {
      await avisar("Selecciona una mesa.");
      return;
    }

    const orden =
      mesas[
        mesaSeleccionada
      ];

    if (
      !orden ||
      !orden.productos.length
    ) {
      await avisar("La mesa no tiene productos.");
      return;
    }

    const total =
      calcularTotalOrden();

    if (total <= 0) {
    await avisar("El total de la orden debe ser mayor a $0.");

      return;
    }

    const numeroMesa =
      mesaSeleccionada;

    const descripcion =
      "Venta Mesa " +
      numeroMesa +
      ": " +
      orden.productos
        .map(
          p =>
            p.cantidad +
            "x " +
            p.nombre
        )
        .join(", ");

    try {
      await POST("/api/contabilidad", {
        tipo: "Venta",
        descripcion: descripcion,
        valor: total
      });

      // Sincronización automática con el saldo del administrador
      const saldoActualAdmin = Number(localStorage.getItem("saldoAdmin") || 0) + total;
      localStorage.setItem("saldoAdmin", saldoActualAdmin);

      if (typeof window.cargarSaldos === "function") {
        window.cargarSaldos();
      }

      mesas[numeroMesa] = { estado: "disponible", productos: [] };
      mesaSeleccionada = null;
      window.mesaSeleccionada = null;

      setText(
        "estadoOrden",
        "Sin orden"
      );

      renderizarOrden();
      actualizarVisualMesas();

      await recargar();

    } catch (err) {
      console.error(err);
         await avisar("No se pudo registrar la venta:\n" + err.message);
    }
  }
  /* 
     LIBERAR MESA
  */

  async function liberarMesa() {
    if (!mesaSeleccionada) {
      await avisar("Selecciona una mesa.");
      return;
    }

    if (!(await confirmar("La orden actual de la Mesa " + mesaSeleccionada + " se eliminará.", "Sí, liberar"))) return;

    setText(
      "estadoOrden",
      "Sin orden"
    );

    mesas[mesaSeleccionada] = { estado: "disponible", productos: [] };

    mesaSeleccionada = null;
    window.mesaSeleccionada = null;

    setText("mesaSeleccionada", "Selecciona una mesa para comenzar");
    setText("estadoOrden", "Sin orden");

    renderizarOrden();
    actualizarVisualMesas();
  }

  /* 
     SINCRONIZACIÓN
  */

  async function sincronizar() {
    setText(
      "estadoSync",
      "Sincronizando información..."
    );

    const punto = document.getElementById("puntoSync");
    if (punto) punto.style.background = "var(--warning)";

    try {
      const r =
        await POST(
          "/api/sincronizar"
        );

      await cargarDatos();

      setText("estadoSync", "Información sincronizada");
      if (punto) punto.style.background = "var(--success)";

      mensaje("mensajeSync", r.mensaje, "ok");
    } catch (err) {
      setText("estadoSync", "Error de sincronización");
      mensaje("mensajeSync", err.message, "error");
    }
  }

  window.sincronizar =
    sincronizar;

  /* 
     ESTADOS DE ALIMENTOS
  */

  function diasParaVencer(a) {
    return Math.ceil(
      (new Date(a.vencimiento + "T23:59:59") - new Date()) / 86400000
    );
  }

  function estadoAlimento(a) {
    if (a.cantidad <= 15) return ["Crítico", "bad"];
    if (diasParaVencer(a) <= 3) return ["Por vencer", "bad"];
    if (a.cantidad <= 30) return ["Stock bajo", "warn"];
    return ["Disponible", "ok"];
  }

  /* 
     RENDERIZADO GENERAL
   */

  function renderizarTodo() {
    if (!sesion) return;

    const totalUnidades = datos.alimentos.reduce((s, a) => s + a.cantidad, 0);

    const criticos = datos.alimentos.filter(
      a => estadoAlimento(a)[1] === "bad"
    ).length;

    const porVencer = datos.alimentos.filter(a => diasParaVencer(a) <= 3).length;

    const ventas = datos.contabilidad
      .filter(x => x.tipo === "Venta")
      .reduce((s, x) => s + Number(x.valor), 0);

    const gastos = datos.contabilidad
      .filter(x => x.tipo === "Gasto operativo")
      .reduce((s, x) => s + Number(x.valor), 0);

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

    /* SINCRONIZACIÓN DE SALDO */
    if (localStorage.getItem("saldoAdmin") === null) {
      localStorage.setItem("saldoAdmin", ventas - gastos);
    }

    if (typeof window.cargarSaldos === "function") {
      window.cargarSaldos();
    } else {
      const saldoLocal = Number(localStorage.getItem("saldoAdmin") || 0);
      setText("saldoAdmin", formatoMoneda(saldoLocal));
    }

    /* USUARIOS */
    setHTML(
      "tablaUsuarios",
      datos.usuarios
        .map(
          u =>
            "<tr>" +
            "<td><strong>" + esc(u.nombre) + "</strong></td>" +
            "<td>" + esc(u.apellido) + "</td>" +
            "<td>" + esc(u.login) + "</td>" +
            "<td>" + esc(u.rol) + "</td>" +
            '<td><div class="acciones-tabla">' +
            '<button onclick="editarUsuario(' + u.id + ')">Editar</button>' +
            '<button class="eliminar" onclick="eliminarUsuario(' + u.id + ')">Eliminar</button>' +
            "</div></td>" +
            "</tr>"
        )
        .join("")
    );

    /* PROVEEDORES */
   /* PROVEEDORES */

renderizarProveedores();

const comboProv = document.getElementById("alimentoProveedor");

if (comboProv) {
    const seleccionado = comboProv.value;

    comboProv.innerHTML =
        '<option value="">Seleccionar proveedor</option>' +
        datos.proveedores
            .map(p =>
                '<option value="' + p.id + '">' +
                esc(p.nombre) +
                '</option>'
            )
            .join("");

    if (datos.proveedores.some(p => String(p.id) === String(seleccionado))) {
        comboProv.value = seleccionado;
    }
}

    /* ALIMENTOS  Jose */
    setHTML(
      "tablaAlimentos",
      datos.alimentos
        .map(
          a =>
            "<tr>" +
            "<td><strong>" + esc(a.nombre) + "</strong></td>" +
            "<td>" + esc(a.categoria) + "</td>" +
            "<td>" + a.cantidad + "</td>" +
            "<td>" + formatoMoneda(a.precio) + "</td>" +
            "<td>" + fechaBonita(a.vencimiento) + "</td>" +
            "<td>" + esc(a.proveedor || "-") + "</td>" +
            '<td><div class="acciones-tabla">' +
            '<button onclick="editarAlimento(' + a.id + ')">Editar</button>' +
            '<button class="eliminar" onclick="eliminarAlimento(' + a.id + ')">Eliminar</button>' +
            "</div></td>" +
            "</tr>"
        )
        .join("")
    );

    /* INVENTARIO */
    setHTML(
      "tablaInventario",
      datos.alimentos
        .map(a => {
          const est = estadoAlimento(a);

          return (
            "<tr>" +
            "<td><strong>" + esc(a.nombre) + "</strong></td>" +
            "<td>" + esc(a.categoria) + "</td>" +
            "<td>" + a.cantidad + " unidades</td>" +
            "<td>" + fechaBonita(a.vencimiento) + "</td>" +
            "<td>" + esc(a.proveedor || "-") + "</td>" +
            '<td><span class="estado-demo ' + est[1] + '">' + est[0] + "</span></td>" +
            "</tr>"
          );
        })
        .join("")
    );

    /* PÉRDIDAS (combo) */
    const comboPerdida = document.getElementById("perdidaAlimento");

    if (comboPerdida) {
      const seleccionado = comboPerdida.value;

      comboPerdida.innerHTML = datos.alimentos
        .map(
          a =>
            '<option value="' + a.id + '">' +
            esc(a.nombre) + " (" + a.cantidad + " disponibles)" +
            "</option>"
        )
        .join("");

      if (seleccionado) comboPerdida.value = seleccionado;
    }

    /* CONTABILIDAD / VENTAS */
    setHTML(
      "tablaContabilidad",
      datos.contabilidad.length
        ? datos.contabilidad
            .slice()
            .reverse()
            .map(
              x =>
                "<tr>" +
                "<td>" + fechaBonita(x.fecha) + "</td>" +
                '<td><span class="estado-demo ' +
                (x.tipo === "Venta" ? "ok" : "warn") + '">' +
                esc(x.tipo) + "</span></td>" +
                "<td>" + esc(x.descripcion) + "</td>" +
                "<td><strong>" + formatoMoneda(x.valor) + "</strong></td>" +
                "</tr>"
            )
            .join("")
        : '<tr><td colspan="4">No hay operaciones registradas.</td></tr>'
    );

    /* SEDES */
    setHTML(
      "tablaSedes",
      datos.sedes
        .map(
          s =>
            "<tr>" +
            "<td><strong>" + esc(s.nombre) + "</strong></td>" +
            '<td><span class="estado-demo ok">' + esc(s.estado) + "</span></td>" +
            "<td>" + esc(s.actualizacion) + "</td>" +
            "</tr>"
        )
        .join("")
    );

    /* ALERTAS */
    const alertas = [];

    datos.alimentos.forEach(a => {
      const estado =
        estadoAlimento(a)[0];

      if (
        estado !==
        "Disponible"
      ) {
        alertas.push(
          '<div class="elemento-alerta alerta-' +
          (estado === "Crítico" ? "peligro" : "advertencia") + '">' +
          '<div class="icono-alerta">!</div>' +
          "<div>" +
          "<strong>" + esc(a.nombre) + "</strong>" +
          "<p>" + estado + ": " + a.cantidad + " unidades disponibles.</p>" +
          "<small>Actualizado ahora</small>" +
          "</div></div>"
        );
      }
    });

    if (!alertas.length) {
      alertas.push(
        '<div class="elemento-alerta alerta-exito">' +
        '<div class="icono-alerta">✓</div>' +
        "<div>" +
        "<strong>Sin alertas críticas</strong>" +
        "<p>El inventario se encuentra dentro de los niveles configurados.</p>" +
        "<small>Actualizado ahora</small>" +
        "</div></div>"
      );
    }

    setHTML(
      "dashboardAlertas",
      alertas.join("")
    );

    setText(
      "contadorAlertas",
      alertas.length
    );

    /* DASHBOARD INVENTARIO */
    setHTML(
      "dashboardInventario",
      datos.alimentos
        .slice(0, 5)
        .map(a => {
          const porcentaje = Math.min(100, Math.max(5, a.cantidad));
          const est = estadoAlimento(a);
          const clase = est[1];

          return (
            '<div class="fila-inventario">' +
            '<div class="producto">' +
            '<div class="icono-producto">▤</div>' +
            "<div><strong>" + esc(a.nombre) + "</strong><span>" + esc(a.categoria) + "</span></div>" +
            "</div>" +
            '<div class="existencias">' +
            '<div class="texto-existencias">' +
            "<span>" + a.cantidad + " unidades</span>" +
            "<strong>" + porcentaje + "%</strong>" +
            "</div>" +
            '<div class="progreso ' +
            (clase === "warn" ? "advertencia" : clase === "bad" ? "peligro" : "") + '">' +
            '<span style="width:' + porcentaje + '%"></span>' +
            "</div></div>" +
            '<span class="estado ' +
            (clase === "ok" ? "exito" : clase === "warn" ? "advertencia" : "peligro") + '">' +
            est[0] + "</span>" +
            "</div>"
          );
        })
        .join("")
    );

    /* GRÁFICA */
    const alturas = [45, 68, 54, 82, 61, 90, 72];

    const dias = [
      "Lun",
      "Mar",
      "Mié",
      "Jue",
      "Vie",
      "Sáb",
      "Dom"
    ];

    setHTML(
      "graficaBarras",
      alturas
        .map(
          (h, i) =>
            '<div class="contenedor-barra">' +
            '<div class="barra" style="height:' + h + '%"></div>' +
            "<small>" + dias[i] + "</small>" +
            "</div>"
        )
        .join("")
    );

    /* ÚLTIMA SINCRONIZACIÓN */
    const primera = datos.sedes[0];

    setText(
      "ultimaSync",
      primera &&
      primera.actualizacion !==
      "Pendiente"
        ? primera.actualizacion
        : "Sin sincronizar"
    );

    /* MESAS */
    actualizarProductosOrden();
    actualizarVisualMesas();
  }

  /* 
     REPORTES
   */

  function generarReporte() {
    const tipo = document.getElementById("tipoReporte").value;
    const fecha = document.getElementById("fechaReporte").value || hoyISO();

    let texto = "";

    if (
      tipo ===
      "Reporte diario"
    ) {
      texto =
        "Fecha: " +
        fechaBonita(fecha) +

        "\nProductos registrados: " +
        datos.alimentos.length +

        "\nUnidades disponibles: " +
        datos.alimentos.reduce((s, a) => s + a.cantidad, 0) +
        "\nPérdidas registradas: " + datos.perdidas.length +
        "\nOperaciones contables: " + datos.contabilidad.length;
    } else if (tipo === "Inventario general") {
      texto =
        datos.alimentos
          .map(a => a.nombre + " | " + a.categoria + " | " + a.cantidad + " unidades")
          .join("\n") || "No hay alimentos registrados.";
    } else if (tipo === "Pérdida de alimentos") {
      texto = datos.perdidas.length
        ? datos.perdidas
            .map(
              p =>
                fechaBonita(p.fecha) + " | " + p.alimento + " | " +
                p.cantidad + " unidades | " + p.motivo
            )
            .join("\n")
        : "No hay pérdidas registradas.";
    } else if (tipo === "Consumo") {
      texto =
        "Consumo estimado a partir de las salidas registradas.\n\n" +
        (datos.perdidas.length
          ? datos.perdidas
              .map(
                p =>
                  p.alimento + ": " + p.cantidad +
                  " unidades registradas como salida/pérdida"
              )
              .join("\n")
          : "No hay registros de consumo/salidas disponibles.");
    } else {
      texto =
        datos.contabilidad
          .map(
            x =>
              fechaBonita(x.fecha) + " | " + x.tipo + " | " +
              x.descripcion + " | " + formatoMoneda(x.valor)
          )
          .join("\n") || "No hay operaciones contables registradas.";
    }

    setHTML(
      "resultadoReporte",
      "<h4>" + esc(tipo) + "</h4><p>" + esc(texto).replace(/\n/g, "<br>") + "</p>"
    );
  }

  window.generarReporte =
    generarReporte;

  /*
     INICIALIZACIÓN
 */

  document.addEventListener("DOMContentLoaded", () => {
    inicializarMesas();
  });

  /* RESTAURAR SESIÓN */

  GET("/api/sesion")
    .then(r => {
      if (r.usuario) {
        return iniciarSesion(
          r.usuario
        );
      }
    })
    .catch(err => console.error(err));

})();