document.addEventListener("DOMContentLoaded", () => {

  // ---- Abrir la vista Platos desde el menú ----
  const botonMenu = document.querySelector('[data-vista="platos"]');

  if (botonMenu) {
    botonMenu.addEventListener("click", (e) => {
      e.preventDefault();

      document.querySelectorAll(".vista").forEach((v) => v.classList.remove("activa"));
      document.getElementById("vista-platos").classList.add("activa");

      document.querySelectorAll(".elemento-menu").forEach((m) => m.classList.remove("activo"));
      botonMenu.classList.add("activo");

      document.getElementById("migas").textContent = "Inicio / Platos";
      document.getElementById("tituloSuperior").textContent = "Platos";
    });
  }

  // ---- Pedido del cliente ----
  const listaPedido = document.getElementById("pedidoLista");
  const totalPedido = document.getElementById("pedidoTotal");
  const contador = document.getElementById("pedidoContador");
  const btnHacerPedido = document.getElementById("btnHacerPedido");
  const mensaje = document.getElementById("mensajePedido");

  const pedido = [];   // { nombre, precio, sin: [ingredientes quitados], cantidad }
  let temporizadorMensaje = null;

  const dinero = (n) => "$" + Number(n).toLocaleString("es-CO");

  function mostrarMensaje(texto, tipo) {
    clearTimeout(temporizadorMensaje);
    mensaje.textContent = texto;
    mensaje.className = "mensaje visible " + tipo;
    temporizadorMensaje = setTimeout(() => mensaje.classList.remove("visible"), 3500);
  }

  function crearBoton(texto, clase, accion) {
    const b = document.createElement("button");
    b.type = "button";
    if (clase) b.className = clase;
    b.textContent = texto;
    b.addEventListener("click", accion);
    return b;
  }

  function dibujarPedido() {
    listaPedido.innerHTML = "";

    if (!pedido.length) {
      const vacio = document.createElement("p");
      vacio.className = "pedido-vacio";
      vacio.textContent = "Aún no hay productos en el pedido.";
      listaPedido.appendChild(vacio);
    }

    let total = 0;
    let unidades = 0;

    pedido.forEach((item, i) => {
      total += item.precio * item.cantidad;
      unidades += item.cantidad;

      const fila = document.createElement("div");
      fila.className = "pedido-item";

      const info = document.createElement("div");
      const nombre = document.createElement("strong");
      nombre.textContent = item.nombre;
      const detalle = document.createElement("small");
      if (item.sin.length) {
        detalle.className = "sin";
        detalle.textContent = "Sin: " + item.sin.join(", ");
      } else {
        detalle.textContent = "Completa";
      }
      info.append(nombre, detalle);

      const cant = document.createElement("div");
      cant.className = "pedido-cant";
      const num = document.createElement("span");
      num.textContent = item.cantidad;
      cant.append(
        crearBoton("−", "", () => {
          item.cantidad--;
          if (item.cantidad <= 0) pedido.splice(i, 1);
          dibujarPedido();
        }),
        num,
        crearBoton("+", "", () => {
          item.cantidad++;
          dibujarPedido();
        })
      );

      const subtotal = document.createElement("span");
      subtotal.className = "pedido-subtotal";
      subtotal.textContent = dinero(item.precio * item.cantidad);

      const quitar = crearBoton("✕", "pedido-quitar", () => {
        pedido.splice(i, 1);
        dibujarPedido();
      });
      quitar.setAttribute("aria-label", "Quitar del pedido");

      fila.append(info, cant, subtotal, quitar);
      listaPedido.appendChild(fila);
    });

    totalPedido.textContent = dinero(total);
    contador.textContent = unidades + (unidades === 1 ? " producto" : " productos");
  }

  function agregarAlPedido(nombre, precio, sin) {
    const clave = [...sin].sort().join("|");
    const existente = pedido.find(
      (p) => p.nombre === nombre && [...p.sin].sort().join("|") === clave
    );

    if (existente) {
      existente.cantidad++;
    } else {
      pedido.push({ nombre, precio, sin, cantidad: 1 });
    }
    dibujarPedido();
  }

  btnHacerPedido.addEventListener("click", () => {
    if (!pedido.length) {
      mostrarMensaje("Agrega al menos un producto al pedido.", "error");
      return;
    }

    const unidades = pedido.reduce((s, p) => s + p.cantidad, 0);
    const total = pedido.reduce((s, p) => s + p.precio * p.cantidad, 0);

    // Aquí después se enviará el pedido al servidor / base de datos:
    // fetch("/api/pedidos", { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(pedido) })
    console.log("Pedido:", JSON.parse(JSON.stringify(pedido)));

    pedido.length = 0;
    dibujarPedido();
    mostrarMensaje(
      "Pedido realizado: " + unidades + (unidades === 1 ? " producto" : " productos") + " por " + dinero(total) + ".",
      "ok"
    );
  });

  // ---- Cartas de platos ----
  function inicializarCarta(carta) {
    const filas = carta.querySelectorAll(".plato-ingredientes li");

    // Aviso dentro de la carta (para cuando no se puede quitar un ingrediente)
    const aviso = document.createElement("p");
    aviso.className = "plato-aviso";
    carta.querySelector(".plato-agregar").before(aviso);
    let temporizadorAviso = null;

    function avisar(texto) {
      clearTimeout(temporizadorAviso);
      aviso.textContent = texto;
      temporizadorAviso = setTimeout(() => (aviso.textContent = ""), 2800);
    }

    // A cada ingrediente le agregamos su botón Quitar / Agregar
    // (los que tienen data-fijo son la base del plato y no se pueden quitar)
    filas.forEach((li) => {
      const texto = li.textContent.trim();
      li.textContent = "";

      const nombre = document.createElement("span");
      nombre.className = "ing-nombre";
      nombre.textContent = texto;

      if (li.hasAttribute("data-fijo")) {
        const base = document.createElement("span");
        base.className = "ing-base";
        base.textContent = "Base";
        li.append(nombre, base);
        return;
      }

      const boton = document.createElement("button");
      boton.type = "button";
      boton.className = "ing-btn";
      boton.textContent = "Quitar";
      boton.addEventListener("click", (e) => {
        e.stopPropagation();

        // Nunca se puede dejar el plato sin ingredientes
        if (!li.classList.contains("quitado")) {
          const quedan = [...filas].filter((f) => !f.classList.contains("quitado")).length;
          if (quedan <= 1) {
            avisar("El plato debe llevar al menos un ingrediente.");
            return;
          }
        }

        const quitado = li.classList.toggle("quitado");
        boton.textContent = quitado ? "Agregar" : "Quitar";
      });

      li.append(nombre, boton);
    });

    function reiniciarIngredientes() {
      filas.forEach((li) => {
        li.classList.remove("quitado");
        const b = li.querySelector(".ing-btn");
        if (b) b.textContent = "Quitar";
      });
    }

    // Voltear la carta (solo desde el frente; para volver se usa el botón Volver)
    carta.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      carta.classList.add("volteada");
    });

    carta.addEventListener("keydown", (e) => {
      if (e.target !== carta) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        carta.classList.add("volteada");
      }
    });

    carta.querySelector(".plato-volver").addEventListener("click", (e) => {
      e.stopPropagation();
      carta.classList.remove("volteada");
    });

    // Agregar al pedido con los ingredientes que quedaron
    carta.querySelector(".plato-agregar").addEventListener("click", (e) => {
      e.stopPropagation();

      const sin = [];
      filas.forEach((li) => {
        if (li.classList.contains("quitado")) {
          sin.push(li.querySelector(".ing-nombre").textContent);
        }
      });

      const nombre = carta.dataset.nombre;
      agregarAlPedido(nombre, Number(carta.dataset.precio), sin);

      reiniciarIngredientes();
      carta.classList.remove("volteada");
      mostrarMensaje(nombre + " agregado al pedido.", "ok");
    });
  }

  document.querySelectorAll(".plato-carta").forEach(inicializarCarta);

  // ---- Agregar producto (modal) ----
  const modalPlato = document.getElementById("modalNuevoPlato");
  const formPlato = document.getElementById("formNuevoPlato");
  const inpNombre = document.getElementById("nuevoPlatoNombre");
  const inpPrecio = document.getElementById("nuevoPlatoPrecio");
  const inpFoto = document.getElementById("nuevoPlatoFoto");
  const previa = document.getElementById("nuevoPlatoPrevia");
  const selIng = document.getElementById("nuevoPlatoIngrediente");
  const inpCant = document.getElementById("nuevoPlatoCantidad");
  const listaIng = document.getElementById("nuevoPlatoLista");
  const msgPlato = document.getElementById("mensajeNuevoPlato");
  const tituloModal = document.getElementById("tituloNuevoPlato");
  const btnGuardar = formPlato.querySelector('button[type="submit"]');

  let fotoPlato = "";          // imagen en base64 (solo para la vista previa)
  let fotoArchivo = null;      // archivo real que se sube al servidor
  let fotoActual = "";         // foto ya guardada (solo al editar)
  let editandoId = null;       // id del plato que se está editando (null = plato nuevo)
  let cartaEditando = null;    // carta que se reemplaza al guardar la edición
  let ingElegidos = [];        // { nombre, cantidad, fijo }

  function msgModal(texto, tipo) {
    msgPlato.textContent = texto;
    msgPlato.className = "mensaje visible " + tipo;
  }

  // Los ingredientes disponibles salen de la tabla de Inventario
  function cargarInventario() {
    const nombres = [];
    document.querySelectorAll("#tablaInventario tr").forEach((tr) => {
      const td = tr.querySelector("td");
      const t = td ? td.textContent.trim() : "";
      if (t && !nombres.includes(t)) nombres.push(t);
    });

    selIng.innerHTML = "";
    if (!nombres.length) {
      const op = document.createElement("option");
      op.value = "";
      op.textContent = "No hay alimentos en el inventario";
      selIng.appendChild(op);
      return;
    }
    nombres.forEach((n) => {
      const op = document.createElement("option");
      op.value = n;
      op.textContent = n;
      selIng.appendChild(op);
    });
  }

  function dibujarIngredientes() {
    listaIng.innerHTML = "";
    ingElegidos.forEach((ing, i) => {
      const li = document.createElement("li");

      const texto = document.createElement("span");
      texto.className = "ing-texto";
      texto.textContent = ing.cantidad ? ing.cantidad + " de " + ing.nombre : ing.nombre;

      const etiqueta = document.createElement("label");
      const chk = document.createElement("input");
      chk.type = "checkbox";
      chk.checked = ing.fijo;
      chk.addEventListener("change", () => (ing.fijo = chk.checked));
      etiqueta.append(chk, "Base");

      const quitar = crearBoton("✕", "ing-quitar", () => {
        ingElegidos.splice(i, 1);
        dibujarIngredientes();
      });
      quitar.setAttribute("aria-label", "Quitar ingrediente");

      li.append(texto, etiqueta, quitar);
      listaIng.appendChild(li);
    });
  }

  function mostrarPrevia(src) {
    previa.textContent = "";
    if (!src) {
      previa.textContent = "Sin foto seleccionada";
      return;
    }
    const img = document.createElement("img");
    img.src = src;
    img.alt = "Vista previa";
    previa.appendChild(img);
  }

  // Sin argumentos = plato nuevo. Con (plato, carta) = editar ese plato.
  function abrirModalPlato(plato, carta) {
    formPlato.reset();
    fotoPlato = "";
    fotoArchivo = null;
    fotoActual = "";
    ingElegidos = [];
    editandoId = null;
    cartaEditando = null;
    msgPlato.className = "mensaje";
    msgPlato.textContent = "";
    tituloModal.textContent = "Agregar producto";
    btnGuardar.textContent = "Guardar producto";
    cargarInventario();

    if (plato) {
      editandoId = plato.id;
      cartaEditando = carta;
      fotoActual = plato.foto;
      inpNombre.value = plato.nombre;
      inpPrecio.value = plato.precio;
      ingElegidos = plato.ingredientes.map((x) => ({ ...x }));
      tituloModal.textContent = "Editar producto";
      btnGuardar.textContent = "Guardar cambios";
    }

    mostrarPrevia(fotoActual);
    dibujarIngredientes();
    modalPlato.classList.add("abierto");
    modalPlato.setAttribute("aria-hidden", "false");
    inpNombre.focus();
  }

  function cerrarModalPlato() {
    modalPlato.classList.remove("abierto");
    modalPlato.setAttribute("aria-hidden", "true");
  }

  document.getElementById("btnAbrirNuevoPlato").addEventListener("click", () => abrirModalPlato());
  document.getElementById("btnCancelarNuevoPlato").addEventListener("click", cerrarModalPlato);
  modalPlato.addEventListener("click", (e) => {
    if (e.target === modalPlato) cerrarModalPlato();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modalPlato.classList.contains("abierto")) cerrarModalPlato();
  });

  inpFoto.addEventListener("change", () => {
    const archivo = inpFoto.files[0];
    fotoPlato = "";
    fotoArchivo = null;
    mostrarPrevia(fotoActual);
    if (!archivo) return;

    if (!archivo.type.startsWith("image/")) {
      msgModal("El archivo debe ser una imagen.", "error");
      inpFoto.value = "";
      return;
    }

    fotoArchivo = archivo;
    const lector = new FileReader();
    lector.onload = () => {
      fotoPlato = lector.result;
      previa.textContent = "";
      const img = document.createElement("img");
      img.src = fotoPlato;
      img.alt = "Vista previa";
      previa.appendChild(img);
    };
    lector.readAsDataURL(archivo);
  });

  document.getElementById("btnAgregarIngrediente").addEventListener("click", () => {
    const nombre = selIng.value;
    if (!nombre) {
      msgModal("No hay ingredientes disponibles en el inventario.", "error");
      return;
    }
    if (ingElegidos.some((x) => x.nombre === nombre)) {
      msgModal("Ese ingrediente ya está en la lista.", "error");
      return;
    }
    ingElegidos.push({ nombre, cantidad: inpCant.value.trim(), fijo: false });
    inpCant.value = "";
    msgPlato.className = "mensaje";
    dibujarIngredientes();
  });

  function crearCarta(plato) {
    const carta = document.createElement("div");
    carta.className = "plato-carta";
    carta.tabIndex = 0;
    carta.setAttribute("role", "button");
    carta.dataset.nombre = plato.nombre;
    carta.dataset.precio = plato.precio;
    if (plato.id) carta.dataset.id = plato.id;
    carta.setAttribute("aria-label", "Ver ingredientes de " + plato.nombre);

    const interior = document.createElement("div");
    interior.className = "plato-carta-interior";

    // Frente
    const frente = document.createElement("div");
    frente.className = "plato-cara plato-frente";
    const img = document.createElement("img");
    img.src = plato.foto;
    img.alt = plato.nombre;
    const pie = document.createElement("div");
    pie.className = "plato-pie";
    const pNombre = document.createElement("strong");
    pNombre.textContent = plato.nombre;
    const pPrecio = document.createElement("span");
    pPrecio.textContent = dinero(plato.precio);
    pie.append(pNombre, pPrecio);
    frente.append(img, pie);

    // Botones Editar / Eliminar (solo para platos guardados en la base de datos)
    if (plato.id) {
      const herramientas = document.createElement("div");
      herramientas.className = "plato-herramientas";
      herramientas.style.cssText = "position:absolute;top:10px;right:10px;z-index:3;display:flex;gap:6px;";
      const estilo = "padding:5px 10px;font-size:11px;font-weight:600;border-radius:8px;cursor:pointer;" +
        "background:rgba(15,15,25,.85);border:1px solid rgba(255,255,255,.25);color:#fff;";

      const bEditar = crearBoton("Editar", "plato-editar", () => abrirModalPlato(plato, carta));
      bEditar.style.cssText = estilo;
      const bEliminar = crearBoton("Eliminar", "plato-eliminar", () => eliminarPlato(plato, carta));
      bEliminar.style.cssText = estilo + "color:#ff6b6b;border-color:rgba(255,107,107,.55);";

      herramientas.append(bEditar, bEliminar);
      frente.appendChild(herramientas);
    }

    // Reverso
    const reverso = document.createElement("div");
    reverso.className = "plato-cara plato-reverso";
    const cab = document.createElement("div");
    cab.className = "plato-reverso-cab";
    const cabTxt = document.createElement("div");
    const h3 = document.createElement("h3");
    h3.textContent = plato.nombre;
    const precio = document.createElement("span");
    precio.className = "plato-precio";
    precio.textContent = dinero(plato.precio);
    cabTxt.append(h3, precio);
    const volver = document.createElement("button");
    volver.type = "button";
    volver.className = "plato-volver";
    volver.textContent = "↺ Volver";
    cab.append(cabTxt, volver);

    const sub = document.createElement("p");
    sub.className = "plato-subtitulo";
    sub.textContent = "Ingredientes";

    const ul = document.createElement("ul");
    ul.className = "plato-ingredientes";
    plato.ingredientes.forEach((ing) => {
      const li = document.createElement("li");
      li.textContent = ing.cantidad ? ing.cantidad + " de " + ing.nombre : ing.nombre;
      if (ing.fijo) li.setAttribute("data-fijo", "");
      ul.appendChild(li);
    });

    const agregar = document.createElement("button");
    agregar.type = "button";
    agregar.className = "btn-agregar plato-agregar";
    agregar.textContent = "+ Agregar al pedido";

    reverso.append(cab, sub, ul, agregar);
    interior.append(frente, reverso);
    carta.appendChild(interior);
    return carta;
  }

  function agregarCartaAlMenu(plato) {
    const carta = crearCarta(plato);
    document.getElementById("platosGrid").appendChild(carta);
    inicializarCarta(carta);
  }

  formPlato.addEventListener("submit", async (e) => {
    e.preventDefault();

    const nombre = inpNombre.value.trim();
    const precio = Number(inpPrecio.value);

    if (!nombre) return msgModal("Escribe el nombre del producto.", "error");
    if (!(precio > 0)) return msgModal("Escribe un precio válido.", "error");
    if (!editandoId && !fotoArchivo) return msgModal("Selecciona una foto del producto.", "error");
    if (!ingElegidos.length) return msgModal("Agrega al menos un ingrediente.", "error");

    const datos = new FormData();
    datos.append("nombre", nombre);
    datos.append("precio", precio);
    datos.append("ingredientes", JSON.stringify(ingElegidos));
    if (fotoArchivo) datos.append("foto", fotoArchivo);   // al editar, la foto es opcional

    const url = editandoId ? "/api/platos/" + editandoId + "/editar" : "/api/platos";
    btnGuardar.disabled = true;

    try {
      const resp = await fetch(url, { method: "POST", body: datos });
      let plato = {};
      try { plato = await resp.json(); } catch (_) {}

      if (!resp.ok) {
        return msgModal(
          plato.error || "Error del servidor (" + resp.status + "). Revisa la terminal de Flask.",
          "error"
        );
      }

      if (editandoId && cartaEditando) {
        const nueva = crearCarta(plato);
        cartaEditando.replaceWith(nueva);
        inicializarCarta(nueva);
        mostrarMensaje(nombre + " actualizado.", "ok");
      } else {
        agregarCartaAlMenu(plato);
        mostrarMensaje(nombre + " agregado al menú.", "ok");
      }
      cerrarModalPlato();
    } catch (err) {
      console.error(err);
      msgModal("No se pudo conectar con el servidor.", "error");
    } finally {
      btnGuardar.disabled = false;
    }
  });

  // Ventana de confirmación propia (Sí / No) para eliminar un plato
  function confirmarEliminar(nombre) {
    return new Promise((resolver) => {
      const fondo = document.createElement("div");
      fondo.className = "modal-fondo abierto";
      fondo.setAttribute("aria-hidden", "false");

      const caja = document.createElement("div");
      caja.className = "modal-caja";
      caja.setAttribute("role", "alertdialog");
      caja.setAttribute("aria-modal", "true");

      const titulo = document.createElement("h3");
      titulo.textContent = "Eliminar producto";

      const texto = document.createElement("p");
      texto.textContent = "¿Estás seguro de que quieres eliminar " + nombre + "? Esta acción no se puede deshacer.";
      texto.style.margin = "8px 0 18px";

      function cerrar(respuesta) {
        document.removeEventListener("keydown", alPresionarTecla);
        fondo.remove();
        resolver(respuesta);
      }
      function alPresionarTecla(e) {
        if (e.key === "Escape") cerrar(false);
      }

      const acciones = document.createElement("div");
      acciones.className = "acciones";
      const botonNo = crearBoton("No", "boton-secundario", () => cerrar(false));
      const botonSi = crearBoton("Sí, eliminar", "boton-peligro", () => cerrar(true));
      acciones.append(botonNo, botonSi);

      fondo.addEventListener("click", (e) => {
        if (e.target === fondo) cerrar(false);
      });
      document.addEventListener("keydown", alPresionarTecla);

      caja.append(titulo, texto, acciones);
      fondo.appendChild(caja);
      document.body.appendChild(fondo);
      botonNo.focus();
    });
  }

  async function eliminarPlato(plato, carta) {
    if (!(await confirmarEliminar(plato.nombre))) return;

    try {
      const resp = await fetch("/api/platos/" + plato.id + "/eliminar", { method: "POST" });
      if (!resp.ok) {
        let d = {};
        try { d = await resp.json(); } catch (_) {}
        return mostrarMensaje(d.error || "No se pudo eliminar el plato.", "error");
      }
      carta.remove();
      mostrarMensaje(plato.nombre + " eliminado del menú.", "ok");
    } catch (err) {
      console.error(err);
      mostrarMensaje("No se pudo conectar con el servidor.", "error");
    }
  }

  // Al cargar la página, traer los platos guardados en la base de datos
  async function cargarPlatos() {
    try {
      const resp = await fetch("/api/platos");
      if (!resp.ok) return;
      const platos = await resp.json();
      platos.forEach(agregarCartaAlMenu);
    } catch (err) {
      console.error("No se pudieron cargar los platos:", err);
    }
  }

  cargarPlatos();

  dibujarPedido();
});