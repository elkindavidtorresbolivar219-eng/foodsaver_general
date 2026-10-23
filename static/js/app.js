(() => {
  "use strict";

  /* 
     COMUNICACIÓN CON EL SERVIDOR
   */

  async function api(url, opciones) {
    const resp = await fetch(
      url,
      Object.assign(
        { credentials: "same-origin" },
        opciones
      )
    );

    let cuerpo = {};

    try {
      cuerpo = await resp.json();
    } catch (e) {
      // La respuesta del servidor no contiene JSON.
    }

    if (!resp.ok) {
      if (resp.status === 401 && url !== "/api/login") {
        mostrarLogin();
      }

      throw new Error(
        cuerpo.error || "No se pudo comunicar con el servidor."
      );
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

  const hoyISO = () => {
    const fecha = new Date();
    const anio = fecha.getFullYear();
    const mes = String(fecha.getMonth() + 1).padStart(2, "0");
    const dia = String(fecha.getDate()).padStart(2, "0");

    return `${anio}-${mes}-${dia}`;
  };

  function esc(texto) {
    const mapa = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };

    return String(texto == null ? "" : texto)
      .replace(/[&<>"']/g, c => mapa[c]);
  }

  function setHTML(id, html) {
    const el = document.getElementById(id);

    if (el) {
      el.innerHTML = html;
    }
  }

  function setText(id, texto) {
    const el = document.getElementById(id);

    if (el) {
      el.textContent = texto;
    }
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
    }).format(Number(valor) || 0);
  }

  function iniciales(nombre) {
    return String(nombre || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(x => x[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }

  function fechaBonita(fecha) {
    if (!fecha) return "-";

    const [y, m, d] = String(fecha).split("-");

    if (!y || !m || !d) {
      return fecha;
    }

    return `${d}/${m}/${y}`;
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
    return cargarDatos().catch(err => {
      console.error("Error al cargar los datos:", err);
    });
  }

  /* 
     VISTAS Y SESIÓN
   */

  function mostrarVista(nombre) {
    if (!sesion) return;

    document.querySelectorAll(".vista").forEach(v => {
      v.classList.remove("activa");
    });

    const vista = document.getElementById("vista-" + nombre);

    if (vista) {
      vista.classList.add("activa");
    }

    document.querySelectorAll(".elemento-menu").forEach(a => {
      a.classList.toggle(
        "activo",
        a.dataset.vista === nombre
      );
    });

    const titulos = {

      dashboard: [
        "Inicio / Dashboard",
        "Panel principal"
      ],
      usuarios: [
        "Inicio / Usuarios",
        "Gestión de usuarios"
      ],
      alimentos: [
        "Inicio / Alimentos",
        "Administración de alimentos"
      ],
      inventario: [
        "Inicio / Inventario",
        "Inventario en tiempo real"
      ],
      sincronizacion: [
        "Inicio / Sincronización",
        "Sincronización de inventario"
      ],
      ventas: [
        "Inicio / Ventas",
        "Gestión de mesas y ventas"
      ],
      reportes: [
        "Inicio / Reportes",
        "Generación de reportes"
      ],
      configuracion: [
        "Inicio / Configuración",
        "Configuración"
      ],
      ayuda: [
        "Inicio / Ayuda",
        "Ayuda"
      ],

   inversiones: [
  "Inicio / Inversiones",
  "Control de inversiones"
],


      dashboard: ["Inicio / Dashboard", "Panel principal"],
      usuarios: ["Inicio / Usuarios", "Gestión de usuarios"],
      proveedores: ["Inicio / Proveedores", "Gestión de proveedores"],
      alimentos: ["Inicio / Alimentos", "Administración de alimentos"],
      inventario: ["Inicio / Inventario", "Inventario en tiempo real"],
      sincronizacion: ["Inicio / Sincronización", "Sincronización de inventario"],
      ventas: ["Inicio / Ventas", "Gestión de mesas y ventas"],
      saldos: ["Inicio / Saldos", "Gestión de saldos y cuentas"],
      reportes: ["Inicio / Reportes", "Generación de reportes"],
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

    document.getElementById("pantallaLogin")?.classList.add("oculto");
    document.getElementById("aplicacion")?.classList.remove("oculto");

    setText("nombreSidebar", sesion.nombre);
    setText("rolSidebar", sesion.rol);
    setText("nombreTop", sesion.nombre);
    setText("avatarSidebar", iniciales(sesion.nombre));
    setText("avatarTop", iniciales(sesion.nombre));

    aplicarPermisos();

    await recargar();
  }

  function aplicarPermisos() {
    const enlaceUsuarios = document.querySelector(
      '[data-vista="usuarios"]'
    );

    if (enlaceUsuarios) {
      enlaceUsuarios.style.display =
        sesion && sesion.rol === "Administrador"
          ? "flex"
          : "none";
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

    document.getElementById("aplicacion")?.classList.add("oculto");
    document.getElementById("pantallaLogin")?.classList.remove("oculto");
    document.getElementById("formLogin")?.reset();
    document.getElementById("formRestablecer")?.classList.add("oculto");
  }

  async function cerrarSesion() {
    try {
      await POST("/api/logout");
    } catch (e) {
      console.error("No se pudo cerrar la sesión en el servidor:", e);
    }

    mostrarLogin();
  }

  window.cerrarSesion = cerrarSesion;

  document.querySelectorAll(".elemento-menu").forEach(enlace => {
    enlace.addEventListener("click", e => {
      e.preventDefault();
      mostrarVista(enlace.dataset.vista);
    });
  });

  /* 
     LOGIN
   */

  document.getElementById("formLogin")?.addEventListener(
    "submit",
    async e => {
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
    }
  );

  document.getElementById("btnRestablecer")?.addEventListener(
    "click",
    () => {
      document
        .getElementById("formRestablecer")
        ?.classList.toggle("oculto");
    }
  );

  document.getElementById("formRestablecer")?.addEventListener(
    "submit",
    async e => {
      e.preventDefault();

      const formulario = e.target;

      try {
        await POST("/api/restablecer", {
          usuario: document.getElementById("recUsuario").value.trim(),
          clave: document.getElementById("recNuevaClave").value
        });

        mensaje(
          "mensajeReset",
          "Contraseña restablecida correctamente.",
          "ok"
        );

        formulario.reset();
      } catch (err) {
        mensaje("mensajeReset", err.message, "error");
      }
    }
  );

  document.getElementById("btnPerfil")?.addEventListener(
    "click",
    () => mostrarVista("configuracion")
  );

  /* 
     USUARIOS
 */

  document.getElementById("formUsuario")?.addEventListener(
    "submit",
    async e => {
      e.preventDefault();

      try {
        const id = Number(
          document.getElementById("usuarioId").value
        ) || null;

        const nombre = document.getElementById("usuarioNombre").value.trim();
        const apellido = document.getElementById("usuarioApellido").value.trim();
        const usuario = document.getElementById("usuarioLogin").value.trim();
        const clave = document.getElementById("usuarioClave").value;
        const rol = document.getElementById("usuarioRol").value;

        if (!nombre || !apellido || !usuario || !rol) {
          mensaje(
            "mensajeUsuario",
            "Completa todos los campos obligatorios.",
            "error"
          );
          return;
        }

        if (!id && clave.length < 4) {
          mensaje(
            "mensajeUsuario",
            "La contraseña debe tener mínimo 4 caracteres.",
            "error"
          );
          return;
        }

        const r = await POST("/api/usuarios", {
          id,
          nombre,
          apellido,
          usuario,
          login: usuario,
          clave,
          rol
        });

        mensaje(
          "mensajeUsuario",
          r.mensaje || "Usuario guardado correctamente.",
          "ok"
        );

        limpiarUsuario();
        await recargar();
      } catch (err) {
        mensaje("mensajeUsuario", err.message, "error");
      }
    }
  );

  function limpiarUsuario() {
    document.getElementById("formUsuario")?.reset();

    const id = document.getElementById("usuarioId");

    if (id) {
      id.value = "";
    }

    const clave = document.getElementById("usuarioClave");

    if (clave) {
      clave.required = true;
    }
  }

  window.limpiarUsuario = limpiarUsuario;

  function editarUsuario(id) {
    const u = datos.usuarios.find(
      usuario => Number(usuario.id) === Number(id)
    );

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
    if (!confirm("¿Deseas eliminar este usuario?")) {
      return;
    }

    try {
      await POST("/api/usuarios/" + id + "/eliminar");

      mensaje(
        "mensajeUsuario",
        "Usuario eliminado correctamente.",
        "ok"
      );

      await recargar();
    } catch (err) {
      mensaje("mensajeUsuario", err.message, "error");
    }
  }

  window.eliminarUsuario = eliminarUsuario;

  function generarInformeUsuarios() {
    const lista = datos.usuarios;

    const porRol = lista.reduce((acc, u) => {
      acc[u.rol] = (acc[u.rol] || 0) + 1;
      return acc;
    }, {});

    setHTML(
      "informeUsuarios",
      "<p><strong>Total de usuarios:</strong> " + lista.length + "</p>" +
      (Object.keys(porRol).length
        ? "<ul>" + Object.entries(porRol).map(([rol, n]) =>
            "<li>" + esc(rol) + ": " + n + "</li>"
          ).join("") + "</ul>"
        : "<p>No hay usuarios registrados.</p>")
    );
  }

  window.generarInformeUsuarios = generarInformeUsuarios;

  /* PROVEEDORES de joselin*/

  document.getElementById("formProveedor")?.addEventListener(
    "submit",
    async e => {
      e.preventDefault();

      try {
        const r = await POST("/api/proveedores", {
          id: Number(document.getElementById("proveedorId").value) || null,
          nombre: document.getElementById("proveedorNombre").value.trim(),
          telefono: document.getElementById("proveedorTelefono").value.trim()
        });

        mensaje(
          "mensajeProveedor",
          r.mensaje || "Proveedor guardado correctamente.",
          "ok"
        );

        limpiarProveedor();
        await recargar();
      } catch (err) {
        mensaje("mensajeProveedor", err.message, "error");
      }
    }
  );

  function limpiarProveedor() {
    document.getElementById("formProveedor")?.reset();

    const id = document.getElementById("proveedorId");

    if (id) {
      id.value = "";
    }
  }

  window.limpiarProveedor = limpiarProveedor;

  function editarProveedor(id) {
    const p = datos.proveedores.find(
      x => Number(x.id) === Number(id)
    );

    if (!p) {
      mensaje("mensajeProveedor", "No se encontró el proveedor.", "error");
      return;
    }

    document.getElementById("proveedorId").value = p.id ?? "";
    document.getElementById("proveedorNombre").value = p.nombre ?? "";
    document.getElementById("proveedorTelefono").value = p.telefono ?? "";

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  window.editarProveedor = editarProveedor;

  async function eliminarProveedor(id) {
    if (!confirm("¿Deseas eliminar este proveedor?")) {
      return;
    }

    try {
      await POST("/api/proveedores/" + id + "/eliminar");

      mensaje(
        "mensajeProveedor",
        "Proveedor eliminado correctamente.",
        "ok"
      );

      await recargar();
    } catch (err) {
      mensaje("mensajeProveedor", err.message, "error");
    }
  }

  window.eliminarProveedor = eliminarProveedor;

  function generarInformeProveedores() {
    const lista = datos.proveedores;

    setHTML(
      "informeProveedores",
      "<p><strong>Total de proveedores:</strong> " + lista.length + "</p>" +
      (lista.length
        ? "<ul>" + lista.map(p =>
            "<li>" + esc(p.nombre) +" (" + esc(p.telefono) + ")</li>"
          ).join("") + "</ul>"
        : "<p>No hay proveedores registrados.</p>")
    );
  }

  window.generarInformeProveedores = generarInformeProveedores;

   
  document.getElementById("formAlimento")?.addEventListener(
    "submit",
    async e => {
      e.preventDefault();

      try {
        const r = await POST("/api/alimentos", {
          id: Number(document.getElementById("alimentoId").value) || null,
          nombre: document.getElementById("alimentoNombre").value.trim(),
          categoria: document.getElementById("alimentoCategoria").value,
          cantidad: Number(document.getElementById("alimentoCantidad").value),
          precio: Number(document.getElementById("alimentoPrecio").value),
          vencimiento: document.getElementById("alimentoVencimiento").value,
          sede: document.getElementById("alimentoSede").value
        });

        mensaje(
          "mensajeAlimento",
          r.mensaje || "Alimento guardado correctamente.",
          "ok"
        );

        limpiarAlimento();
        await recargar();
      } catch (err) {
        mensaje("mensajeAlimento", err.message, "error");
      }
    }
  );

  function limpiarAlimento() {
    document.getElementById("formAlimento")?.reset();

    const id = document.getElementById("alimentoId");

    if (id) {
      id.value = "";
    }
  }

  window.limpiarAlimento = limpiarAlimento;

  function editarAlimento(id) {
    const a = datos.alimentos.find(
      x => Number(x.id) === Number(id)
    );

    if (!a) {
      mensaje("mensajeAlimento", "No se encontró el alimento.", "error");
      return;
    }

    document.getElementById("alimentoId").value = a.id ?? "";
    document.getElementById("alimentoNombre").value = a.nombre ?? "";
    document.getElementById("alimentoCategoria").value = a.categoria ?? "";
    document.getElementById("alimentoCantidad").value = a.cantidad ?? "";
    document.getElementById("alimentoPrecio").value = a.precio ?? "";
    document.getElementById("alimentoVencimiento").value = a.vencimiento ?? "";
    document.getElementById("alimentoSede").value = a.sede ?? "";

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  window.editarAlimento = editarAlimento;

  async function eliminarAlimento(id) {
    if (!confirm("¿Deseas eliminar este alimento?")) {
      return;
    }

    try {
      await POST("/api/alimentos/" + id + "/eliminar");

      mensaje(
        "mensajeAlimento",
        "Alimento eliminado correctamente.",
        "ok"
      );

      await recargar();
    } catch (err) {
      mensaje("mensajeAlimento", err.message, "error");
    }
  }

  window.eliminarAlimento = eliminarAlimento;

  /* 
     PÉRDIDAS
   */

  document.getElementById("formPerdida")?.addEventListener(
    "submit",
    async e => {
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

        mensaje(
          "mensajePerdida",
          r.mensaje || "Pérdida registrada correctamente.",
          "ok"
        );

        await recargar();
      } catch (err) {
        mensaje("mensajePerdida", err.message, "error");
      }
    }
  );

  /* 
     INVERSIONES (formulario)
   */

  document.getElementById("formInversion")?.addEventListener(
    "submit",
    async e => {
      e.preventDefault();

      const formulario = e.target;
      const valor = Number(document.getElementById("inversionValor").value);
      const descripcion = document
        .getElementById("inversionDescripcion")
        .value.trim();

      if (!valor || valor <= 0) {
        mensaje("mensajeInversion", "Ingresa un valor mayor a 0.", "error");
        return;
      }

      try {
        await POST("/api/contabilidad", {
          tipo: "Inversión en insumos",
          descripcion: descripcion || "Inversión en insumos",
          valor
        });

        formulario.reset();
        mensaje("mensajeInversion", "Inversión registrada correctamente.", "ok");
        await recargar();
      } catch (err) {
        mensaje("mensajeInversion", err.message, "error");
      }
    }
  );

  /* 
     MESAS
 */

  function inicializarMesas() {
    document.querySelectorAll(".mesa-card").forEach(mesa => {
      mesa.addEventListener("click", () => {
        const numero = Number(mesa.dataset.mesa);
        seleccionarMesa(numero);
      });
    });

    document.getElementById("btnAgregarProducto")?.addEventListener(
      "click",
      agregarProductoOrden
    );

    document.getElementById("btnRegistrarVenta")?.addEventListener(
      "click",
      registrarVenta
    );

    document.getElementById("btnLiberarMesa")?.addEventListener(
      "click",
      liberarMesa
    );

    actualizarProductosOrden();
    actualizarVisualMesas();
    renderizarOrden();
  }

  function seleccionarMesa(numero) {
    if (!mesas[numero]) return;

    mesaSeleccionada = numero;

    const mesa = mesas[numero];

    setText("mesaSeleccionada", "Mesa " + numero);

    setText(
      "estadoOrden",
      mesa.estado === "ocupada"
        ? "Orden activa"
        : "Mesa disponible"
    );

    renderizarOrden();
    actualizarVisualMesas();
  }

  function actualizarVisualMesas() {
    document.querySelectorAll(".mesa-card").forEach(card => {
      const numero = Number(card.dataset.mesa);
      const mesa = mesas[numero];

      if (!mesa) return;

      card.classList.remove("disponible", "ocupada", "seleccionada");
      card.classList.add(mesa.estado);

      if (numero === mesaSeleccionada) {
        card.classList.add("seleccionada");
      }

      const estado = card.querySelector(".mesa-estado");

      if (estado) {
        estado.textContent =
          mesa.estado === "ocupada" ? "Ocupada" : "Disponible";
      }
    });
  }

  /* 
     PRODUCTOS PARA LAS ÓRDENES
 */

  function actualizarProductosOrden() {
    const select = document.getElementById("productoOrden");

    if (!select) return;

    const seleccionado = select.value;

    select.innerHTML =
      '<option value="">Seleccionar producto</option>' +
      datos.alimentos.map(a => {
        const precio = obtenerPrecioProducto(a);

        return (
          '<option value="' + esc(a.id) + '">' +
          esc(a.nombre) + " — " + formatoMoneda(precio) +
          "</option>"
        );
      }).join("");

    if (seleccionado) {
      select.value = seleccionado;
    }
  }

  function obtenerPrecioProducto(producto) {
    return Number(
      producto.precio ??
      producto.precio_venta ??
      producto.valor ??
      0
    );
  }

  /* 
     AGREGAR PRODUCTOS A UNA ORDEN
 */

  function agregarProductoOrden() {
    if (!mesaSeleccionada) {
      alert("Primero selecciona una mesa.");
      return;
    }

    const productoId = Number(
      document.getElementById("productoOrden").value
    );

    const cantidad = Number(
      document.getElementById("cantidadOrden").value
    );

    if (!productoId) {
      alert("Selecciona un producto.");
      return;
    }

    if (!cantidad || cantidad < 1) {
      alert("La cantidad debe ser mayor a 0.");
      return;
    }

    const producto = datos.alimentos.find(
      a => Number(a.id) === productoId
    );

    if (!producto) {
      alert("No se encontró el producto.");
      return;
    }

    const precio = obtenerPrecioProducto(producto);
    const orden = mesas[mesaSeleccionada];

    const existente = orden.productos.find(
      p => Number(p.id) === productoId
    );

    if (existente) {
      existente.cantidad += cantidad;
    } else {
      orden.productos.push({
        id: producto.id,
        nombre: producto.nombre,
        cantidad,
        precio
      });
    }

    orden.estado = "ocupada";

    document.getElementById("cantidadOrden").value = 1;
    document.getElementById("productoOrden").value = "";

    renderizarOrden();
    actualizarVisualMesas();
  }

  /* 
     RENDERIZAR ORDEN
   */

  function renderizarOrden() {
    const lista = document.getElementById("listaOrden");

    if (!lista) return;

    if (!mesaSeleccionada) {
      lista.innerHTML = `
        <div class="orden-vacia">
          <span></span>
          <p>Selecciona una mesa para comenzar.</p>
        </div>
      `;

      setText("totalOrden", formatoMoneda(0));
      return;
    }

    const orden = mesas[mesaSeleccionada];

    if (!orden || !orden.productos.length) {
      lista.innerHTML = `
        <div class="orden-vacia">
          <span></span>
          <p>No hay productos en esta orden.</p>
        </div>
      `;

      setText("totalOrden", formatoMoneda(0));
      return;
    }

    lista.innerHTML = orden.productos.map(
      (producto, indice) => {
        const subtotal = producto.precio * producto.cantidad;

        return `
          <div class="orden-producto">
            <span><strong>${esc(producto.nombre)}</strong></span>
            <span>${producto.cantidad}</span>
            <span>${formatoMoneda(producto.precio)}</span>
            <strong>${formatoMoneda(subtotal)}</strong>
            <button
              type="button"
              class="btn-eliminar-producto"
              onclick="eliminarProductoOrden(${indice})"
            >×</button>
          </div>
        `;
      }
    ).join("");

    setText("totalOrden", formatoMoneda(calcularTotalOrden()));
  }

  function calcularTotalOrden() {
    if (!mesaSeleccionada) {
      return 0;
    }

    return mesas[mesaSeleccionada].productos.reduce(
      (total, producto) =>
        total + producto.precio * producto.cantidad,
      0
    );
  }

  function eliminarProductoOrden(indice) {
    if (!mesaSeleccionada) return;

    const orden = mesas[mesaSeleccionada];

    orden.productos.splice(indice, 1);

    if (orden.productos.length === 0) {
      orden.estado = "disponible";
    }

    renderizarOrden();
    actualizarVisualMesas();
  }

  window.eliminarProductoOrden = eliminarProductoOrden;

  /* 
     REGISTRAR VENTA
   */

  async function registrarVenta() {
    if (!mesaSeleccionada) {
      alert("Selecciona una mesa.");
      return;
    }

    const orden = mesas[mesaSeleccionada];

    if (!orden || !orden.productos.length) {
      alert("La mesa no tiene productos.");
      return;
    }

    const total = calcularTotalOrden();

    if (total <= 0) {
      alert("El total de la orden debe ser mayor a $0.");
      return;
    }

    const numeroMesa = mesaSeleccionada;

    const descripcion =
      "Venta Mesa " +
      numeroMesa +
      ": " +
      orden.productos.map(
        p => p.cantidad + "x " + p.nombre
      ).join(", ");

    try {
      const respuesta = await POST("/api/contabilidad", {
        tipo: "Venta",
        descripcion,
        valor: total
      });

      mensaje(
        "mensajeContable",
        respuesta.mensaje || "Venta registrada correctamente.",
        "ok"
      );

      mesas[numeroMesa] = {
        estado: "disponible",
        productos: []
      };

      mesaSeleccionada = null;

      setText("mesaSeleccionada", "Selecciona una mesa para comenzar");
      setText("estadoOrden", "Sin orden");

      renderizarOrden();
      actualizarVisualMesas();

      await recargar();
    } catch (err) {
      console.error(err);

      alert(
        "No se pudo registrar la venta:\n" +
        err.message
      );
    }
  }

  /* 
     LIBERAR MESA
  */

  function liberarMesa() {
    if (!mesaSeleccionada) {
      alert("Selecciona una mesa.");
      return;
    }

    const numero = mesaSeleccionada;

    const confirmar = confirm(
      "¿Seguro que deseas liberar la Mesa " +
      numero +
      "?\n\nLa orden actual se eliminará."
    );

    if (!confirmar) return;

    mesas[numero] = {
      estado: "disponible",
      productos: []
    };

    seleccionarMesa(numero);
  }

  /* 
     SINCRONIZACIÓN
   */

  async function sincronizar() {
    setText("estadoSync", "Sincronizando información...");

    const punto = document.getElementById("puntoSync");

    if (punto) {
      punto.style.background = "var(--warning)";
    }

    try {
      const r = await POST("/api/sincronizar");

      await cargarDatos();

      setText("estadoSync", "Información sincronizada");

      if (punto) {
        punto.style.background = "var(--success)";
      }

      mensaje(
        "mensajeSync",
        r.mensaje || "Sincronización completada.",
        "ok"
      );
    } catch (err) {
      setText("estadoSync", "Error de sincronización");

      mensaje("mensajeSync", err.message, "error");

      if (punto) {
        punto.style.background = "var(--danger)";
      }
    }
  }

  window.sincronizar = sincronizar;

  /* 
     ESTADOS DE LOS ALIMENTOS
  */

  function diasParaVencer(a) {
    if (!a.vencimiento) {
      return Infinity;
    }

    const vencimiento = new Date(a.vencimiento + "T23:59:59");

    if (Number.isNaN(vencimiento.getTime())) {
      return Infinity;
    }

    return Math.ceil(
      (vencimiento.getTime() - Date.now()) / 86400000
    );
  }

  function estadoAlimento(a) {
    const cantidad = Number(a.cantidad) || 0;
    const dias = diasParaVencer(a);

    if (cantidad <= 15) {
      return ["Crítico", "bad"];
    }

    if (dias <= 3) {
      return ["Por vencer", "bad"];
    }

    if (cantidad <= 30) {
      return ["Stock bajo", "warn"];
    }

    return ["Disponible", "ok"];
  }

  /* 
     RENDERIZADO GENERAL
   */

  function renderizarTodo() {
    if (!sesion) return;

    const totalUnidades = datos.alimentos.reduce(
      (s, a) => s + (Number(a.cantidad) || 0),
      0
    );

    const criticos = datos.alimentos.filter(
      a => estadoAlimento(a)[1] === "bad"
    ).length;

    const porVencer = datos.alimentos.filter(
      a => diasParaVencer(a) <= 3
    ).length;

    const ventas = datos.contabilidad
      .filter(x => x.tipo === "Venta")
      .reduce((s, x) => s + (Number(x.valor) || 0), 0);

    const gastos = datos.contabilidad
      .filter(x => x.tipo === "Gasto operativo")
      .reduce((s, x) => s + (Number(x.valor) || 0), 0);

    /* ESTADÍSTICAS */

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

/* INVERSIONES */

const insumos = datos.contabilidad
  .filter(x => /insumo|inversi/i.test(x.tipo))
  .reduce((s, x) => s + (Number(x.valor) || 0), 0);

const aRecuperar = insumos + gastos;
const resultado = ventas - aRecuperar;
const ganancia = Math.max(0, resultado);
const recuperado = Math.min(ventas, aRecuperar);
const porRecuperar = Math.max(0, aRecuperar - ventas);
const rentabilidad = insumos > 0 ? (ganancia / insumos) * 100 : 0;
const progreso = aRecuperar > 0
  ? Math.min(100, (ventas / aRecuperar) * 100)
  : 0;

setText("dashboardInversion", formatoMoneda(insumos));
setText("dashboardIngresos", formatoMoneda(ventas));
setText("dashboardGanancia", formatoMoneda(ganancia));
setText("dashboardRentabilidad", rentabilidad.toFixed(1) + "%");
setText("dashboardCostoInsumos", formatoMoneda(insumos));
setText("dashboardGastos", formatoMoneda(gastos));
setText("dashboardBalance", formatoMoneda(resultado));

setText("invPorRecuperar", formatoMoneda(porRecuperar));
setText("invRecuperado", formatoMoneda(recuperado));
setText(
  "invEstadoTexto",
  insumos === 0
    ? "Sin inversión"
    : porRecuperar > 0
      ? "Recuperando"
      : "En ganancias"
);

const barra = document.getElementById("invBarra");
if (barra) barra.style.width = progreso + "%";

    /* USUARIOS */

    setHTML(
      "tablaUsuarios",
      datos.usuarios.map(u =>
        "<tr>" +
          "<td><strong>" + esc(u.nombre) + "</strong></td>" +
          "<td>" + esc(u.apellido) + "</td>" +
          "<td>" + esc(u.login || u.usuario) + "</td>" +
          "<td>" + esc(u.rol) + "</td>" +
          '<td><div class="acciones-tabla">' +
            '<button onclick="editarUsuario(' + Number(u.id) + ')">Editar</button>' +
            '<button class="eliminar" onclick="eliminarUsuario(' + Number(u.id) + ')">Eliminar</button>' +
          "</div></td>" +
        "</tr>"
      ).join("")
    );

    /* PROVEEDORES */

    setHTML(
      "tablaProveedores",
      datos.proveedores.length
        ? datos.proveedores.map(p =>
            "<tr>" +
              "<td><strong>" + esc(p.nombre) + "</strong></td>" +
              "<td>" + esc(p.telefono) + "</td>" +
              '<td><div class="acciones-tabla">' +
                '<button onclick="editarProveedor(' + Number(p.id) + ')">Editar</button>' +
                '<button class="eliminar" onclick="eliminarProveedor(' + Number(p.id) + ')">Eliminar</button>' +
              "</div></td>" +
            "</tr>"
          ).join("")
        : '<tr><td colspan="4">No hay proveedores registrados.</td></tr>'
    );

    /* ALIMENTOS */

    setHTML(
      "tablaAlimentos",
      datos.alimentos.map(a =>
        "<tr>" +
          "<td><strong>" + esc(a.nombre) + "</strong></td>" +
          "<td>" + esc(a.categoria) + "</td>" +
          "<td>" + (Number(a.cantidad) || 0) + "</td>" +
          "<td>" + formatoMoneda(a.precio) + "</td>" +
          "<td>" + fechaBonita(a.vencimiento) + "</td>" +
          "<td>" + esc(a.sede) + "</td>" +
          '<td><div class="acciones-tabla">' +
            '<button onclick="editarAlimento(' + Number(a.id) + ')">Editar</button>' +
            '<button class="eliminar" onclick="eliminarAlimento(' + Number(a.id) + ')">Eliminar</button>' +
          "</div></td>" +
        "</tr>"
      ).join("")
    );

    /* INVENTARIO */

    setHTML(
      "tablaInventario",
      datos.alimentos.map(a => {
        const est = estadoAlimento(a);

        return (
          "<tr>" +
            "<td><strong>" + esc(a.nombre) + "</strong></td>" +
            "<td>" + esc(a.categoria) + "</td>" +
            "<td>" + (Number(a.cantidad) || 0) + " unidades</td>" +
            "<td>" + fechaBonita(a.vencimiento) + "</td>" +
            "<td>" + esc(a.sede) + "</td>" +
            '<td><span class="estado-demo ' + est[1] + '">' +
              esc(est[0]) +
            "</span></td>" +
          "</tr>"
        );
      }).join("")
    );

    /* COMBO DE PÉRDIDAS */

    const comboPerdida = document.getElementById("perdidaAlimento");

    if (comboPerdida) {
      const seleccionado = comboPerdida.value;

      comboPerdida.innerHTML = datos.alimentos.map(a =>
        '<option value="' + esc(a.id) + '">' +
          esc(a.nombre) +
          " (" + (Number(a.cantidad) || 0) + " disponibles)" +
        "</option>"
      ).join("");

      if (seleccionado) {
        comboPerdida.value = seleccionado;
      }
    }

    /* CONTABILIDAD */

    setHTML(
      "tablaContabilidad",
      datos.contabilidad.slice().reverse().map(x =>
        "<tr>" +
          "<td>" + fechaBonita(x.fecha) + "</td>" +
          '<td><span class="estado-demo ' +
            (x.tipo === "Venta" ? "ok" : "warn") +
          '">' + esc(x.tipo) + "</span></td>" +
          "<td>" + esc(x.descripcion) + "</td>" +
          "<td><strong>" + formatoMoneda(x.valor) + "</strong></td>" +
        "</tr>"
      ).join("")
    );

    /* SEDES */

    setHTML(
      "tablaSedes",
      datos.sedes.map(s =>
        "<tr>" +
          "<td><strong>" + esc(s.nombre) + "</strong></td>" +
          '<td><span class="estado-demo ok">' + esc(s.estado) + "</span></td>" +
          "<td>" + esc(s.actualizacion) + "</td>" +
        "</tr>"
      ).join("")
    );

    /* ALERTAS */

    const alertas = [];

    datos.alimentos.forEach(a => {
      const estado = estadoAlimento(a)[0];

      if (estado !== "Disponible") {
        alertas.push(
          '<div class="elemento-alerta alerta-' +
            (estado === "Crítico" ? "peligro" : "advertencia") +
          '">' +
            '<div class="icono-alerta">!</div>' +
            "<div>" +
              "<strong>" + esc(a.nombre) + "</strong>" +
              "<p>" + esc(estado) + ": " +
                (Number(a.cantidad) || 0) +
                " unidades disponibles.</p>" +
              "<small>Actualizado ahora</small>" +
            "</div>" +
          "</div>"
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
          "</div>" +
        "</div>"
      );
    }

    setHTML("dashboardAlertas", alertas.join(""));
    setText("contadorAlertas", alertas.length);

    /* DASHBOARD DE INVENTARIO */

    setHTML(
      "dashboardInventario",
      datos.alimentos.slice(0, 5).map(a => {
        const cantidad = Number(a.cantidad) || 0;
        const porcentaje = Math.min(100, Math.max(5, cantidad));

        const est = estadoAlimento(a);
        const clase = est[1];

        return (
          '<div class="fila-inventario">' +
            '<div class="producto">' +
              '<div class="icono-producto">▤</div>' +
              "<div>" +
                "<strong>" + esc(a.nombre) + "</strong>" +
                "<span>" + esc(a.categoria) + "</span>" +
              "</div>" +
            "</div>" +

            '<div class="existencias">' +
              '<div class="texto-existencias">' +
                "<span>" + cantidad + " unidades</span>" +
                "<strong>" + porcentaje + "%</strong>" +
              "</div>" +

              '<div class="progreso ' +
                (clase === "warn"
                  ? "advertencia"
                  : clase === "bad"
                    ? "peligro"
                    : "") +
              '">' +
                '<span style="width:' + porcentaje + '%"></span>' +
              "</div>" +
            "</div>" +

            '<span class="estado ' +
              (clase === "ok"
                ? "exito"
                : clase === "warn"
                  ? "advertencia"
                  : "peligro") +
            '">' +
              esc(est[0]) +
            "</span>" +
          "</div>"
        );
      }).join("")
    );

    /* GRÁFICA */

    const alturas = [45, 68, 54, 82, 61, 90, 72];
    const dias = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

    setHTML(
      "graficaBarras",
      alturas.map((h, i) =>
        '<div class="contenedor-barra">' +
          '<div class="barra" style="height:' + h + '%"></div>' +
          "<small>" + dias[i] + "</small>" +
        "</div>"
      ).join("")
    );

    /* ÚLTIMA SINCRONIZACIÓN */

    const primera = datos.sedes[0];

    setText(
      "ultimaSync",
      primera && primera.actualizacion !== "Pendiente"
        ? "Última sincronización: " + primera.actualizacion
        : "Aún no se ha ejecutado una sincronización."
    );




    /* MESAS */

    actualizarProductosOrden();
    actualizarVisualMesas();
    renderizarOrden();
  }

  /* 
     REPORTES
   */

  function generarReporte() {
    const tipo = document.getElementById("tipoReporte").value;

    const fecha = document.getElementById("fechaReporte").value || hoyISO();

    let texto = "";

    if (tipo === "Reporte diario") {
      texto =
        "Fecha: " + fechaBonita(fecha) +
        "\nProductos registrados: " + datos.alimentos.length +
        "\nUnidades disponibles: " +
        datos.alimentos.reduce(
          (s, a) => s + (Number(a.cantidad) || 0),
          0
        ) +
        "\nPérdidas registradas: " + datos.perdidas.length +
        "\nOperaciones contables: " + datos.contabilidad.length;
    } else if (tipo === "Inventario general") {
      texto = datos.alimentos.map(a =>
        a.nombre +
        " | " + a.categoria +
        " | " + a.cantidad + " unidades" +
        " | " + a.sede
      ).join("\n") || "No hay alimentos registrados.";
    } else if (tipo === "Pérdida de alimentos") {
      texto = datos.perdidas.length
        ? datos.perdidas.map(p =>
            fechaBonita(p.fecha) +
            " | " + p.alimento +
            " | " + p.cantidad + " unidades" +
            " | " + p.motivo
          ).join("\n")
        : "No hay pérdidas registradas.";
    } else if (tipo === "Consumo") {
      texto =
        "Consumo estimado a partir de las salidas registradas.\n\n" +
        (
          datos.perdidas.length
            ? datos.perdidas.map(p =>
                p.alimento +
                ": " + p.cantidad +
                " unidades registradas como salida/pérdida"
              ).join("\n")
            : "No hay registros de consumo/salidas disponibles."
        );
    } else {
      texto = datos.contabilidad.map(x =>
        fechaBonita(x.fecha) +
        " | " + x.tipo +
        " | " + x.descripcion +
        " | " + formatoMoneda(x.valor)
      ).join("\n") || "No hay operaciones contables registradas.";
    }

    setHTML(
      "resultadoReporte",
      "<h4>" + esc(tipo) + "</h4><p>" +
      esc(texto).replace(/\n/g, "<br>") +
      "</p>"
    );
  }

  window.generarReporte = generarReporte;

  /* 
     INICIALIZACIÓN joselin
  */

  inicializarMesas();
  /* 
     RESTAURAR SESIÓN
  */

  GET("/api/sesion")
    .then(r => {
      if (r.usuario) {
        return iniciarSesion(r.usuario);
      }
    })
    .catch(err => {
      console.error("No se pudo restaurar la sesión:", err);
    });

})();